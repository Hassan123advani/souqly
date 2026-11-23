import { LOYALTY, type CheckInStatusDTO, type CoinTransactionDTO } from '@souqly/shared';
import { Types } from 'mongoose';
import { AppError } from '../../lib/AppError';
import { logger } from '../../lib/logger';
import { cursorFilter, cursorSort, paginate } from '../../lib/pagination';
import { User } from '../users/user.model';
import { CheckIn, CoinTransaction, type CoinTransactionLean } from './loyalty.models';

const oid = (s: string | Types.ObjectId) => new Types.ObjectId(String(s));

export type CoinChange = { userId: string | Types.ObjectId; amount: number; reason: string; ref: string; demo?: boolean };

/**
 * Idempotent, atomic coin balance change (same ledger-first pattern as the wallet).
 * `amount` > 0 earns, < 0 spends (only if the balance suffices → 400 INSUFFICIENT_COINS).
 */
export async function changeCoins(input: CoinChange): Promise<{ applied: boolean; balance: number }> {
  if (!Number.isInteger(input.amount) || input.amount === 0) throw new AppError(400, 'INVALID_AMOUNT', 'Invalid coin amount');
  const userId = oid(input.userId);
  let row;
  try {
    row = await CoinTransaction.create({ userId, amount: input.amount, reason: input.reason, ref: input.ref, state: 'pending', demo: !!input.demo });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      const u = await User.findById(userId).select('coins').lean();
      return { applied: false, balance: u?.coins ?? 0 };
    }
    throw err;
  }
  const filter = input.amount < 0 ? { _id: userId, coins: { $gte: -input.amount } } : { _id: userId };
  const user = await User.findOneAndUpdate(filter, { $inc: { coins: input.amount } }, { new: true }).select('coins').lean();
  if (!user) {
    await CoinTransaction.deleteOne({ _id: row._id });
    throw new AppError(400, 'INSUFFICIENT_COINS', 'You do not have enough coins');
  }
  await CoinTransaction.updateOne({ _id: row._id }, { $set: { state: 'done', balanceAfter: user.coins } });
  logger.info({ userId: String(userId), amount: input.amount, reason: input.reason }, 'Coins updated');
  return { applied: true, balance: user.coins };
}

export async function coinBalance(userId: string): Promise<number> {
  return (await User.findById(oid(userId)).select('coins').lean())?.coins ?? 0;
}

export async function coinHistory(userId: string, q: { cursor?: string; limit: number }): Promise<{ items: CoinTransactionDTO[]; nextCursor: string | null }> {
  const rows = await CoinTransaction.find({ userId: oid(userId), state: 'done', ...cursorFilter('_id', -1, q.cursor) })
    .sort(cursorSort('_id', -1))
    .limit(q.limit + 1)
    .lean<CoinTransactionLean[]>();
  const page = paginate(rows, q.limit, '_id');
  return {
    items: page.items.map((t) => ({ id: String(t._id), amount: t.amount, balanceAfter: t.balanceAfter, reason: t.reason, createdAt: t.createdAt.toISOString() })),
    nextCursor: page.nextCursor,
  };
}

// ---------------- Daily check-in (Asia/Karachi calendar days) ----------------
const karachiDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' });
export const dayKey = (d: Date) => karachiDay.format(d);
const previousDay = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};
export const rewardForStreak = (streak: number) => LOYALTY.CHECK_IN_COINS + (streak % LOYALTY.STREAK_LENGTH === 0 ? LOYALTY.STREAK_BONUS_COINS : 0);

async function currentStreak(userId: Types.ObjectId, today: string): Promise<{ todayDone: boolean; streak: number }> {
  const last = await CheckIn.findOne({ userId }).sort({ day: -1 }).lean();
  if (!last) return { todayDone: false, streak: 0 };
  if (last.day === today) return { todayDone: true, streak: last.streak };
  if (last.day === previousDay(today)) return { todayDone: false, streak: last.streak };
  return { todayDone: false, streak: 0 };
}

export async function checkInStatus(userId: string, now = new Date()): Promise<CheckInStatusDTO> {
  const today = dayKey(now);
  const { todayDone, streak } = await currentStreak(oid(userId), today);
  return { checkedInToday: todayDone, streak, nextReward: rewardForStreak(streak + 1), balance: await coinBalance(userId) };
}

/** Once per Karachi calendar day (unique userId+day). Day 7, 14, … of a streak earns a bonus. */
export async function checkIn(userId: string, now = new Date()): Promise<{ coins: number; streak: number; balance: number }> {
  const uid = oid(userId);
  const today = dayKey(now);
  const { todayDone, streak: prev } = await currentStreak(uid, today);
  if (todayDone) throw new AppError(409, 'ALREADY_CHECKED_IN', 'You have already checked in today');
  const streak = prev + 1;
  const coins = rewardForStreak(streak);
  try {
    await CheckIn.create({ userId: uid, day: today, streak, coins });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw new AppError(409, 'ALREADY_CHECKED_IN', 'You have already checked in today');
    throw err;
  }
  const { balance } = await changeCoins({ userId: uid, amount: coins, reason: 'check_in', ref: `checkin:${userId}:${today}` });
  return { coins, streak, balance };
}

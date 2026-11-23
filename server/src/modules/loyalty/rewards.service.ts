import { LOYALTY, type ReferralSummaryDTO } from '@souqly/shared';
import { Types } from 'mongoose';
import { env } from '../../config/env';
import { AppError } from '../../lib/AppError';
import { logger } from '../../lib/logger';
import { audit } from '../audit/audit.service';
import { notifySafe } from '../chat/notifyAdapter';
import type { OrderLean } from '../orders/order.model';
import { User } from '../users/user.model';
import { credit } from '../wallet/wallet.service';
import { changeCoins } from './coins.service';
import { isFlagOn } from './flags';
import { GiftCard, ReferralReward } from './loyalty.models';
import { coinsForOrderTotal } from './redemption';

const oid = (s: string | Types.ObjectId) => new Types.ObjectId(String(s));

/** Coins for a delivered order; idempotent per order (`ref = order:<id>`). */
export async function earnCoinsForOrder(order: Pick<OrderLean, '_id' | 'buyerId' | 'total' | 'number'>): Promise<number> {
  if (!(await isFlagOn('loyaltyCoins'))) return 0;
  const coins = coinsForOrderTotal(order.total);
  if (coins <= 0) return 0;
  const r = await changeCoins({ userId: order.buyerId, amount: coins, reason: 'order', ref: `order:${order._id}` });
  if (r.applied) void notifySafe({ userId: String(order.buyerId), type: 'coins.earned', title: `You earned ${coins} coins`, body: `Thanks for order ${order.number}.`, link: '/account/coins' });
  return r.applied ? coins : 0;
}

/**
 * Referee's first delivered order rewards both sides exactly once (unique ReferralReward.refereeId,
 * plus idempotent wallet / coin refs).
 */
export async function rewardReferral(order: Pick<OrderLean, '_id' | 'buyerId'>): Promise<boolean> {
  if (!(await isFlagOn('referrals'))) return false;
  const referee = await User.findById(order.buyerId).select('referredBy').lean();
  if (!referee?.referredBy || String(referee.referredBy) === String(order.buyerId)) return false;
  try {
    await ReferralReward.create({
      refereeId: order.buyerId,
      referrerId: referee.referredBy,
      orderId: order._id,
      referrerAmount: LOYALTY.REFERRER_WALLET_MINOR,
      refereeCoins: LOYALTY.REFEREE_COINS,
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return false;
    throw err;
  }
  await credit({ userId: referee.referredBy, amount: LOYALTY.REFERRER_WALLET_MINOR, reason: 'referral', ref: `referral:${order.buyerId}:referrer` });
  await changeCoins({ userId: order.buyerId, amount: LOYALTY.REFEREE_COINS, reason: 'referral', ref: `referral:${order.buyerId}:referee` });
  void notifySafe({ userId: String(referee.referredBy), type: 'referral.rewarded', title: 'Referral reward', body: 'Your friend completed their first order. Rs. 200 was added to your wallet.', link: '/account/wallet' });
  void audit({ action: 'referral.rewarded', actorId: null, actorRole: 'system', targetType: 'User', targetId: order.buyerId, meta: { referrerId: String(referee.referredBy), orderId: String(order._id) } });
  return true;
}

/** Order delivered hook (called from transitionOrder). Never throws. */
export async function onOrderDelivered(order: OrderLean): Promise<void> {
  try {
    await earnCoinsForOrder(order);
    await rewardReferral(order);
  } catch (err) {
    logger.error({ err, order: order.number }, 'Delivered-order rewards failed');
  }
}

export async function referralSummary(userId: string): Promise<ReferralSummaryDTO> {
  const u = await User.findById(oid(userId)).select('referralCode').lean();
  if (!u) throw new AppError(404, 'NOT_FOUND', 'User not found');
  const [invited, rewards] = await Promise.all([
    User.countDocuments({ referredBy: u._id }),
    ReferralReward.find({ referrerId: u._id }).select('referrerAmount').lean(),
  ]);
  return {
    code: u.referralCode,
    shareUrl: `${env.CLIENT_URL.replace(/\/$/, '')}/signup?ref=${encodeURIComponent(u.referralCode)}`,
    invited,
    rewarded: rewards.length,
    earned: rewards.reduce((a, r) => a + r.referrerAmount, 0),
  };
}

// ---------------- Gift cards ----------------
/** Single redemption: the card is claimed atomically, then its balance is credited to the wallet. */
export async function redeemGiftCard(userId: string, code: string): Promise<{ amount: number; balance: number }> {
  const now = new Date();
  const card = await GiftCard.findOneAndUpdate(
    { code: code.toUpperCase(), redeemedBy: null, balance: { $gt: 0 }, $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gt: now } }] },
    { $set: { redeemedBy: oid(userId), redeemedAt: now } },
    { new: false },
  ).lean();
  if (!card) throw new AppError(400, 'GIFT_CARD_INVALID', 'This gift card code is invalid, expired or already used');
  await GiftCard.updateOne({ _id: card._id }, { $set: { balance: 0 } });
  const r = await credit({ userId, amount: card.balance, reason: 'gift_card', ref: `giftcard:${card._id}` });
  void audit({ action: 'giftcard.redeemed', actorId: userId, targetType: 'GiftCard', targetId: card._id, meta: { amount: card.balance } });
  return { amount: card.balance, balance: r.balance };
}

function randomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  const s = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  return `SQ-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

export async function createGiftCard(input: { amount: number; code?: string; expiresAt?: Date; createdBy?: string; demo?: boolean }) {
  const code = input.code ?? randomCode();
  try {
    const card = await GiftCard.create({
      code,
      amount: input.amount,
      balance: input.amount,
      ...(input.createdBy ? { createdBy: oid(input.createdBy) } : {}),
      ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
      demo: !!input.demo,
    });
    return { id: String(card._id), code: card.code, amount: card.amount, balance: card.balance, expiresAt: card.expiresAt?.toISOString() ?? null };
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw new AppError(409, 'CODE_TAKEN', 'A gift card with this code already exists');
    throw err;
  }
}

export async function listGiftCards(q: { limit: number }) {
  const rows = await GiftCard.find().sort({ _id: -1 }).limit(q.limit).lean();
  return rows.map((c) => ({
    id: String(c._id),
    code: c.code,
    amount: c.amount,
    balance: c.balance,
    redeemed: !!c.redeemedBy,
    redeemedAt: c.redeemedAt?.toISOString() ?? null,
    expiresAt: c.expiresAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
  }));
}

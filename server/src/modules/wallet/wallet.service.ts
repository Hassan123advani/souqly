import type { WalletTransactionDTO } from '@souqly/shared';
import { Types } from 'mongoose';
import { AppError } from '../../lib/AppError';
import { logger } from '../../lib/logger';
import { cursorFilter, cursorSort, paginate } from '../../lib/pagination';
import { audit } from '../audit/audit.service';
import { User } from '../users/user.model';
import { WalletTransaction, type WalletTransactionLean } from './walletTransaction.model';

export type WalletEntryInput = {
  userId: string | Types.ObjectId;
  /** Positive integer, minor units. */
  amount: number;
  reason: string;
  /** Idempotency key. A second call with the same ref is a no-op returning `applied: false`. */
  ref: string;
  meta?: Record<string, unknown>;
  demo?: boolean;
};
export type WalletResult = { applied: boolean; balance: number; transactionId: string };

const oid = (s: string | Types.ObjectId) => new Types.ObjectId(String(s));

/**
 * Ledger-first, idempotent balance change:
 *  1. claim `ref` by inserting a `pending` ledger row (unique index → duplicates are no-ops),
 *  2. atomically $inc User.walletBalance (debits only when the balance suffices),
 *  3. mark the row `done` with `balanceAfter`.
 * A failed debit removes the claim so the ref can be retried.
 */
async function apply(type: 'credit' | 'debit', input: WalletEntryInput): Promise<WalletResult> {
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new AppError(400, 'INVALID_AMOUNT', 'Amount must be a positive integer');
  const userId = oid(input.userId);
  let row;
  try {
    row = await WalletTransaction.create({
      userId,
      type,
      amount: input.amount,
      reason: input.reason,
      ref: input.ref,
      state: 'pending',
      ...(input.meta ? { meta: input.meta } : {}),
      demo: !!input.demo,
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      const existing = await WalletTransaction.findOne({ ref: input.ref }).lean();
      const u = await User.findById(userId).select('walletBalance').lean();
      return { applied: false, balance: u?.walletBalance ?? 0, transactionId: String(existing?._id ?? '') };
    }
    throw err;
  }
  const filter = type === 'debit' ? { _id: userId, walletBalance: { $gte: input.amount } } : { _id: userId };
  const delta = type === 'debit' ? -input.amount : input.amount;
  const user = await User.findOneAndUpdate(filter, { $inc: { walletBalance: delta } }, { new: true }).select('walletBalance').lean();
  if (!user) {
    await WalletTransaction.deleteOne({ _id: row._id });
    if (type === 'debit') throw new AppError(400, 'INSUFFICIENT_BALANCE', 'Your wallet balance is too low');
    throw new AppError(404, 'NOT_FOUND', 'User not found');
  }
  await WalletTransaction.updateOne({ _id: row._id }, { $set: { state: 'done', balanceAfter: user.walletBalance } });
  logger.info({ userId: String(userId), type, amount: input.amount, reason: input.reason }, 'Wallet updated');
  void audit({ action: `wallet.${type}`, actorId: null, actorRole: 'system', targetType: 'User', targetId: userId, meta: { amount: input.amount, reason: input.reason, ref: input.ref } });
  return { applied: true, balance: user.walletBalance, transactionId: String(row._id) };
}

export const credit = (input: WalletEntryInput) => apply('credit', input);
export const debit = (input: WalletEntryInput) => apply('debit', input);

export async function getBalance(userId: string): Promise<number> {
  const u = await User.findById(oid(userId)).select('walletBalance').lean();
  return u?.walletBalance ?? 0;
}

const toDTO = (t: WalletTransactionLean): WalletTransactionDTO => ({
  id: String(t._id),
  type: t.type,
  amount: t.amount,
  balanceAfter: t.balanceAfter,
  reason: t.reason,
  createdAt: t.createdAt.toISOString(),
});

export async function listTransactions(userId: string, q: { cursor?: string; limit: number }) {
  const rows = await WalletTransaction.find({ userId: oid(userId), state: 'done', ...cursorFilter('_id', -1, q.cursor) })
    .sort(cursorSort('_id', -1))
    .limit(q.limit + 1)
    .lean<WalletTransactionLean[]>();
  const page = paginate(rows, q.limit, '_id');
  return { items: page.items.map(toDTO), nextCursor: page.nextCursor };
}

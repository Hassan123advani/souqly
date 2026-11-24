import { normalizePlan } from '@souqly/shared';
import type { ClientSession, Types } from 'mongoose';
import { isDuplicateKey } from '../../lib/tx';
import { Store } from '../stores/store.model';
import { addMonths } from './period';
import { Subscription, type SubscriptionLean } from './subscription.model';

/**
 * Returns the store's subscription, creating it on first touch: the current plan with a monthly
 * period starting now (existing paid stores are grandfathered for this first period, D-081).
 */
export async function ensureSubscription(storeId: Types.ObjectId, now = new Date()): Promise<SubscriptionLean> {
  const existing = await Subscription.findOne({ storeId }).lean<SubscriptionLean>();
  if (existing) return existing;
  const store = await Store.findById(storeId).select('plan demo').lean();
  const plan = normalizePlan(store?.plan);
  try {
    const created = await Subscription.create({ storeId, plan, currentPeriodStart: now, currentPeriodEnd: addMonths(now, 1), anchorDay: now.getUTCDate(), demo: !!store?.demo });
    return created.toObject() as SubscriptionLean;
  } catch (err) {
    if (!isDuplicateKey(err)) throw err;
    return (await Subscription.findOne({ storeId }).lean<SubscriptionLean>())!;
  }
}

/**
 * Per-store financial lock inside a transaction: bumping `lockVersion` makes any two concurrent
 * transactions of the same store conflict, so one of them retries and sees the other's writes
 * (no overdrawn balance, no double invoice payment). Call `ensureSubscription` before the transaction.
 */
export async function lockStoreFinance(storeId: Types.ObjectId, session: ClientSession): Promise<void> {
  const r = await Subscription.updateOne({ storeId }, { $inc: { lockVersion: 1 } }, { session });
  if (r.matchedCount !== 1) throw new Error(`No subscription for store ${String(storeId)}`);
}

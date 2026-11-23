import { Types } from 'mongoose';
import { logger } from '../../lib/logger';
import { getJobs } from '../../services/jobs';
import { Order } from '../orders/order.model';
import { ReturnRequest } from '../returns/return.model';
import { Store } from '../stores/store.model';

/** Store health score (Phase 10): real operational factors + recommendations. 0–100. */

const DAY = 24 * 3600_000;
export const HEALTH_WINDOW_DAYS = 90;
/** Ship within this many days of placement counts as on time (default product processing time + 1 day grace). */
export const ON_TIME_DAYS = 3;

export type HealthMetrics = {
  orders: number;
  delivered: number;
  cancelled: number;
  shipped: number;
  shippedOnTime: number;
  returns: number;
  ratingAvg: number;
  ratingCount: number;
  responseRate: number;
  responseTimeHours: number;
  policy: { shipping: boolean; returns: boolean; warranty: boolean; phone: boolean; address: boolean; logo: boolean; description: boolean };
};

export type HealthResult = { score: number; factors: { key: string; value: number; weight: number }[]; recommendations: string[] };

const round3 = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 1000) / 1000;

/** Pure scoring (unit-tested). No orders yet → neutral 1.0 for order-based factors. */
export function computeHealth(m: HealthMetrics): HealthResult {
  const closed = m.delivered + m.cancelled;
  const policyKeys = Object.values(m.policy);
  const factors = [
    { key: 'fulfilmentRate', value: closed > 0 ? m.delivered / closed : 1, weight: 0.2 },
    { key: 'onTimeShipRate', value: m.shipped > 0 ? m.shippedOnTime / m.shipped : 1, weight: 0.15 },
    { key: 'cancellationRate', value: m.orders > 0 ? 1 - m.cancelled / m.orders : 1, weight: 0.15 },
    { key: 'returnRate', value: m.delivered > 0 ? 1 - Math.min(1, (m.returns / m.delivered) * 2) : 1, weight: 0.1 },
    { key: 'rating', value: m.ratingCount > 0 ? m.ratingAvg / 5 : 1, weight: 0.15 },
    { key: 'chatResponse', value: (Math.min(100, m.responseRate) / 100) * 0.6 + (1 - Math.min(48, Math.max(0, m.responseTimeHours - 2)) / 46) * 0.4, weight: 0.15 },
    { key: 'policyCompleteness', value: policyKeys.filter(Boolean).length / policyKeys.length, weight: 0.1 },
  ].map((f) => ({ ...f, value: round3(f.value) }));
  const score = Math.round(factors.reduce((s, f) => s + f.value * f.weight, 0) * 100);

  const rec: string[] = [];
  const v = (k: string) => factors.find((f) => f.key === k)!.value;
  if (v('fulfilmentRate') < 0.9) rec.push('Fulfil more orders: keep stock accurate so you do not have to cancel.');
  if (v('onTimeShipRate') < 0.85) rec.push(`Ship within ${ON_TIME_DAYS} days of the order to improve on-time shipping.`);
  if (v('cancellationRate') < 0.95) rec.push('Reduce cancellations: turn on holiday mode when you cannot ship.');
  if (v('returnRate') < 0.8) rec.push('Too many returns: improve photos, size guides and descriptions.');
  if (m.ratingCount > 0 && m.ratingAvg < 4) rec.push('Ratings are below 4: reply to reviews and check product quality.');
  if (m.responseRate < 90 || m.responseTimeHours > 12) rec.push('Reply to buyer chats faster (aim for under 12 hours).');
  if (!m.policy.returns) rec.push('Add a return policy to your store settings.');
  if (!m.policy.shipping) rec.push('Add a shipping policy to your store settings.');
  if (!m.policy.warranty) rec.push('Add a warranty policy (or say "no warranty") in store settings.');
  if (!m.policy.logo || !m.policy.description) rec.push('Complete your store profile: logo and description.');
  if (!m.policy.phone || !m.policy.address) rec.push('Add a contact phone and pickup address.');
  return { score, factors, recommendations: rec.slice(0, 8) };
}

export async function gatherMetrics(storeId: Types.ObjectId): Promise<HealthMetrics> {
  const since = new Date(Date.now() - HEALTH_WINDOW_DAYS * DAY);
  const [store, orders, returns] = await Promise.all([
    Store.findById(storeId).select('ratingAvg ratingCount responseRate responseTimeHours policies contact.phone address.line1 address.city logo description').lean(),
    Order.find({ storeId, channel: { $ne: 'pos' }, createdAt: { $gte: since }, status: { $ne: 'pending_payment' } }).select('status timeline createdAt').lean(),
    ReturnRequest.countDocuments({ storeId, createdAt: { $gte: since } }),
  ]);
  let delivered = 0;
  let cancelled = 0;
  let shipped = 0;
  let shippedOnTime = 0;
  for (const o of orders) {
    const at = (s: string) => o.timeline?.find((t) => t.status === s)?.at;
    if (at('delivered')) delivered++;
    if (o.status === 'cancelled') cancelled++;
    const s = at('shipped');
    if (s) {
      shipped++;
      if (new Date(s).getTime() - new Date(at('placed') ?? o.createdAt).getTime() <= ON_TIME_DAYS * DAY) shippedOnTime++;
    }
  }
  return {
    orders: orders.length,
    delivered,
    cancelled,
    shipped,
    shippedOnTime,
    returns,
    ratingAvg: store?.ratingAvg ?? 0,
    ratingCount: store?.ratingCount ?? 0,
    responseRate: store?.responseRate ?? 100,
    responseTimeHours: store?.responseTimeHours ?? 24,
    policy: {
      shipping: !!store?.policies?.shipping?.trim(),
      returns: !!store?.policies?.returns?.trim(),
      warranty: !!store?.policies?.warranty?.trim(),
      phone: !!store?.contact?.phone,
      address: !!(store?.address?.line1 && store.address.city),
      logo: !!store?.logo?.url,
      description: (store?.description?.trim().length ?? 0) >= 40,
    },
  };
}

export async function recomputeHealth(storeId: Types.ObjectId) {
  const result = computeHealth(await gatherMetrics(storeId));
  const computedAt = new Date();
  await Store.updateOne({ _id: storeId }, { $set: { healthScore: result.score, health: { ...result, computedAt } } });
  return { ...result, computedAt: computedAt.toISOString() };
}

export async function getHealth(storeId: Types.ObjectId) {
  const s = await Store.findById(storeId).select('health').lean();
  if (s?.health?.computedAt && Date.now() - new Date(s.health.computedAt).getTime() < DAY) {
    return { ...s.health, computedAt: new Date(s.health.computedAt).toISOString() };
  }
  return recomputeHealth(storeId);
}

export async function recomputeAllHealth(): Promise<number> {
  let n = 0;
  for await (const s of Store.find({ status: 'approved' }).select('_id').lean().cursor()) {
    try {
      await recomputeHealth(s._id);
      n++;
    } catch (err) {
      logger.warn({ err, storeId: String(s._id) }, 'health recompute failed');
    }
  }
  return n;
}

let started = false;
/** Nightly (every 24 h, in-process) health recompute for all approved stores. */
export function startHealthJobs(): void {
  if (started) return;
  started = true;
  getJobs().every('storeHealth.recompute', DAY, async () => {
    const n = await recomputeAllHealth();
    logger.info({ stores: n }, 'Store health recomputed');
  });
}

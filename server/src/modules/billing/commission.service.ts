import { commissionSplit, type CommissionChannel } from '@souqly/shared';
import { Types, type ClientSession } from 'mongoose';
import { logger } from '../../lib/logger';
import { isDuplicateKey, withTx } from '../../lib/tx';
import { DAY_MS, holdDays } from '../finance/hold';
import { SellerLedger } from '../finance/ledger.model';
import { Order, type OrderLean } from '../orders/order.model';
import { ReturnRequest } from '../returns/return.model';
import { CommissionEntry, type CommissionEntryLean } from './commissionEntry.model';

/**
 * Flat 15% commission ledger (docs/api-billing.md §2, D-079/D-080).
 * - recognizeCommission: one `charge` per delivered sub-order (COD → unpaid receivable; online → deducted
 *   and the seller balance is credited sellerNet in the same transaction).
 * - syncOrderReversals: `reversal` rows for seller-borne return refunds and forced cancels after delivery.
 * Both are idempotent (unique indexes) and are re-run by the billing sweep and on every billing read.
 */

const RECOGNIZABLE = ['delivered', 'return_requested', 'returned', 'refunded', 'cancelled'];

export const channelOf = (o: Pick<OrderLean, 'payment'>): CommissionChannel => (o.payment?.method === 'cod' ? 'cod' : 'online');

/** Commission base: product subtotal − seller-funded discounts (promo + store voucher). Shipping excluded. */
export const commissionBaseOf = (o: Pick<OrderLean, 'subtotal' | 'discounts'>) => Math.max(0, o.subtotal - (o.discounts?.promo ?? 0) - (o.discounts?.store ?? 0));

export const deliveredAtOf = (o: Pick<OrderLean, 'timeline' | 'updatedAt'>): Date | undefined => {
  const t = [...(o.timeline ?? [])].reverse().find((x) => x.status === 'delivered');
  return t ? new Date(t.at) : undefined;
};

const ORDER_FIELDS = 'storeId number subtotal discounts shippingFee total status timeline payment channel updatedAt demo';

/** Creates the commission charge for a delivered order. Returns true when a new charge was written. Never throws. */
export async function recognizeCommission(orderId: Types.ObjectId | string): Promise<boolean> {
  try {
    const o = await Order.findById(orderId).select(ORDER_FIELDS).lean<OrderLean>();
    if (!o || o.channel === 'pos' || !RECOGNIZABLE.includes(o.status)) return false;
    const at = deliveredAtOf(o);
    if (!at) return false;
    if (await CommissionEntry.exists({ orderId: o._id, kind: 'charge' })) return false;
    const channel = channelOf(o);
    const split = commissionSplit(commissionBaseOf(o), o.shippingFee ?? 0);
    const hold = channel === 'online' ? await holdDays() : 0;
    await withTx(async (session) => {
      await CommissionEntry.create(
        [
          {
            storeId: o.storeId,
            orderId: o._id,
            orderNumber: o.number,
            kind: 'charge',
            channel,
            ref: `order:${String(o._id)}`,
            reason: 'delivered',
            base: split.base,
            bps: split.bps,
            amount: split.commission,
            orderTotal: o.total,
            status: channel === 'cod' ? 'unpaid' : 'deducted',
            at,
            settledAt: channel === 'cod' ? null : at,
            demo: !!o.demo,
          },
        ],
        { session },
      );
      // Keep the order snapshot consistent with the recognized (flat) commission.
      await Order.updateOne({ _id: o._id }, { $set: { commission: { bps: split.bps, amount: split.commission }, sellerNet: split.sellerNet } }, { session });
      if (channel === 'online' && split.sellerNet > 0) {
        // Online money is held by Souqly: credit the seller 85% (+ shipping), available after the hold.
        await SellerLedger.updateOne(
          { storeId: o.storeId, ref: `sale:${String(o._id)}` },
          {
            $setOnInsert: {
              storeId: o.storeId,
              type: 'sale',
              amount: split.sellerNet,
              ref: `sale:${String(o._id)}`,
              orderId: o._id,
              orderNumber: o.number,
              commission: { bps: split.bps, amount: split.commission },
              availableAt: new Date(at.getTime() + hold * DAY_MS),
              at,
              demo: !!o.demo,
            },
          },
          { upsert: true, session },
        );
      }
    });
    return true;
  } catch (err) {
    if (isDuplicateKey(err)) return false;
    logger.error({ err, orderId: String(orderId) }, 'Commission recognition failed (retried by the billing sweep)');
    return false;
  }
}

type ReversalPlan = { ref: string; reason: 'return_refund' | 'cancelled_after_delivery'; amount: number | 'rest' };

/** Pure: reversal amount for a partial/full return (integer, floor; full return = everything left). */
export function returnReversalAmount(charge: number, order: { subtotal: number; items: { variantId: unknown; qty: number }[] }, returned: { variantId: unknown; qty: number; price: number }[]): number | 'rest' {
  const ordered = new Map<string, number>();
  for (const i of order.items) ordered.set(String(i.variantId), (ordered.get(String(i.variantId)) ?? 0) + i.qty);
  const back = new Map<string, number>();
  for (const i of returned) back.set(String(i.variantId), (back.get(String(i.variantId)) ?? 0) + i.qty);
  const full = [...ordered.entries()].every(([v, q]) => (back.get(v) ?? 0) >= q);
  if (full) return 'rest';
  if (order.subtotal <= 0) return 0;
  const value = Math.min(order.subtotal, returned.reduce((s, i) => s + i.price * i.qty, 0));
  return Math.floor((charge * value) / order.subtotal);
}

async function writeReversal(charge: CommissionEntryLean, plan: ReversalPlan, amount: number, at: Date): Promise<boolean> {
  try {
    await withTx(async (session: ClientSession) => {
      const fresh = await CommissionEntry.findById(charge._id).session(session).lean<CommissionEntryLean>();
      if (!fresh) return;
      // COD receivable not billed yet → the reversal offsets it on the same next invoice.
      // Already invoiced/paid → give it back to the seller's balance now. Online → informational (ledger refund handles money).
      const status = fresh.channel === 'online' ? 'deducted' : fresh.status === 'unpaid' ? 'unpaid' : 'credited';
      const [rev] = await CommissionEntry.create(
        [
          {
            storeId: fresh.storeId,
            orderId: fresh.orderId,
            orderNumber: fresh.orderNumber,
            kind: 'reversal',
            channel: fresh.channel,
            ref: plan.ref,
            reason: plan.reason,
            base: 0,
            bps: fresh.bps,
            amount: -amount,
            orderTotal: fresh.orderTotal,
            status,
            chargeId: fresh._id,
            at,
            settledAt: status === 'unpaid' ? null : at,
            demo: !!fresh.demo,
          },
        ],
        { session },
      );
      if (status === 'credited') await creditCommissionBack(fresh.storeId, rev!._id, plan.ref, amount, at, fresh.orderId, fresh.orderNumber, session, !!fresh.demo);
    });
    return true;
  } catch (err) {
    if (isDuplicateKey(err)) return false;
    throw err;
  }
}

/** Seller ledger credit for a reversal of commission that was already billed. */
export async function creditCommissionBack(storeId: Types.ObjectId, reversalId: Types.ObjectId, ref: string, amount: number, at: Date, orderId: Types.ObjectId, orderNumber: string, session: ClientSession, demo = false) {
  await SellerLedger.create(
    [{ storeId, type: 'commission_credit', amount, ref: `commission_credit:${ref}`.slice(0, 80), orderId, orderNumber, availableAt: at, at, demo }],
    { session },
  );
  await CommissionEntry.updateOne({ _id: reversalId }, { $set: { status: 'credited', settledAt: at } }, { session });
}

/** Writes any missing reversals for one order (idempotent). Never throws. */
export async function syncOrderReversals(orderId: Types.ObjectId | string): Promise<number> {
  try {
    const charge = await CommissionEntry.findOne({ orderId: new Types.ObjectId(String(orderId)), kind: 'charge' }).lean<CommissionEntryLean>();
    if (!charge) return 0;
    const [order, reversals, returns] = await Promise.all([
      Order.findById(charge.orderId).select('subtotal items status timeline').lean<OrderLean>(),
      CommissionEntry.find({ chargeId: charge._id }).select('ref amount').lean(),
      ReturnRequest.find({ orderId: charge.orderId, status: 'refunded', 'refund.amount': { $gt: 0 } }).select('items refund').lean(),
    ]);
    if (!order) return 0;
    const done = new Set(reversals.map((r) => r.ref));
    let remaining = charge.amount + reversals.reduce((s, r) => s + r.amount, 0);
    const plans: (ReversalPlan & { at: Date })[] = [];
    for (const r of returns) {
      plans.push({ ref: `return:${String(r._id)}`, reason: 'return_refund', amount: returnReversalAmount(charge.amount, order, r.items), at: r.refund.at ?? new Date() });
    }
    if (order.status === 'cancelled') {
      const at = [...order.timeline].reverse().find((t) => t.status === 'cancelled')?.at ?? new Date();
      plans.push({ ref: `cancel:${String(order._id)}`, reason: 'cancelled_after_delivery', amount: 'rest', at });
    }
    let written = 0;
    for (const p of plans) {
      if (done.has(p.ref) || remaining <= 0) continue;
      const amount = p.amount === 'rest' ? remaining : Math.min(p.amount, remaining);
      if (amount <= 0) continue;
      if (await writeReversal(charge, p, amount, p.at)) {
        remaining -= amount;
        written++;
      }
    }
    return written;
  } catch (err) {
    logger.error({ err, orderId: String(orderId) }, 'Commission reversal sync failed (retried by the billing sweep)');
    return 0;
  }
}

/**
 * Re-derives missing charges and reversals for a store (or every store when omitted). The hooks on
 * delivery / refund / cancel do the real work; this is the safety net. The global (sweep) pass only looks
 * at orders and returns touched in the last `windowDays` so it stays fast on large databases.
 */
export async function syncCommissions(storeId?: Types.ObjectId, windowDays = 45): Promise<{ charges: number; reversals: number }> {
  const scope = storeId ? { storeId } : { updatedAt: { $gte: new Date(Date.now() - windowDays * 86_400_000) } };
  let charges = 0;
  let reversals = 0;
  const delivered = await Order.find({ ...scope, channel: { $ne: 'pos' }, status: { $in: RECOGNIZABLE }, 'timeline.status': 'delivered' }).select('_id').lean();
  const deliveredIds = delivered.map((o) => o._id);
  const known = new Set((await CommissionEntry.find({ orderId: { $in: deliveredIds }, kind: 'charge' }).select('orderId').lean()).map((c) => String(c.orderId)));
  for (const o of delivered) if (!known.has(String(o._id)) && (await recognizeCommission(o._id))) charges++;

  const chargedIds = deliveredIds;
  const refundedOrders = await ReturnRequest.distinct('orderId', { ...scope, status: 'refunded', orderId: { $in: chargedIds } });
  const cancelled = await Order.distinct('_id', { _id: { $in: chargedIds }, status: 'cancelled' });
  for (const id of new Set([...refundedOrders, ...cancelled].map(String))) reversals += await syncOrderReversals(id);
  return { charges, reversals };
}

import { MIN_PAYOUT_MINOR, formatMoney } from '@souqly/shared';
import type { Request } from 'express';
import { Types, type AnyBulkWriteOperation } from 'mongoose';
import { AppError, notFound } from '../../lib/AppError';
import { logger } from '../../lib/logger';
import { cursorFilter, cursorSort, paginate } from '../../lib/pagination';
import { audit } from '../audit/audit.service';
import { maskPayout, type StoredPayout } from '../onboarding/sensitive';
import { Order, type OrderLean } from '../orders/order.model';
import { Payout, type PayoutLean } from '../payouts/payout.model';
import { ReturnRequest } from '../returns/return.model';
import { getSetting } from '../settings/settings.service';
import { Store } from '../stores/store.model';
import { SellerLedger, type ISellerLedger, type LedgerType, type SellerLedgerLean } from './ledger.model';

const DAY = 24 * 3600_000;
export const DEFAULT_HOLD_DAYS = 7;
/** Orders whose sale stays credited (refunds are separate debits from the Return documents). */
const DELIVERED_STATES = ['delivered', 'return_requested', 'returned', 'refunded'];

export async function holdDays(): Promise<number> {
  const v = await getSetting<number>('financeHoldDays').catch(() => undefined);
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 60 ? v : DEFAULT_HOLD_DAYS;
}

type Entry = Omit<ISellerLedger, 'createdAt' | 'demo'> & { demo?: boolean };

/** Idempotent upsert of ledger entries by (storeId, ref). Returns how many were new. */
export async function writeLedger(entries: Entry[]): Promise<number> {
  if (!entries.length) return 0;
  const ops: AnyBulkWriteOperation<ISellerLedger>[] = entries.map((e) => ({
    updateOne: { filter: { storeId: e.storeId, ref: e.ref }, update: { $setOnInsert: e }, upsert: true },
  }));
  const r = await SellerLedger.bulkWrite(ops, { ordered: false });
  return r.upsertedCount;
}

const deliveredAt = (o: Pick<OrderLean, 'timeline' | 'updatedAt'>) =>
  [...(o.timeline ?? [])].reverse().find((t) => t.status === 'delivered')?.at ?? o.updatedAt ?? new Date();

function saleEntry(o: OrderLean, hold: number): Entry {
  const at = new Date(deliveredAt(o));
  return {
    storeId: o.storeId,
    type: 'sale',
    amount: o.sellerNet,
    ref: `sale:${String(o._id)}`,
    orderId: o._id,
    orderNumber: o.number,
    commission: { bps: o.commission?.bps ?? 0, amount: o.commission?.amount ?? 0 },
    availableAt: new Date(at.getTime() + hold * DAY),
    at,
  };
}

/** Order delivered hook: credits the seller (online orders only; POS cash never passes through Souqly). Never throws. */
export async function ledgerOnDelivered(order: OrderLean): Promise<void> {
  try {
    if (order.channel === 'pos' || order.sellerNet <= 0) return;
    await writeLedger([saleEntry(order, await holdDays())]);
  } catch (err) {
    logger.error({ err, order: order.number }, 'Ledger write on delivery failed (reconciled on next finance read)');
  }
}

/**
 * Re-derives missing ledger entries from orders, refunded returns and payouts (idempotent). Runs on
 * every finance read so events written outside the hooks (admin refunds, payout reviews) always land.
 */
export async function reconcileLedger(storeId: Types.ObjectId): Promise<void> {
  const hold = await holdDays();
  const existing = new Set((await SellerLedger.find({ storeId }).select('ref').lean()).map((e) => e.ref));
  const entries: Entry[] = [];

  const orders = await Order.find({ storeId, channel: { $ne: 'pos' }, status: { $in: DELIVERED_STATES }, 'timeline.status': 'delivered', sellerNet: { $gt: 0 } })
    .select('storeId number sellerNet commission timeline updatedAt total channel')
    .lean<OrderLean[]>();
  for (const o of orders) if (!existing.has(`sale:${String(o._id)}`)) entries.push(saleEntry(o, hold));

  const refunds = await ReturnRequest.find({ storeId, status: 'refunded', 'refund.amount': { $gt: 0 } }).select('orderId refund').lean();
  if (refunds.length) {
    const ords = new Map(
      (await Order.find({ _id: { $in: refunds.map((r) => r.orderId) }, storeId }).select('number total sellerNet').lean()).map((o) => [String(o._id), o]),
    );
    for (const r of refunds) {
      const o = ords.get(String(r.orderId));
      if (!o || existing.has(`refund:${String(r._id)}`)) continue;
      // Seller bears the refund pro rata of what they earned on the order (commission share is returned too).
      const debit = o.total > 0 ? Math.min(o.sellerNet, Math.round((r.refund.amount * o.sellerNet) / o.total)) : 0;
      if (debit <= 0) continue;
      const at = r.refund.at ?? new Date();
      entries.push({ storeId, type: 'refund', amount: -debit, ref: `refund:${String(r._id)}`, orderId: o._id, orderNumber: o.number, returnId: r._id, availableAt: at, at });
    }
  }

  const payouts = await Payout.find({ storeId }).select('amount status createdAt rejectedAt').lean<PayoutLean[]>();
  for (const p of payouts) {
    if (!existing.has(`payout:${String(p._id)}`)) entries.push({ storeId, type: 'payout', amount: -p.amount, ref: `payout:${String(p._id)}`, payoutId: p._id, availableAt: p.createdAt, at: p.createdAt });
    if (p.status === 'rejected' && !existing.has(`payout_reversal:${String(p._id)}`)) {
      const at = p.rejectedAt ?? new Date();
      entries.push({ storeId, type: 'payout_reversal', amount: p.amount, ref: `payout_reversal:${String(p._id)}`, payoutId: p._id, availableAt: at, at });
    }
  }
  await writeLedger(entries);
}

export type FinanceSummary = { available: number; onHold: number; pendingPayouts: number; lifetime: number; paidOut: number; refunds: number; holdDays: number; minPayout: number; currency: 'PKR' };

/** Pure balance math over ledger rows (unit-tested). */
export function computeBalance(rows: Pick<ISellerLedger, 'type' | 'amount' | 'availableAt'>[], now = new Date()) {
  let total = 0;
  let onHold = 0;
  let lifetime = 0;
  let refunds = 0;
  for (const r of rows) {
    total += r.amount;
    if (r.type === 'sale') {
      lifetime += r.amount;
      if (r.availableAt > now) onHold += r.amount;
    }
    if (r.type === 'refund') refunds += -r.amount;
  }
  return { available: total - onHold, onHold, lifetime, refunds };
}

export async function financeSummary(storeId: Types.ObjectId): Promise<FinanceSummary> {
  await reconcileLedger(storeId);
  const [rows, payoutAgg, hold] = await Promise.all([
    SellerLedger.find({ storeId }).select('type amount availableAt').lean(),
    Payout.aggregate<{ _id: string; n: number }>([{ $match: { storeId } }, { $group: { _id: '$status', n: { $sum: '$amount' } } }]),
    holdDays(),
  ]);
  const b = computeBalance(rows);
  const by = (s: string) => payoutAgg.find((p) => p._id === s)?.n ?? 0;
  return { ...b, pendingPayouts: by('requested') + by('approved'), paidOut: by('paid'), holdDays: hold, minPayout: MIN_PAYOUT_MINOR, currency: 'PKR' };
}

const entryDTO = (e: SellerLedgerLean) => ({
  id: String(e._id),
  type: e.type,
  amount: e.amount,
  ref: e.ref,
  orderId: e.orderId ? String(e.orderId) : null,
  orderNumber: e.orderNumber ?? null,
  payoutId: e.payoutId ? String(e.payoutId) : null,
  commission: e.commission ?? null,
  availableAt: e.availableAt.toISOString(),
  at: e.at.toISOString(),
});

export async function listTransactions(storeId: Types.ObjectId, q: { cursor?: string; limit: number; type?: LedgerType }) {
  await reconcileLedger(storeId);
  const rows = await SellerLedger.find({ storeId, ...(q.type ? { type: q.type } : {}), ...cursorFilter('at', -1, q.cursor) })
    .sort(cursorSort('at', -1))
    .limit(q.limit + 1)
    .lean<SellerLedgerLean[]>();
  const page = paginate(rows, q.limit, 'at');
  return { items: page.items.map(entryDTO), nextCursor: page.nextCursor };
}

export async function orderCommission(storeId: Types.ObjectId, orderId: string) {
  const o = await Order.findOne({ _id: new Types.ObjectId(orderId), storeId }).select('number subtotal discounts shippingFee commission sellerNet total channel status').lean();
  if (!o) throw notFound('Order');
  return {
    orderId,
    number: o.number,
    channel: o.channel,
    status: o.status,
    subtotal: o.subtotal,
    promo: o.discounts?.promo ?? 0,
    storeDiscount: o.discounts?.store ?? 0,
    platformDiscount: o.discounts?.platform ?? 0,
    shipping: o.shippingFee,
    commissionBase: Math.max(0, o.subtotal - (o.discounts?.promo ?? 0) - (o.discounts?.store ?? 0)),
    commissionBps: o.commission?.bps ?? 0,
    commission: o.commission?.amount ?? 0,
    sellerNet: o.sellerNet,
  };
}

const payoutDTO = (p: PayoutLean) => ({
  id: String(p._id),
  amount: p.amount,
  status: p.status,
  method: p.method,
  reference: p.reference ?? null,
  createdAt: p.createdAt.toISOString(),
  paidAt: p.paidAt?.toISOString() ?? null,
  rejectedAt: p.rejectedAt?.toISOString() ?? null,
});

export async function listPayouts(storeId: Types.ObjectId, q: { cursor?: string; limit: number }) {
  const rows = await Payout.find({ storeId, ...cursorFilter('_id', -1, q.cursor) }).sort({ _id: -1 }).limit(q.limit + 1).lean<PayoutLean[]>();
  const page = paginate(rows, q.limit, '_id');
  return { items: page.items.map(payoutDTO), nextCursor: page.nextCursor };
}

/**
 * Seller payout request. Must be ≥ Rs. 1,000 and ≤ available. The debit is written to the ledger
 * immediately; if a concurrent request overdrew the balance, this one is rolled back (409).
 */
export async function requestPayout(req: Request, amount: number) {
  const storeId = req.store!._id;
  if (amount < MIN_PAYOUT_MINOR) throw new AppError(400, 'BELOW_MINIMUM', `The minimum payout is ${formatMoney(MIN_PAYOUT_MINOR)}`);
  const store = await Store.findById(storeId).select('+payout').lean();
  const masked = maskPayout(store?.payout as Partial<StoredPayout> | undefined);
  if (!masked) throw new AppError(409, 'NO_PAYOUT_METHOD', 'Add your payout account in store settings first');
  const before = await financeSummary(storeId);
  if (amount > before.available) throw new AppError(400, 'INSUFFICIENT_BALANCE', 'Amount is more than your available balance', { available: before.available });

  const payout = await Payout.create({
    storeId,
    amount,
    status: 'requested',
    method: { type: masked.method, ...(masked.bankName ? { bankName: masked.bankName } : {}), accountTitle: masked.accountTitle, accountMasked: masked.accountNumber },
    requestedBy: new Types.ObjectId(req.user!.id),
  });
  await writeLedger([{ storeId, type: 'payout', amount: -amount, ref: `payout:${String(payout._id)}`, payoutId: payout._id, availableAt: payout.createdAt, at: payout.createdAt }]);
  const rows = await SellerLedger.find({ storeId }).select('type amount availableAt').lean();
  if (computeBalance(rows).available < 0) {
    await Promise.all([Payout.deleteOne({ _id: payout._id }), SellerLedger.deleteOne({ storeId, ref: `payout:${String(payout._id)}` })]);
    throw new AppError(409, 'INSUFFICIENT_BALANCE', 'Your balance changed. Please try again.');
  }
  await audit({ action: 'store.payout_requested', targetType: 'Payout', targetId: payout._id, meta: { amount }, req });
  return payoutDTO(payout.toObject() as PayoutLean);
}

// ---------------- monthly statement ----------------
export async function statement(storeId: Types.ObjectId, month: string) {
  await reconcileLedger(storeId);
  const from = new Date(`${month}-01T00:00:00.000Z`);
  const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
  const [openingRow, rows] = await Promise.all([
    SellerLedger.aggregate<{ n: number }>([{ $match: { storeId, at: { $lt: from } } }, { $group: { _id: null, n: { $sum: '$amount' } } }]),
    SellerLedger.find({ storeId, at: { $gte: from, $lt: to } }).sort({ at: 1, _id: 1 }).limit(5000).lean<SellerLedgerLean[]>(),
  ]);
  const opening = openingRow[0]?.n ?? 0;
  const totals = { sales: 0, commission: 0, refunds: 0, payouts: 0, reversals: 0 };
  for (const r of rows) {
    if (r.type === 'sale') {
      totals.sales += r.amount;
      totals.commission += r.commission?.amount ?? 0;
    } else if (r.type === 'refund') totals.refunds += -r.amount;
    else if (r.type === 'payout') totals.payouts += -r.amount;
    else totals.reversals += r.amount;
  }
  const closing = opening + rows.reduce((a, r) => a + r.amount, 0);
  return { month, from: from.toISOString(), to: to.toISOString(), opening, closing, totals, entries: rows.map(entryDTO) };
}

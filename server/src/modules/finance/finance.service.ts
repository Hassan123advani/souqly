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
import { Store } from '../stores/store.model';
import { withTx } from '../../lib/tx';
import { syncCommissions, recognizeCommission } from '../billing/commission.service';
import { ensureSubscription, lockStoreFinance } from '../billing/subscription.service';
import { computeBalance, holdDays } from './hold';
import { SellerLedger, type ISellerLedger, type LedgerType, type SellerLedgerLean } from './ledger.model';

export { computeBalance, holdDays, DEFAULT_HOLD_DAYS } from './hold';

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

/**
 * Order delivered hook: recognizes the flat 15% commission (docs/api-billing.md §2). Online orders also
 * credit the seller balance (sellerNet) in the same transaction; COD orders only create a receivable
 * (the seller already holds the cash). POS sales are never in the ledger. Never throws.
 */
export async function ledgerOnDelivered(order: Pick<OrderLean, '_id' | 'number'>): Promise<void> {
  try {
    await recognizeCommission(order._id);
  } catch (err) {
    logger.error({ err, order: order.number }, 'Commission recognition on delivery failed (reconciled on next finance read)');
  }
}

/**
 * Re-derives missing ledger entries from orders, refunded returns and payouts (idempotent). Runs on
 * every finance read so events written outside the hooks (admin refunds, payout reviews) always land.
 */
export async function reconcileLedger(storeId: Types.ObjectId): Promise<void> {
  // Sale credits (online only) and commission credits are written by the commission ledger (billing).
  await syncCommissions(storeId);
  const existing = new Set((await SellerLedger.find({ storeId }).select('ref').lean()).map((e) => e.ref));
  const entries: Entry[] = [];

  const refunds = await ReturnRequest.find({ storeId, status: 'refunded', 'refund.amount': { $gt: 0 } }).select('orderId refund').lean();
  if (refunds.length) {
    const ords = new Map(
      (await Order.find({ _id: { $in: refunds.map((r) => r.orderId) }, storeId }).select('number total sellerNet payment').lean()).map((o) => [String(o._id), o]),
    );
    for (const r of refunds) {
      const o = ords.get(String(r.orderId));
      if (!o || existing.has(`refund:${String(r._id)}`)) continue;
      // COD: the seller holds the buyer's cash, so the whole refund Souqly paid the buyer is owed back (the
      // commission share comes back separately as a commission reversal). Online: the seller bears the refund
      // pro rata of what they were credited (commission share is absorbed by the platform).
      const debit =
        o.payment?.method === 'cod'
          ? Math.min(o.total, r.refund.amount)
          : o.total > 0
            ? Math.min(o.sellerNet, Math.round((r.refund.amount * o.sellerNet) / o.total))
            : 0;
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

export async function financeSummary(storeId: Types.ObjectId): Promise<FinanceSummary> {
  await reconcileLedger(storeId);
  return balanceSnapshot(storeId);
}

/** Balance from the ledger as written (no reconcile): the cheap read path for frequently polled screens. */
export async function balanceSnapshot(storeId: Types.ObjectId): Promise<FinanceSummary> {
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
 * Seller payout request. Must be ≥ Rs. 1,000 and ≤ available. Payout + ledger debit are written in one
 * transaction under the store finance lock, after re-checking the balance (no concurrent overdraw, D-078).
 */
export async function requestPayout(req: Request, amount: number) {
  const storeId = req.store!._id;
  if (amount < MIN_PAYOUT_MINOR) throw new AppError(400, 'BELOW_MINIMUM', `The minimum payout is ${formatMoney(MIN_PAYOUT_MINOR)}`);
  const store = await Store.findById(storeId).select('+payout').lean();
  const masked = maskPayout(store?.payout as Partial<StoredPayout> | undefined);
  if (!masked) throw new AppError(409, 'NO_PAYOUT_METHOD', 'Add your payout account in store settings first');
  const before = await financeSummary(storeId);
  if (amount > before.available) throw new AppError(400, 'INSUFFICIENT_BALANCE', 'Amount is more than your available balance', { available: before.available });
  await ensureSubscription(storeId);

  const payout = await withTx(async (session) => {
    await lockStoreFinance(storeId, session);
    const rows = await SellerLedger.find({ storeId }).select('type amount availableAt').session(session).lean();
    if (amount > computeBalance(rows).available) throw new AppError(409, 'INSUFFICIENT_BALANCE', 'Your balance changed. Please try again.');
    const [p] = await Payout.create(
      [
        {
          storeId,
          amount,
          status: 'requested',
          method: { type: masked.method, ...(masked.bankName ? { bankName: masked.bankName } : {}), accountTitle: masked.accountTitle, accountMasked: masked.accountNumber },
          requestedBy: new Types.ObjectId(req.user!.id),
        },
      ],
      { session },
    );
    await SellerLedger.create([{ storeId, type: 'payout', amount: -amount, ref: `payout:${String(p!._id)}`, payoutId: p!._id, availableAt: p!.createdAt, at: p!.createdAt }], { session });
    return p!;
  });
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
  const totals = { sales: 0, commission: 0, refunds: 0, payouts: 0, reversals: 0, invoicePayments: 0, commissionCredits: 0, balanceTransfers: 0 };
  for (const r of rows) {
    if (r.type === 'sale') {
      totals.sales += r.amount;
      totals.commission += r.commission?.amount ?? 0;
    } else if (r.type === 'refund') totals.refunds += -r.amount;
    else if (r.type === 'payout') totals.payouts += -r.amount;
    else if (r.type === 'invoice_payment') totals.invoicePayments += -r.amount;
    else if (r.type === 'commission_credit') totals.commissionCredits += r.amount;
    else if (r.type === 'balance_transfer') totals.balanceTransfers += r.amount;
    else totals.reversals += r.amount;
  }
  const closing = opening + rows.reduce((a, r) => a + r.amount, 0);
  return { month, from: from.toISOString(), to: to.toISOString(), opening, closing, totals, entries: rows.map(entryDTO) };
}

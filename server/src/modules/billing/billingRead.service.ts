import {
  PLANS,
  PLATFORM_COMMISSION_BPS,
  normalizePlan,
  type AdminBillingOverviewDTO,
  type AdminBillingStoreDetailDTO,
  type AdminBillingStoreRowDTO,
  type BillingAdjustmentDTO,
  type BillingReportRowDTO,
  type BillingSummaryDTO,
  type CommissionEntryDTO,
  type InvoiceDTO,
  type InvoiceDetailDTO,
  type InvoicePaymentDTO,
  type PaymentOptionsDTO,
  type PlansCatalogDTO,
  type StorePlan,
} from '@souqly/shared';
import { Types } from 'mongoose';
import { notFound } from '../../lib/AppError';
import { cursorFilter, cursorSort, paginate } from '../../lib/pagination';
import { escapeRegex } from '../../lib/text';
import { isStripeConfigured } from '../../services/payment/stripe';
import { Product } from '../catalog/product.model';
import { balanceSnapshot, financeSummary, throttledSync } from '../finance/finance.service';
import { Payout } from '../payouts/payout.model';
import { Store } from '../stores/store.model';
import { StoreMember } from '../stores/storeMember.model';
import { BillingAdjustment, type BillingAdjustmentLean } from './adjustment.model';
import { commissionDTO, getBillingSettings, invoiceDTO, subscriptionDTO } from './billing.service';
import { BillingPayment, type BillingPaymentLean } from './billingPayment.model';
import { paymentDTO } from './billingPayments.service';
import { syncCommissions } from './commission.service';
import { CommissionEntry, type CommissionEntryLean } from './commissionEntry.model';
import { Invoice, amountDue, type InvoiceLean } from './invoice.model';
import { Subscription, type SubscriptionLean } from './subscription.model';
import { ensureSubscription } from './subscription.service';

const oid = (s: string | Types.ObjectId) => new Types.ObjectId(String(s));
const iso = (d?: Date | null) => (d ? new Date(d).toISOString() : null);
type Page = { cursor?: string; limit: number };

async function invoiceNumbers(entries: { invoiceId?: Types.ObjectId | null }[]) {
  const ids = [...new Set(entries.filter((e) => e.invoiceId).map((e) => String(e.invoiceId)))].map(oid);
  if (!ids.length) return new Map<string, string>();
  return new Map((await Invoice.find({ _id: { $in: ids } }).select('number').lean()).map((i) => [String(i._id), i.number]));
}

/** Commission totals per status/channel for one store (or all stores). */
export async function commissionTotals(match: Record<string, unknown> = {}) {
  const rows = await CommissionEntry.aggregate<{ _id: { channel: string; status: string; kind: string }; amount: number; base: number; total: number }>([
    { $match: match },
    { $group: { _id: { channel: '$channel', status: '$status', kind: '$kind' }, amount: { $sum: '$amount' }, base: { $sum: '$base' }, total: { $sum: '$orderTotal' } } },
  ]);
  const t = { grossSales: 0, codSales: 0, onlineSales: 0, commissionBase: 0, totalCommission: 0, paidCommission: 0, unpaidCodCommission: 0, onlineCommission: 0, codCommission: 0, reversed: 0 };
  for (const r of rows) {
    t.totalCommission += r.amount;
    if (r._id.channel === 'online') t.onlineCommission += r.amount;
    else t.codCommission += r.amount;
    if (r._id.kind === 'charge') {
      t.grossSales += r.total;
      t.commissionBase += r.base;
      if (r._id.channel === 'cod') t.codSales += r.total;
      else t.onlineSales += r.total;
    } else t.reversed += -r.amount;
    if (['paid', 'deducted', 'credited'].includes(r._id.status)) t.paidCommission += r.amount;
    if (r._id.channel === 'cod' && ['unpaid', 'invoiced'].includes(r._id.status)) t.unpaidCodCommission += r.amount;
  }
  return t;
}

export async function planUsage(storeId: Types.ObjectId): Promise<PlansCatalogDTO['usage']> {
  const [products, liveProducts, staff, store] = await Promise.all([
    Product.countDocuments({ storeId, deletedAt: { $exists: false } }),
    Product.countDocuments({ storeId, deletedAt: { $exists: false }, status: { $in: ['published', 'pending_review'] } }),
    StoreMember.countDocuments({ storeId, role: { $ne: 'OWNER' } }),
    Store.findById(storeId).select('sections layoutTemplate').lean(),
  ]);
  return { products, liveProducts, staff, sections: store?.sections?.length ?? 0, layoutTemplate: store?.layoutTemplate ?? 'classic' };
}

export async function plansCatalog(storeId: Types.ObjectId, plan: StorePlan | undefined): Promise<PlansCatalogDTO> {
  return { current: normalizePlan(plan), commissionBps: PLATFORM_COMMISSION_BPS, plans: Object.values(PLANS), usage: await planUsage(storeId) };
}

export { throttledSync };

export async function sellerSummary(storeId: Types.ObjectId): Promise<BillingSummaryDTO> {
  await throttledSync(storeId);
  const [subscription, totals, finance, settings, open, unpaid] = await Promise.all([
    subscriptionDTO(storeId),
    commissionTotals({ storeId }),
    balanceSnapshot(storeId),
    getBillingSettings(),
    Invoice.find({ storeId, status: { $in: ['open', 'overdue'] } }).sort({ dueDate: 1 }).lean<InvoiceLean[]>(),
    CommissionEntry.aggregate<{ n: number }>([{ $match: { storeId, channel: 'cod', status: 'unpaid' } }, { $group: { _id: null, n: { $sum: '$amount' } } }]),
  ]);
  const nextPlan = subscription.scheduledChange?.plan ?? subscription.plan;
  const fee = PLANS[nextPlan].priceMinor;
  const commission = Math.max(0, unpaid[0]?.n ?? 0);
  const balanceRecovery = finance.available < 0 ? -finance.available : 0;
  return {
    subscription,
    plan: PLANS[subscription.plan],
    nextInvoiceEstimate: { date: subscription.currentPeriodEnd, plan: nextPlan, fee, commission, balanceRecovery, total: fee + commission + balanceRecovery },
    outstanding: {
      invoices: open.length,
      amountDue: open.reduce((s, i) => s + amountDue(i), 0),
      overdue: open.filter((i) => i.status === 'overdue').reduce((s, i) => s + amountDue(i), 0),
      nextDueDate: iso(open[0]?.dueDate),
    },
    totals: {
      grossSales: totals.grossSales,
      codSales: totals.codSales,
      onlineSales: totals.onlineSales,
      commissionBase: totals.commissionBase,
      totalCommission: totals.totalCommission,
      paidCommission: totals.paidCommission,
      unpaidCodCommission: totals.unpaidCodCommission,
      availableBalance: finance.available,
      onHold: finance.onHold,
      pendingPayouts: finance.pendingPayouts,
    },
    commissionBps: PLATFORM_COMMISSION_BPS,
    graceDays: settings.graceDays,
    currency: 'PKR' as const,
  };
}

export async function paymentOptions(storeId: Types.ObjectId): Promise<PaymentOptionsDTO> {
  await throttledSync(storeId);
  const [finance, settings] = await Promise.all([balanceSnapshot(storeId), getBillingSettings()]);
  return { balance: { available: finance.available }, manualAccounts: settings.manualAccounts, gateways: { stripe: isStripeConfigured(), jazzcash: false, easypaisa: false } };
}

async function pendingPaymentsFor(invoiceIds: Types.ObjectId[]) {
  const rows = await BillingPayment.find({ invoiceId: { $in: invoiceIds }, status: 'pending' }).select('invoiceId method createdAt').lean();
  return new Map(rows.map((p) => [String(p.invoiceId), p]));
}

export async function listInvoices(filter: Record<string, unknown>, q: Page, withStore = false): Promise<{ items: InvoiceDTO[]; nextCursor: string | null }> {
  const rows = await Invoice.find({ ...filter, ...cursorFilter('issuedAt', -1, q.cursor) }).sort(cursorSort('issuedAt', -1)).limit(q.limit + 1).lean<InvoiceLean[]>();
  const page = paginate(rows, q.limit, 'issuedAt');
  const pending = await pendingPaymentsFor(page.items.map((i) => i._id));
  const stores = withStore ? new Map((await Store.find({ _id: { $in: page.items.map((i) => i.storeId) } }).select('name slug').lean()).map((s) => [String(s._id), s])) : null;
  return {
    items: page.items.map((i) => invoiceDTO(i, { pendingPayment: (pending.get(String(i._id)) as never) ?? null, store: stores?.get(String(i.storeId)) ?? null })),
    nextCursor: page.nextCursor,
  };
}

export async function invoiceDetail(filter: Record<string, unknown>, withStore = false): Promise<InvoiceDetailDTO> {
  const inv = await Invoice.findOne(filter).lean<InvoiceLean>();
  if (!inv) throw notFound('Invoice');
  const [entries, payments, pending, store] = await Promise.all([
    CommissionEntry.find({ invoiceId: inv._id }).sort({ at: 1 }).limit(500).lean<CommissionEntryLean[]>(),
    BillingPayment.find({ invoiceId: inv._id }).sort({ createdAt: -1 }).limit(50).lean<BillingPaymentLean[]>(),
    pendingPaymentsFor([inv._id]),
    withStore ? Store.findById(inv.storeId).select('name slug').lean() : null,
  ]);
  const nums = new Map([[String(inv._id), inv.number]]);
  return {
    ...invoiceDTO(inv, { pendingPayment: (pending.get(String(inv._id)) as never) ?? null, store }),
    commissions: entries.map((e) => commissionDTO(e, nums)),
    payments: payments.map((p) => paymentDTO(p, { admin: withStore })),
  };
}

export async function listPayments(filter: Record<string, unknown>, q: Page, admin = false): Promise<{ items: InvoicePaymentDTO[]; nextCursor: string | null }> {
  const rows = await BillingPayment.find({ ...filter, ...cursorFilter('_id', -1, q.cursor) }).sort({ _id: -1 }).limit(q.limit + 1).lean<BillingPaymentLean[]>();
  const page = paginate(rows, q.limit, '_id');
  let items: InvoicePaymentDTO[] = page.items.map((p) => paymentDTO(p, { admin }));
  if (admin) {
    const stores = new Map((await Store.find({ _id: { $in: page.items.map((p) => p.storeId) } }).select('name slug').lean()).map((s) => [String(s._id), s]));
    items = items.map((p, i) => ({ ...p, store: { id: String(page.items[i]!.storeId), name: stores.get(String(page.items[i]!.storeId))?.name ?? '', slug: stores.get(String(page.items[i]!.storeId))?.slug ?? '' } }));
  }
  return { items, nextCursor: page.nextCursor };
}

async function storeRefs(ids: Types.ObjectId[]) {
  const uniq = [...new Set(ids.map(String))].map(oid);
  return new Map((await Store.find({ _id: { $in: uniq } }).select('name slug').lean()).map((s) => [String(s._id), s]));
}

/** Commission rows; `admin` adds storeId / storeName / storeSlug. */
export async function listCommissions(filter: Record<string, unknown>, q: Page, admin = false): Promise<{ items: CommissionEntryDTO[]; nextCursor: string | null }> {
  const rows = await CommissionEntry.find({ ...filter, ...cursorFilter('at', -1, q.cursor) }).sort(cursorSort('at', -1)).limit(q.limit + 1).lean<CommissionEntryLean[]>();
  const page = paginate(rows, q.limit, 'at');
  const nums = await invoiceNumbers(page.items);
  if (!admin) return { items: page.items.map((e) => commissionDTO(e, nums)), nextCursor: page.nextCursor };
  const stores = await storeRefs(page.items.map((e) => e.storeId));
  return {
    items: page.items.map((e) => ({ ...commissionDTO(e, nums), storeId: String(e.storeId), storeName: stores.get(String(e.storeId))?.name ?? '', storeSlug: stores.get(String(e.storeId))?.slug ?? '' })),
    nextCursor: page.nextCursor,
  };
}

export function adjustmentDTO(a: BillingAdjustmentLean, store?: { name: string; slug: string }): BillingAdjustmentDTO {
  return { id: String(a._id), storeId: String(a.storeId), storeName: store?.name ?? '', storeSlug: store?.slug ?? '', type: a.type, invoiceId: a.invoiceId ? String(a.invoiceId) : null, paymentId: a.paymentId ? String(a.paymentId) : null, amount: a.amount, reason: a.reason, meta: a.meta ?? {}, by: a.by ? String(a.by) : null, createdAt: iso(a.createdAt)! };
}

export async function listAdjustments(filter: Record<string, unknown>, q: Page): Promise<{ items: BillingAdjustmentDTO[]; nextCursor: string | null }> {
  const rows = await BillingAdjustment.find({ ...filter, ...cursorFilter('_id', -1, q.cursor) }).sort({ _id: -1 }).limit(q.limit + 1).lean<BillingAdjustmentLean[]>();
  const page = paginate(rows, q.limit, '_id');
  const stores = await storeRefs(page.items.map((a) => a.storeId));
  return { items: page.items.map((a) => adjustmentDTO(a, stores.get(String(a.storeId)))), nextCursor: page.nextCursor };
}

// ---------------- admin ----------------
function monthStart(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** Subscription revenue = subscription lines of paid invoices, counted when paid (waived parts excluded pro rata). */
async function subscriptionRevenue(from?: Date) {
  const rows = await Invoice.aggregate<{ n: number }>([
    { $match: { status: 'paid', ...(from ? { paidAt: { $gte: from } } : {}) } },
    { $unwind: '$lines' },
    { $match: { 'lines.type': { $in: ['subscription', 'proration_credit'] } } },
    { $group: { _id: null, n: { $sum: '$lines.amount' } } },
  ]);
  return rows[0]?.n ?? 0;
}

export async function adminOverview(): Promise<AdminBillingOverviewDTO> {
  const [registered, approved, billingSuspended, byPlan, totals, invoices, pendingManual, payouts, thisMonth, allTime] = await Promise.all([
    Store.countDocuments({}),
    Store.countDocuments({ status: 'approved' }),
    Store.countDocuments({ billingStatus: 'suspended' }),
    Store.aggregate<{ _id: string; n: number }>([{ $match: { status: { $ne: 'rejected' } } }, { $group: { _id: '$plan', n: { $sum: 1 } } }]),
    commissionTotals({}),
    Invoice.aggregate<{ _id: string; n: number; due: number }>([
      { $match: { status: { $in: ['open', 'overdue'] } } },
      { $group: { _id: '$status', n: { $sum: 1 }, due: { $sum: { $subtract: ['$total', { $add: ['$amountPaid', '$amountWaived'] }] } } } },
    ]),
    BillingPayment.countDocuments({ method: 'manual', status: 'pending' }),
    Payout.aggregate<{ n: number; amount: number }>([{ $match: { status: { $in: ['requested', 'approved'] } } }, { $group: { _id: null, n: { $sum: 1 }, amount: { $sum: '$amount' } } }]),
    subscriptionRevenue(monthStart()),
    subscriptionRevenue(),
  ]);
  const subscribers = { free: 0, pro: 0, premium: 0 };
  for (const r of byPlan) subscribers[normalizePlan(r._id)] += r.n;
  const inv = (s: string) => invoices.find((i) => i._id === s);
  return {
    sellers: { registered, approved, billingSuspended },
    subscribers,
    mrr: subscribers.pro * PLANS.pro.priceMinor + subscribers.premium * PLANS.premium.priceMinor,
    subscriptionRevenue: { thisMonth, allTime },
    commission: {
      total: totals.totalCommission,
      online: totals.onlineCommission,
      cod: totals.codCommission,
      codOutstanding: totals.unpaidCodCommission,
      codPaid: totals.codCommission - totals.unpaidCodCommission,
      reversed: totals.reversed,
    },
    invoices: { open: inv('open')?.n ?? 0, overdue: inv('overdue')?.n ?? 0, amountDue: (inv('open')?.due ?? 0) + (inv('overdue')?.due ?? 0) },
    pendingManualPayments: pendingManual,
    payoutsPending: { count: payouts[0]?.n ?? 0, amount: payouts[0]?.amount ?? 0 },
    commissionBps: PLATFORM_COMMISSION_BPS,
  };
}

export async function adminStoreList(q: Page & { q?: string; plan?: string; billingStatus?: string }): Promise<{ items: AdminBillingStoreRowDTO[]; nextCursor: string | null }> {
  const filter: Record<string, unknown> = {};
  if (q.q) {
    const rx = { $regex: escapeRegex(q.q), $options: 'i' };
    filter.$or = [{ name: rx }, { slug: rx }];
  }
  if (q.plan) filter.plan = q.plan;
  if (q.billingStatus) filter.billingStatus = q.billingStatus === 'active' ? { $ne: 'suspended' } : 'suspended';
  const rows = await Store.find({ ...filter, ...cursorFilter('_id', -1, q.cursor) }).sort({ _id: -1 }).limit(q.limit + 1).select('name slug status plan billingStatus billingSuspension createdAt').lean();
  const page = paginate(rows, q.limit, '_id');
  const ids = page.items.map((s) => s._id);
  const [subs, dues, unpaid] = await Promise.all([
    Subscription.find({ storeId: { $in: ids } }).lean<SubscriptionLean[]>(),
    Invoice.aggregate<{ _id: Types.ObjectId; due: number; overdue: number }>([
      { $match: { storeId: { $in: ids }, status: { $in: ['open', 'overdue'] } } },
      { $project: { storeId: 1, status: 1, due: { $subtract: ['$total', { $add: ['$amountPaid', '$amountWaived'] }] } } },
      { $group: { _id: '$storeId', due: { $sum: '$due' }, overdue: { $sum: { $cond: [{ $eq: ['$status', 'overdue'] }, '$due', 0] } } } },
    ]),
    CommissionEntry.aggregate<{ _id: Types.ObjectId; n: number }>([{ $match: { storeId: { $in: ids }, channel: 'cod', status: 'unpaid' } }, { $group: { _id: '$storeId', n: { $sum: '$amount' } } }]),
  ]);
  const subBy = new Map(subs.map((s) => [String(s.storeId), s]));
  const dueBy = new Map(dues.map((d) => [String(d._id), d]));
  const unpaidBy = new Map(unpaid.map((u) => [String(u._id), u.n]));
  return {
    items: page.items.map((s) => {
      const sub = subBy.get(String(s._id));
      return {
        id: String(s._id),
        name: s.name,
        slug: s.slug,
        status: s.status,
        plan: normalizePlan(s.plan),
        billingStatus: s.billingStatus === 'suspended' ? ('suspended' as const) : ('active' as const),
        suspensionReason: s.billingStatus === 'suspended' ? (s.billingSuspension?.reason ?? null) : null,
        currentPeriodEnd: iso(sub?.currentPeriodEnd),
        scheduledChange: sub?.scheduledChange ? { plan: sub.scheduledChange.plan, effectiveAt: iso(sub.scheduledChange.effectiveAt) } : null,
        outstanding: dueBy.get(String(s._id))?.due ?? 0,
        overdue: dueBy.get(String(s._id))?.overdue ?? 0,
        unbilledCommission: Math.max(0, unpaidBy.get(String(s._id)) ?? 0),
      };
    }),
    nextCursor: page.nextCursor,
  };
}

export async function adminStoreDetail(storeId: Types.ObjectId): Promise<AdminBillingStoreDetailDTO> {
  const store = await Store.findById(storeId).select('name slug status plan billingStatus ownerId createdAt').lean();
  if (!store) throw notFound('Store');
  await ensureSubscription(storeId);
  await syncCommissions(storeId);
  const page = { limit: 20 };
  const [subscription, totals, finance, invoices, payments, commissions, adjustments] = await Promise.all([
    subscriptionDTO(storeId),
    commissionTotals({ storeId }),
    financeSummary(storeId),
    listInvoices({ storeId }, page),
    listPayments({ storeId }, page, true),
    listCommissions({ storeId }, page, true),
    listAdjustments({ storeId }, page),
  ]);
  const open = await Invoice.find({ storeId, status: { $in: ['open', 'overdue'] } }).lean<InvoiceLean[]>();
  return {
    store: { id: String(store._id), name: store.name, slug: store.slug, status: store.status, ownerId: String(store.ownerId), createdAt: iso(store.createdAt) },
    subscription,
    totals: { ...totals, availableBalance: finance.available, onHold: finance.onHold, pendingPayouts: finance.pendingPayouts, paidOut: finance.paidOut },
    outstanding: { invoices: open.length, amountDue: open.reduce((s, i) => s + amountDue(i), 0) },
    invoices: invoices.items,
    payments: payments.items,
    commissions: commissions.items,
    adjustments: adjustments.items,
  };
}

export type BillingReportRow = BillingReportRowDTO;

/** Per-store financial report over a window (invoices by issue date, commission by recognition date). */
export async function billingReport(from: Date, to: Date): Promise<BillingReportRow[]> {
  const [fees, commissions, outstanding] = await Promise.all([
    Invoice.aggregate<{ _id: Types.ObjectId; billed: number; paid: number; waived: number }>([
      { $match: { issuedAt: { $gte: from, $lte: to }, status: { $ne: 'void' } } },
      { $unwind: '$lines' },
      { $match: { 'lines.type': { $in: ['subscription', 'proration_credit'] } } },
      { $group: { _id: '$storeId', billed: { $sum: '$lines.amount' }, paid: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$lines.amount', 0] } }, waived: { $sum: { $cond: [{ $eq: ['$status', 'waived'] }, '$lines.amount', 0] } } } },
    ]),
    CommissionEntry.aggregate<{ _id: { s: Types.ObjectId; c: string; k: string }; n: number }>([
      { $match: { at: { $gte: from, $lte: to } } },
      { $group: { _id: { s: '$storeId', c: '$channel', k: '$kind' }, n: { $sum: '$amount' } } },
    ]),
    Invoice.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { status: { $in: ['open', 'overdue'] } } },
      { $group: { _id: '$storeId', n: { $sum: { $subtract: ['$total', { $add: ['$amountPaid', '$amountWaived'] }] } } } },
    ]),
  ]);
  const map = new Map<string, BillingReportRow>();
  const row = (id: Types.ObjectId) => {
    const k = String(id);
    if (!map.has(k)) map.set(k, { storeId: k, store: '', plan: '', feesBilled: 0, feesPaid: 0, codCommission: 0, onlineCommission: 0, reversals: 0, waived: 0, outstanding: 0 });
    return map.get(k)!;
  };
  for (const f of fees) Object.assign(row(f._id), { feesBilled: f.billed, feesPaid: f.paid, waived: f.waived });
  for (const c of commissions) {
    const r = row(c._id.s);
    if (c._id.k === 'reversal') r.reversals += -c.n;
    else if (c._id.c === 'cod') r.codCommission += c.n;
    else r.onlineCommission += c.n;
  }
  for (const o of outstanding) row(o._id).outstanding = o.n;
  const stores = new Map((await Store.find({ _id: { $in: [...map.keys()].map(oid) } }).select('name plan').lean()).map((s) => [String(s._id), s]));
  for (const r of map.values()) {
    r.store = stores.get(r.storeId)?.name ?? '';
    r.plan = normalizePlan(stores.get(r.storeId)?.plan);
  }
  return [...map.values()].sort((a, b) => a.store.localeCompare(b.store));
}

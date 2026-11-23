import {
  PERMISSIONS,
  adminCommissionRuleSchema,
  adminCommissionRuleUpdateSchema,
  adminFinanceReportQuerySchema,
  adminPayoutListQuerySchema,
  adminPayoutPaidSchema,
  adminPayoutRejectSchema,
  formatMoney,
  objectIdSchema,
} from '@souqly/shared';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { AppError, notFound } from '../../lib/AppError';
import { asyncHandler } from '../../lib/asyncHandler';
import { streamCsv } from '../../lib/csv';
import { cursorFilter, cursorSort, paginate } from '../../lib/pagination';
import { validate } from '../../middleware/validate';
import { audit } from '../audit/audit.service';
import { CommissionRule } from '../commission/commission.model';
import { notify } from '../notifications/notification.service';
import { Order } from '../orders/order.model';
import { Payout, type PayoutLean, type PayoutStatus } from '../payouts/payout.model';
import { Store } from '../stores/store.model';
import { WalletTransaction } from '../wallet/walletTransaction.model';
import { can, iso, oid, q, range } from './common';
import { GMV_EXCLUDED, REVENUE_EXCLUDED } from './dashboard.routes';

export const adminFinanceRouter = Router();
const idParams = z.object({ id: objectIdSchema });

// ---------------- commission rules ----------------
const ruleDTO = (r: { _id: unknown; scope: string; categoryId?: unknown; storeId?: unknown; bps: number; isActive: boolean }) => ({
  id: String(r._id),
  scope: r.scope,
  categoryId: r.categoryId ? String(r.categoryId) : null,
  storeId: r.storeId ? String(r.storeId) : null,
  bps: r.bps,
  isActive: r.isActive,
});

adminFinanceRouter.get(
  '/commission-rules',
  ...can(PERMISSIONS.ADMIN_FINANCE_VIEW),
  asyncHandler(async (_req, res) => {
    const rows = await CommissionRule.find().sort({ scope: 1, bps: -1 }).lean();
    res.json({ data: rows.map(ruleDTO) });
  }),
);

adminFinanceRouter.post(
  '/commission-rules',
  ...can(PERMISSIONS.ADMIN_FINANCE_MANAGE),
  validate({ body: adminCommissionRuleSchema }),
  asyncHandler(async (req, res) => {
    const b = req.body as z.infer<typeof adminCommissionRuleSchema>;
    const r = await CommissionRule.create({ scope: b.scope, categoryId: b.categoryId ? oid(b.categoryId) : null, storeId: b.storeId ? oid(b.storeId) : null, bps: b.bps, isActive: b.isActive });
    await audit({ action: 'admin.commission_rule_created', targetType: 'CommissionRule', targetId: r._id, meta: ruleDTO(r), req });
    res.status(201).json({ data: ruleDTO(r) });
  }),
);

adminFinanceRouter.patch(
  '/commission-rules/:id',
  ...can(PERMISSIONS.ADMIN_FINANCE_MANAGE),
  validate({ params: idParams, body: adminCommissionRuleUpdateSchema }),
  asyncHandler(async (req, res) => {
    const set: Record<string, unknown> = {};
    if (req.body.bps !== undefined) set.bps = req.body.bps;
    if (req.body.isActive !== undefined) set.isActive = req.body.isActive;
    const r = await CommissionRule.findByIdAndUpdate(req.params.id, { $set: set }, { new: true }).lean();
    if (!r) throw notFound('Commission rule');
    await audit({ action: 'admin.commission_rule_updated', targetType: 'CommissionRule', targetId: r._id, meta: set, req });
    res.json({ data: ruleDTO(r) });
  }),
);

adminFinanceRouter.delete(
  '/commission-rules/:id',
  ...can(PERMISSIONS.ADMIN_FINANCE_MANAGE),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const r = await CommissionRule.findByIdAndDelete(req.params.id).lean();
    if (!r) throw notFound('Commission rule');
    await audit({ action: 'admin.commission_rule_deleted', targetType: 'CommissionRule', targetId: r._id, meta: ruleDTO(r), req });
    res.status(204).end();
  }),
);

// ---------------- payouts ----------------
type PayoutQuery = z.infer<typeof adminPayoutListQuerySchema>;
const payoutDTO = (p: PayoutLean, storeName?: string) => ({
  id: String(p._id),
  storeId: String(p.storeId),
  storeName: storeName ?? null,
  amount: p.amount,
  status: p.status,
  method: p.method ?? {},
  reference: p.reference ?? null,
  notes: p.notes ?? null,
  createdAt: iso(p.createdAt),
  approvedAt: iso(p.approvedAt),
  paidAt: iso(p.paidAt),
  rejectedAt: iso(p.rejectedAt),
});
const payoutFilter = (f: PayoutQuery) => ({ ...(f.status ? { status: f.status } : {}), ...(f.storeId ? { storeId: oid(f.storeId) } : {}) });

adminFinanceRouter.get(
  '/payouts',
  ...can(PERMISSIONS.ADMIN_FINANCE_VIEW),
  validate({ query: adminPayoutListQuerySchema }),
  asyncHandler(async (req, res) => {
    const f = q<PayoutQuery>(req);
    if (f.format === 'csv') {
      await audit({ action: 'admin.export_csv', targetType: 'Payout', meta: { resource: 'payouts' }, req });
      const cursor = Payout.find(payoutFilter(f)).sort({ _id: -1 }).lean<PayoutLean[]>().cursor() as AsyncIterable<PayoutLean>;
      return streamCsv(res, 'payouts.csv', [
        { header: 'id', value: (p: PayoutLean) => String(p._id) },
        { header: 'storeId', value: (p) => String(p.storeId) },
        { header: 'amount', value: (p) => p.amount },
        { header: 'status', value: (p) => p.status },
        { header: 'method', value: (p) => p.method?.type },
        { header: 'account', value: (p) => p.method?.accountMasked },
        { header: 'reference', value: (p) => p.reference },
        { header: 'createdAt', value: (p) => p.createdAt },
        { header: 'paidAt', value: (p) => p.paidAt },
      ], cursor);
    }
    const rows = await Payout.find({ ...payoutFilter(f), ...cursorFilter('_id', -1, f.cursor) }).sort(cursorSort('_id', -1)).limit(f.limit + 1).lean<PayoutLean[]>();
    const page = paginate(rows, f.limit, '_id');
    const stores = await Store.find({ _id: { $in: page.items.map((p) => p.storeId) } }).select('name').lean();
    const names = new Map(stores.map((s) => [String(s._id), s.name]));
    res.json({ data: page.items.map((p) => payoutDTO(p, names.get(String(p.storeId)))), meta: { nextCursor: page.nextCursor } });
  }),
);

/** Conditional status move: the `from` guard makes concurrent reviews safe (no double payment). */
async function movePayout(req: Request, from: PayoutStatus[], to: PayoutStatus, set: Record<string, unknown>) {
  const p = await Payout.findOneAndUpdate(
    { _id: oid(req.params.id!), status: { $in: from } },
    { $set: { status: to, reviewedBy: oid(req.user!.id), ...set } },
    { new: true },
  ).lean<PayoutLean>();
  if (!p) {
    if (!(await Payout.exists({ _id: oid(req.params.id!) }))) throw notFound('Payout');
    throw new AppError(409, 'INVALID_PAYOUT_STATE', `Only ${from.join(' / ')} payouts can be moved to ${to}`);
  }
  await audit({ action: `admin.payout_${to}`, targetType: 'Payout', targetId: p._id, storeId: p.storeId, meta: { amount: p.amount, ...set }, req });
  const store = await Store.findById(p.storeId).select('ownerId').lean();
  if (store) {
    void notify({ userId: store.ownerId, type: `payout.${to}`, title: `Payout ${to}`, body: `Your payout of ${formatMoney(p.amount)} is ${to}.`, link: '/seller/finance' });
  }
  return payoutDTO(p);
}

adminFinanceRouter.post(
  '/payouts/:id/approve',
  ...can(PERMISSIONS.ADMIN_FINANCE_MANAGE),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    res.json({ data: await movePayout(req, ['requested'], 'approved', { approvedAt: new Date() }) });
  }),
);

adminFinanceRouter.post(
  '/payouts/:id/mark-paid',
  ...can(PERMISSIONS.ADMIN_FINANCE_MANAGE),
  validate({ params: idParams, body: adminPayoutPaidSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await movePayout(req, ['approved'], 'paid', { paidAt: new Date(), reference: req.body.reference, ...(req.body.notes ? { notes: req.body.notes } : {}) }) });
  }),
);

adminFinanceRouter.post(
  '/payouts/:id/reject',
  ...can(PERMISSIONS.ADMIN_FINANCE_MANAGE),
  validate({ params: idParams, body: adminPayoutRejectSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await movePayout(req, ['requested', 'approved'], 'rejected', { rejectedAt: new Date(), notes: req.body.notes }) });
  }),
);

// ---------------- reports ----------------
type ReportRow = { period: string; gmv: number; commission: number; orders: number; refunds: number; payouts: number };

export async function financeReport(fromQ: Date | undefined, toQ: Date | undefined, groupBy: 'day' | 'month'): Promise<{ from: Date; to: Date; rows: ReportRow[]; totals: Omit<ReportRow, 'period'> }> {
  const { from, to } = range(fromQ, toQ);
  const fmt = groupBy === 'day' ? '%Y-%m-%d' : '%Y-%m';
  const period = (field: string) => ({ $dateToString: { format: fmt, date: field, timezone: 'Asia/Karachi' } });
  const [orders, refunds, payouts] = await Promise.all([
    Order.aggregate<{ _id: string; gmv: number; commission: number; orders: number }>([
      { $match: { createdAt: { $gte: from, $lte: to }, status: { $nin: GMV_EXCLUDED } } },
      { $group: { _id: period('$createdAt'), gmv: { $sum: '$total' }, orders: { $sum: 1 }, commission: { $sum: { $cond: [{ $in: ['$status', REVENUE_EXCLUDED] }, 0, '$commission.amount'] } } } },
    ]),
    WalletTransaction.aggregate<{ _id: string; n: number }>([
      { $match: { createdAt: { $gte: from, $lte: to }, type: 'credit', reason: 'refund', state: 'done' } },
      { $group: { _id: period('$createdAt'), n: { $sum: '$amount' } } },
    ]),
    Payout.aggregate<{ _id: string; n: number }>([{ $match: { status: 'paid', paidAt: { $gte: from, $lte: to } } }, { $group: { _id: period('$paidAt'), n: { $sum: '$amount' } } }]),
  ]);
  const map = new Map<string, ReportRow>();
  const row = (k: string) => map.get(k) ?? (map.set(k, { period: k, gmv: 0, commission: 0, orders: 0, refunds: 0, payouts: 0 }).get(k) as ReportRow);
  for (const o of orders) Object.assign(row(o._id), { gmv: o.gmv, commission: o.commission, orders: o.orders });
  for (const r of refunds) row(r._id).refunds = r.n;
  for (const p of payouts) row(p._id).payouts = p.n;
  const rows = [...map.values()].sort((a, b) => a.period.localeCompare(b.period));
  const totals = rows.reduce((t, r) => ({ gmv: t.gmv + r.gmv, commission: t.commission + r.commission, orders: t.orders + r.orders, refunds: t.refunds + r.refunds, payouts: t.payouts + r.payouts }), { gmv: 0, commission: 0, orders: 0, refunds: 0, payouts: 0 });
  return { from, to, rows, totals };
}

adminFinanceRouter.get(
  '/finance/report',
  ...can(PERMISSIONS.ADMIN_FINANCE_VIEW),
  validate({ query: adminFinanceReportQuerySchema }),
  asyncHandler(async (req, res) => {
    const f = req.query as unknown as z.infer<typeof adminFinanceReportQuerySchema>;
    const r = await financeReport(f.from, f.to, f.groupBy);
    if (f.format === 'csv') {
      await audit({ action: 'admin.export_csv', targetType: 'FinanceReport', meta: { resource: 'finance', from: r.from, to: r.to }, req });
      async function* rows() {
        yield* r.rows;
      }
      return streamCsv(res, 'finance-report.csv', [
        { header: 'period', value: (x: ReportRow) => x.period },
        { header: 'gmv', value: (x) => x.gmv },
        { header: 'commission', value: (x) => x.commission },
        { header: 'orders', value: (x) => x.orders },
        { header: 'refunds', value: (x) => x.refunds },
        { header: 'payouts', value: (x) => x.payouts },
      ], rows());
    }
    res.json({ data: { from: r.from.toISOString(), to: r.to.toISOString(), groupBy: f.groupBy, rows: r.rows, totals: r.totals } });
  }),
);


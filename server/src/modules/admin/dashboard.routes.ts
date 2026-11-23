import { PERMISSIONS, adminRangeQuerySchema } from '@souqly/shared';
import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middleware/validate';
import { Product } from '../catalog/product.model';
import { Category } from '../catalog/category.model';
import { Order } from '../orders/order.model';
import { Payout } from '../payouts/payout.model';
import { FraudSignal, Report } from '../reports/report.model';
import { Dispute, ReturnRequest } from '../returns/return.model';
import { Store } from '../stores/store.model';
import { Ticket } from '../support/ticket.model';
import { User } from '../users/user.model';
import { can, range } from './common';

export const adminDashboardRouter = Router();

/** Orders that count towards GMV (money actually committed by buyers). */
export const GMV_EXCLUDED = ['pending_payment', 'cancelled'];
/** Orders whose commission is platform revenue (not cancelled / refunded). */
export const REVENUE_EXCLUDED = ['pending_payment', 'cancelled', 'returned', 'refunded'];

/** Percentage change vs the previous period (1 decimal); null when the previous value is 0 and the current is not. */
export const deltaPct = (cur: number, prev: number): number | null => (prev === 0 ? (cur === 0 ? 0 : null) : Math.round(((cur - prev) / prev) * 1000) / 10);

async function periodTotals(match: Record<string, unknown>) {
  const [t] = await Order.aggregate<{ gmv: number; commission: number; orders: number }>([
    { $match: { ...match, status: { $nin: GMV_EXCLUDED } } },
    {
      $group: {
        _id: null,
        gmv: { $sum: '$total' },
        orders: { $sum: 1 },
        commission: { $sum: { $cond: [{ $in: ['$status', REVENUE_EXCLUDED] }, 0, '$commission.amount'] } },
      },
    },
  ]);
  return { gmv: t?.gmv ?? 0, commission: t?.commission ?? 0, orders: t?.orders ?? 0, newSignups: await User.countDocuments(match) };
}

export async function dashboard(fromQ?: Date, toQ?: Date) {
  const { from, to } = range(fromQ, toQ);
  const inRange = { createdAt: { $gte: from, $lte: to } };
  // Previous period of the same length, immediately before `from`.
  const prevFrom = new Date(from.getTime() - (to.getTime() - from.getTime()));
  const previous = await periodTotals({ createdAt: { $gte: prevFrom, $lt: from } });
  const [totals] = await Order.aggregate<{ gmv: number; commission: number; orders: number }>([
    { $match: { ...inRange, status: { $nin: GMV_EXCLUDED } } },
    {
      $group: {
        _id: null,
        gmv: { $sum: '$total' },
        orders: { $sum: 1 },
        commission: { $sum: { $cond: [{ $in: ['$status', REVENUE_EXCLUDED] }, 0, '$commission.amount'] } },
      },
    },
  ]);
  const series = await Order.aggregate<{ _id: string; gmv: number; orders: number; commission: number }>([
    { $match: { ...inRange, status: { $nin: GMV_EXCLUDED } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Karachi' } },
        gmv: { $sum: '$total' },
        orders: { $sum: 1 },
        commission: { $sum: { $cond: [{ $in: ['$status', REVENUE_EXCLUDED] }, 0, '$commission.amount'] } },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  const signupSeries = await User.aggregate<{ _id: string; n: number }>([
    { $match: inRange },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Karachi' } }, n: { $sum: 1 } } },
  ]);
  const signups = new Map(signupSeries.map((s) => [s._id, s.n]));

  const topStoresRaw = await Order.aggregate<{ _id: unknown; gmv: number; orders: number }>([
    { $match: { ...inRange, status: { $nin: GMV_EXCLUDED } } },
    { $group: { _id: '$storeId', gmv: { $sum: '$total' }, orders: { $sum: 1 } } },
    { $sort: { gmv: -1 } },
    { $limit: 5 },
  ]);
  const topProductsRaw = await Order.aggregate<{ _id: unknown; title: string; revenue: number; qty: number }>([
    { $match: { ...inRange, status: { $nin: GMV_EXCLUDED } } },
    { $unwind: '$items' },
    { $group: { _id: '$items.productId', title: { $first: '$items.title' }, revenue: { $sum: '$items.lineTotal' }, qty: { $sum: '$items.qty' } } },
    { $sort: { revenue: -1 } },
    { $limit: 5 },
  ]);
  const topCategoriesRaw = await Order.aggregate<{ _id: unknown; revenue: number }>([
    { $match: { ...inRange, status: { $nin: GMV_EXCLUDED } } },
    { $unwind: '$items' },
    { $group: { _id: { $arrayElemAt: ['$items.categoryPath', 0] }, revenue: { $sum: '$items.lineTotal' } } },
    { $match: { _id: { $ne: null } } },
    { $sort: { revenue: -1 } },
    { $limit: 5 },
  ]);
  const [stores, cats] = await Promise.all([
    Store.find({ _id: { $in: topStoresRaw.map((s) => s._id) } }).select('name slug').lean(),
    Category.find({ _id: { $in: topCategoriesRaw.map((c) => c._id) } }).select('name slug').lean(),
  ]);

  const storeStatus = await Store.aggregate<{ _id: string; n: number }>([{ $group: { _id: '$status', n: { $sum: 1 } } }]);
  const [users, newSignups, pendingStores, pendingProducts, returns, disputes, reports, tickets, payouts, mallRequests, fraud] = await Promise.all([
    User.countDocuments({ status: { $ne: 'deleted' } }),
    User.countDocuments(inRange),
    Store.countDocuments({ status: 'pending' }),
    Product.countDocuments({ status: 'pending_review', deletedAt: { $exists: false } }),
    ReturnRequest.countDocuments({ status: { $in: ['requested', 'escalated'] } }),
    Dispute.countDocuments({ status: 'open' }),
    Report.countDocuments({ status: { $in: ['open', 'reviewing'] } }),
    Ticket.countDocuments({ status: { $in: ['open', 'pending'] } }),
    Payout.countDocuments({ status: { $in: ['requested', 'approved'] } }),
    Store.countDocuments({ mallRequested: true, isMall: false }),
    FraudSignal.countDocuments({ status: 'open' }),
  ]);

  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    totals: {
      gmv: totals?.gmv ?? 0,
      commission: totals?.commission ?? 0,
      orders: totals?.orders ?? 0,
      users,
      newSignups,
      stores: Object.fromEntries(storeStatus.map((s) => [s._id, s.n])),
    },
    previous: { range: { from: prevFrom.toISOString(), to: from.toISOString() }, ...previous },
    deltas: {
      gmv: deltaPct(totals?.gmv ?? 0, previous.gmv),
      commission: deltaPct(totals?.commission ?? 0, previous.commission),
      orders: deltaPct(totals?.orders ?? 0, previous.orders),
      newSignups: deltaPct(newSignups, previous.newSignups),
    },
    series: series.map((s) => ({ date: s._id, gmv: s.gmv, orders: s.orders, commission: s.commission, signups: signups.get(s._id) ?? 0 })),
    top: {
      stores: topStoresRaw.map((s) => {
        const st = stores.find((x) => String(x._id) === String(s._id));
        return { id: String(s._id), name: st?.name ?? 'Store', slug: st?.slug ?? '', gmv: s.gmv, orders: s.orders };
      }),
      products: topProductsRaw.map((p) => ({ id: String(p._id), title: p.title, revenue: p.revenue, qty: p.qty })),
      categories: topCategoriesRaw.map((c) => {
        const cat = cats.find((x) => String(x._id) === String(c._id));
        return { id: String(c._id), name: cat?.name ?? { en: 'Category', ur: '', ar: '' }, slug: cat?.slug ?? '', revenue: c.revenue };
      }),
    },
    pending: { stores: pendingStores, products: pendingProducts, returns, disputes, reports, tickets, payouts, mallRequests, fraudSignals: fraud },
  };
}

adminDashboardRouter.get(
  '/dashboard',
  ...can(PERMISSIONS.ADMIN_DASHBOARD),
  validate({ query: adminRangeQuerySchema }),
  asyncHandler(async (req, res) => {
    const { from, to } = req.query as { from?: Date; to?: Date };
    res.json({ data: await dashboard(from, to) });
  }),
);

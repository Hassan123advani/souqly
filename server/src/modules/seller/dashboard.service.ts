import type { KpiValue, SellerDashboard } from '@souqly/shared';
import mongoose, { Types, type Model } from 'mongoose';
import { Product } from '../catalog/product.model';
import { unreadCount } from '../chat/chat.service';
import { Question } from '../qa/question.model';
import { countLowStock } from '../inventory/inventory.service';
import type { StoreDoc } from '../stores/store.model';
import { StoreVisit } from '../stores/storeVisit.model';
import { utcDay } from '../stores/storeVisit.service';

/**
 * Seller dashboard. Order data comes from the Phase-6 `Order` model, looked up lazily by name so
 * this module never imports the orders module; until it is registered every order metric is 0.
 * Expected Order fields: storeId, status, total, items[].qty, number, createdAt.
 */
const DAY = 24 * 3600_000;
const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90 } as const;
/** Orders that count as sales (not cancelled / unpaid / returned). */
const SALE_EXCLUDED = ['pending_payment', 'cancelled', 'returned', 'refunded'];

function orderModel(): Model<Record<string, unknown>> | null {
  return mongoose.modelNames().includes('Order') ? (mongoose.model('Order') as Model<Record<string, unknown>>) : null;
}

const kpi = (value: number, previous: number): KpiValue => ({
  value,
  previous,
  deltaPct: previous === 0 ? (value === 0 ? 0 : null) : Math.round(((value - previous) / previous) * 1000) / 10,
});

type Window = { from: Date; to: Date };

async function orderTotals(Order: Model<Record<string, unknown>> | null, storeId: Types.ObjectId, w: Window): Promise<{ sales: number; orders: number; cancelled: number; all: number }> {
  if (!Order) return { sales: 0, orders: 0, cancelled: 0, all: 0 };
  const [row] = await Order.aggregate<{ sales: number; orders: number; cancelled: number; all: number }>([
    { $match: { storeId, createdAt: { $gte: w.from, $lt: w.to } } },
    {
      $group: {
        _id: null,
        all: { $sum: 1 },
        cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
        orders: { $sum: { $cond: [{ $in: ['$status', SALE_EXCLUDED] }, 0, 1] } },
        sales: { $sum: { $cond: [{ $in: ['$status', SALE_EXCLUDED] }, 0, { $ifNull: ['$total', 0] }] } },
      },
    },
  ]);
  return row ?? { sales: 0, orders: 0, cancelled: 0, all: 0 };
}

async function visitors(storeId: Types.ObjectId, w: Window): Promise<number> {
  const [row] = await StoreVisit.aggregate<{ n: number }>([
    { $match: { storeId, date: { $gte: utcDay(w.from), $lt: utcDay(w.to) } } },
    { $group: { _id: null, n: { $sum: '$visitors' } } },
  ]);
  return row?.n ?? 0;
}

async function series(Order: Model<Record<string, unknown>> | null, storeId: Types.ObjectId, w: Window, days: number): Promise<SellerDashboard['salesSeries']> {
  const byDay = new Map<string, { sales: number; orders: number }>();
  if (Order) {
    const rows = await Order.aggregate<{ _id: string; sales: number; orders: number }>([
      { $match: { storeId, createdAt: { $gte: w.from, $lt: w.to }, status: { $nin: SALE_EXCLUDED } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, sales: { $sum: { $ifNull: ['$total', 0] } }, orders: { $sum: 1 } } },
    ]);
    for (const r of rows) byDay.set(r._id, { sales: r.sales, orders: r.orders });
  }
  return Array.from({ length: days }, (_, i) => {
    const date = utcDay(new Date(w.from.getTime() + i * DAY));
    return { date, ...(byDay.get(date) ?? { sales: 0, orders: 0 }) };
  });
}

async function todo(Order: Model<Record<string, unknown>> | null, storeId: Types.ObjectId): Promise<SellerDashboard['todo']> {
  const counts = new Map<string, number>();
  if (Order) {
    const rows = await Order.aggregate<{ _id: string; n: number }>([
      { $match: { storeId, status: { $in: ['placed', 'confirmed', 'packed', 'return_requested'] } } },
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ]);
    for (const r of rows) counts.set(r._id, r.n);
  }
  return {
    toConfirm: counts.get('placed') ?? 0,
    toPack: counts.get('confirmed') ?? 0,
    toShip: counts.get('packed') ?? 0,
    returnRequests: counts.get('return_requested') ?? 0,
    lowStock: await countLowStock(storeId),
    unansweredQuestions: await Question.countDocuments({ storeId, answered: false, status: { $ne: 'hidden' } }),
    unreadChats: await unreadCount('store', storeId),
  };
}

/** Listing quality: share of live products with ≥ 3 images and a real description. */
async function listingQuality(storeId: Types.ObjectId): Promise<number> {
  const [row] = await Product.aggregate<{ all: number; good: number }>([
    { $match: { storeId, deletedAt: { $exists: false }, status: 'published' } },
    {
      $group: {
        _id: null,
        all: { $sum: 1 },
        good: { $sum: { $cond: [{ $and: [{ $gte: [{ $size: { $ifNull: ['$images', []] } }, 3] }, { $gte: [{ $strLenCP: { $ifNull: ['$description', ''] } }, 80] }] }, 1, 0] } },
      },
    },
  ]);
  return row && row.all > 0 ? row.good / row.all : 1;
}

export async function getDashboard(store: StoreDoc, range: keyof typeof RANGE_DAYS): Promise<SellerDashboard> {
  const days = RANGE_DAYS[range];
  const storeId = store._id;
  const Order = orderModel();
  const todayStart = new Date(`${utcDay()}T00:00:00.000Z`).getTime();
  const cur: Window = { from: new Date(todayStart - (days - 1) * DAY), to: new Date(todayStart + DAY) };
  const prev: Window = { from: new Date(cur.from.getTime() - days * DAY), to: cur.from };

  const [tCur, tPrev, vCur, vPrev, salesSeries, todoList, quality, recent] = await Promise.all([
    orderTotals(Order, storeId, cur),
    orderTotals(Order, storeId, prev),
    visitors(storeId, cur),
    visitors(storeId, prev),
    series(Order, storeId, cur, days),
    todo(Order, storeId),
    listingQuality(storeId),
    Order
      ? Order.find({ storeId }).sort({ createdAt: -1 }).limit(5).select('number status total items createdAt').lean<Record<string, unknown>[]>()
      : Promise.resolve([] as Record<string, unknown>[]),
  ]);

  const conv = (orders: number, v: number) => (v > 0 ? Math.round((orders / v) * 10_000) / 100 : 0);
  const aov = (sales: number, orders: number) => (orders > 0 ? Math.round(sales / orders) : 0);

  const cancelRate = tCur.all > 0 ? tCur.cancelled / tCur.all : 0;
  const factors = [
    { key: 'rating', value: store.ratingCount > 0 ? store.ratingAvg / 5 : 1, weight: 0.3 },
    { key: 'responseRate', value: Math.min(1, (store.responseRate ?? 100) / 100), weight: 0.2 },
    { key: 'cancellationRate', value: 1 - cancelRate, weight: 0.25 },
    { key: 'listingQuality', value: quality, weight: 0.25 },
  ].map((f) => ({ ...f, value: Math.round(f.value * 1000) / 1000 }));
  const score = Math.round(factors.reduce((s, f) => s + f.value * f.weight, 0) * 100);

  return {
    range,
    kpis: {
      sales: kpi(tCur.sales, tPrev.sales),
      orders: kpi(tCur.orders, tPrev.orders),
      visitors: kpi(vCur, vPrev),
      conversion: kpi(conv(tCur.orders, vCur), conv(tPrev.orders, vPrev)),
      avgOrderValue: kpi(aov(tCur.sales, tCur.orders), aov(tPrev.sales, tPrev.orders)),
    },
    salesSeries,
    todo: todoList,
    healthScore: { score, factors },
    recentOrders: recent.map((o) => ({
      id: String(o._id),
      number: String(o.number ?? ''),
      status: String(o.status ?? ''),
      total: Number(o.total ?? 0),
      itemCount: Array.isArray(o.items) ? (o.items as { qty?: number }[]).reduce((n, i) => n + (Number(i.qty) || 0), 0) : 0,
      createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : String(o.createdAt ?? ''),
    })),
  };
}

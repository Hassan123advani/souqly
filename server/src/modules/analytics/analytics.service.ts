import { formatMoney } from '@souqly/shared';
import { Types } from 'mongoose';
import PDFDocument from 'pdfkit';
import { csvRow } from '../../lib/csv';
import { logger } from '../../lib/logger';
import { Product } from '../catalog/product.model';
import { Order } from '../orders/order.model';
import { StoreVisit } from '../stores/storeVisit.model';
import { utcDay } from '../stores/storeVisit.service';
import { AnalyticsEvent, type AnalyticsEventType } from './analyticsEvent.model';

const DAY = 24 * 3600_000;
export const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90 } as const;
const SALE_EXCLUDED = ['pending_payment', 'cancelled', 'returned', 'refunded'];

/** Normalises `?ref=` / `?utm_source=` into a short source label ('' = direct). */
export function trafficSource(q: { ref?: unknown; utm_source?: unknown }): string {
  const raw = typeof q.utm_source === 'string' && q.utm_source ? q.utm_source : typeof q.ref === 'string' ? q.ref : '';
  return raw.toLowerCase().replace(/[^\w.:-]/g, '').slice(0, 60);
}

/** Fire-and-forget daily counter increment. Never throws. */
export function track(type: AnalyticsEventType, storeId: Types.ObjectId | string, opts: { productId?: Types.ObjectId | string; source?: string; by?: number } = {}): void {
  AnalyticsEvent.updateOne(
    {
      storeId: new Types.ObjectId(String(storeId)),
      date: utcDay(),
      type,
      productId: opts.productId ? new Types.ObjectId(String(opts.productId)) : null,
      source: opts.source ?? '',
    },
    { $inc: { count: opts.by ?? 1 } },
    { upsert: true },
  ).catch((err) => logger.warn({ err }, 'analytics counter failed'));
}

export type AnalyticsReport = {
  range: keyof typeof RANGE_DAYS;
  from: string;
  to: string;
  series: { date: string; sales: number; orders: number; units: number }[];
  funnel: { visits: number; productViews: number; addToCart: number; orders: number };
  topProducts: { productId: string; title: string; revenue: number; units: number; views: number; conversion: number }[];
  traffic: { source: string; views: number }[];
  customers: { new: number; returning: number };
  channels: { online: number; pos: number };
};

export async function getAnalytics(storeId: Types.ObjectId, range: keyof typeof RANGE_DAYS): Promise<AnalyticsReport> {
  const days = RANGE_DAYS[range];
  const todayStart = new Date(`${utcDay()}T00:00:00.000Z`).getTime();
  const from = new Date(todayStart - (days - 1) * DAY);
  const to = new Date(todayStart + DAY);
  const fromDay = utcDay(from);
  const sales = { storeId, createdAt: { $gte: from, $lt: to }, status: { $nin: SALE_EXCLUDED } };

  const [seriesRows, events, visits, productRows, buyers, channelRows] = await Promise.all([
    Order.aggregate<{ _id: string; sales: number; orders: number; units: number }>([
      { $match: sales },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, sales: { $sum: '$total' }, orders: { $sum: 1 }, units: { $sum: { $sum: '$items.qty' } } } },
    ]),
    AnalyticsEvent.aggregate<{ _id: { type: string; productId: Types.ObjectId | null; source: string }; n: number }>([
      { $match: { storeId, date: { $gte: fromDay } } },
      { $group: { _id: { type: '$type', productId: '$productId', source: '$source' }, n: { $sum: '$count' } } },
    ]),
    StoreVisit.aggregate<{ n: number }>([{ $match: { storeId, date: { $gte: fromDay } } }, { $group: { _id: null, n: { $sum: '$visitors' } } }]),
    Order.aggregate<{ _id: Types.ObjectId; revenue: number; units: number; orders: number }>([
      { $match: sales },
      { $unwind: '$items' },
      { $group: { _id: '$items.productId', revenue: { $sum: '$items.lineTotal' }, units: { $sum: '$items.qty' }, orderIds: { $addToSet: '$_id' } } },
      { $project: { revenue: 1, units: 1, orders: { $size: '$orderIds' } } },
      { $sort: { revenue: -1 } },
      { $limit: 10 },
    ]),
    Order.aggregate<{ _id: Types.ObjectId; first: Date }>([
      { $match: { storeId, buyerId: { $ne: null }, channel: { $ne: 'pos' }, status: { $nin: SALE_EXCLUDED } } },
      { $group: { _id: '$buyerId', first: { $min: '$createdAt' }, last: { $max: '$createdAt' } } },
      { $match: { last: { $gte: from } } },
    ]),
    Order.aggregate<{ _id: string; n: number }>([{ $match: sales }, { $group: { _id: '$channel', n: { $sum: 1 } } }]),
  ]);

  const byDay = new Map(seriesRows.map((r) => [r._id, r]));
  const series = Array.from({ length: days }, (_, i) => {
    const date = utcDay(new Date(from.getTime() + i * DAY));
    const r = byDay.get(date);
    return { date, sales: r?.sales ?? 0, orders: r?.orders ?? 0, units: r?.units ?? 0 };
  });

  const sum = (type: string) => events.filter((e) => e._id.type === type).reduce((a, e) => a + e.n, 0);
  const viewsByProduct = new Map<string, number>();
  const traffic = new Map<string, number>();
  for (const e of events) {
    if (e._id.type === 'product_view' && e._id.productId) viewsByProduct.set(String(e._id.productId), (viewsByProduct.get(String(e._id.productId)) ?? 0) + e.n);
    if (e._id.type === 'product_view' || e._id.type === 'store_view') traffic.set(e._id.source || 'direct', (traffic.get(e._id.source || 'direct') ?? 0) + e.n);
  }
  const titles = new Map(
    (await Product.find({ _id: { $in: productRows.map((r) => r._id) }, storeId }).select('title').lean()).map((p) => [String(p._id), p.title]),
  );
  const orders = series.reduce((a, s) => a + s.orders, 0);
  return {
    range,
    from: from.toISOString(),
    to: to.toISOString(),
    series,
    funnel: { visits: visits[0]?.n ?? 0, productViews: sum('product_view'), addToCart: sum('add_to_cart'), orders },
    topProducts: productRows.map((r) => {
      const views = viewsByProduct.get(String(r._id)) ?? 0;
      return { productId: String(r._id), title: titles.get(String(r._id)) ?? 'Product', revenue: r.revenue, units: r.units, views, conversion: views > 0 ? Math.round((r.orders / views) * 10_000) / 100 : 0 };
    }),
    traffic: [...traffic.entries()].map(([source, views]) => ({ source, views })).sort((a, b) => b.views - a.views),
    customers: { new: buyers.filter((b) => b.first >= from).length, returning: buyers.filter((b) => b.first < from).length },
    channels: { online: channelRows.find((c) => c._id === 'online')?.n ?? 0, pos: channelRows.find((c) => c._id === 'pos')?.n ?? 0 },
  };
}

export function analyticsCsv(r: AnalyticsReport): string {
  let out = '﻿' + csvRow(['date', 'sales_minor', 'orders', 'units']);
  for (const s of r.series) out += csvRow([s.date, s.sales, s.orders, s.units]);
  out += '\r\n' + csvRow(['product_id', 'title', 'revenue_minor', 'units', 'views', 'conversion_pct']);
  for (const p of r.topProducts) out += csvRow([p.productId, p.title, p.revenue, p.units, p.views, p.conversion]);
  out += '\r\n' + csvRow(['funnel_visits', 'product_views', 'add_to_cart', 'orders', 'new_customers', 'returning_customers']);
  out += csvRow([r.funnel.visits, r.funnel.productViews, r.funnel.addToCart, r.funnel.orders, r.customers.new, r.customers.returning]);
  return out;
}

const safe = (s: string) => s.replace(/[^\x20-\x7E\n]/g, '?');

export function analyticsPdf(storeName: string, r: AnalyticsReport): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.fillColor('#0E5E5A').fontSize(20).text(safe(`${storeName} - Analytics`));
    doc.fillColor('#8A8178').fontSize(10).text(`${r.from.slice(0, 10)} to ${r.to.slice(0, 10)} (${r.range})`).moveDown();
    const total = r.series.reduce((a, s) => a + s.sales, 0);
    doc.fillColor('#2A2622').fontSize(12).text(safe(`Sales: ${formatMoney(total)}   Orders: ${r.funnel.orders}   Units: ${r.series.reduce((a, s) => a + s.units, 0)}`));
    doc.text(`Funnel: visits ${r.funnel.visits} > product views ${r.funnel.productViews} > add to cart ${r.funnel.addToCart} > orders ${r.funnel.orders}`);
    doc.text(`Customers: ${r.customers.new} new, ${r.customers.returning} returning. Channels: ${r.channels.online} online, ${r.channels.pos} POS`).moveDown();
    doc.fillColor('#0E5E5A').fontSize(14).text('Top products').fillColor('#2A2622').fontSize(10);
    for (const p of r.topProducts) doc.text(safe(`${p.title.slice(0, 60)} - ${formatMoney(p.revenue)} - ${p.units} units - ${p.views} views - ${p.conversion}%`));
    doc.moveDown().fillColor('#0E5E5A').fontSize(14).text('Traffic sources').fillColor('#2A2622').fontSize(10);
    for (const t of r.traffic.slice(0, 15)) doc.text(safe(`${t.source}: ${t.views}`));
    doc.end();
  });
}

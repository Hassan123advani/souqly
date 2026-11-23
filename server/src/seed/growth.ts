import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { Types } from 'mongoose';
import { logger } from '../lib/logger';
import { AnalyticsEvent } from '../modules/analytics/analyticsEvent.model';
import { Product } from '../modules/catalog/product.model';
import { reconcileLedger } from '../modules/finance/finance.service';
import { SellerLedger } from '../modules/finance/ledger.model';
import { Bundle, Promotion, StoreFlashDeal } from '../modules/marketing/marketing.model';
import { Order } from '../modules/orders/order.model';
import { PlanRequest } from '../modules/plans/plan.service';
import { closeShift, syncSales } from '../modules/pos/pos.service';
import { PosShift } from '../modules/pos/posShift.model';
import { Store, type StoreDoc } from '../modules/stores/store.model';
import { utcDay } from '../modules/stores/storeVisit.service';
import { Voucher } from '../modules/vouchers/voucher.model';

const DAY = 86_400_000;

/**
 * Phase 10 demo data: store vouchers, flash deals, bundles, BXGY, a pending plan upgrade
 * request, seller ledger (from seeded orders + payouts), POS sales + a closed shift and
 * 14 days of analytics counters. Idempotent: skipped when demo flash deals already exist.
 */
export async function seedGrowth(): Promise<Record<string, number>> {
  if (await StoreFlashDeal.exists({ demo: true })) return { skipped: 1 };
  const stores = await Store.find({ demo: true, status: 'approved' }).sort({ createdAt: 1 }).limit(4);
  if (stores.length < 2) return { skipped: 1 };
  const out: Record<string, number> = { vouchers: 0, flashDeals: 0, bundles: 0, promotions: 0, posSales: 0, ledger: 0, analytics: 0 };
  const now = Date.now();

  // Plans themselves come from data/stores.ts (Free / Pro / Business mix); add one pending upgrade request.
  const freeStore = await Store.findOne({ demo: true, status: 'approved', plan: 'free' }).select('_id ownerId').lean();
  if (freeStore) await PlanRequest.create({ storeId: freeStore._id, from: 'free', plan: 'pro', note: 'We want POS for our shop', requestedBy: freeStore.ownerId, demo: true });

  for (const [i, store] of stores.entries()) {
    const products = await Product.find({ storeId: store._id, status: 'published', deletedAt: { $exists: false } }).sort({ _id: 1 }).limit(6).lean();
    if (products.length < 4) continue;
    const [a, b, c, d] = products as [(typeof products)[number], (typeof products)[number], (typeof products)[number], (typeof products)[number]];
    const prefix = store.slug.replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase();
    await Voucher.create([
      { code: `${prefix}FAN10`, scope: 'store', storeId: store._id, title: 'Followers get 10% off', type: 'percent', value: 1000, minSpend: 200_000, maxDiscount: 100_000, startsAt: new Date(now - DAY), endsAt: new Date(now + 30 * DAY), usageLimit: 500, perUserLimit: 1, followerOnly: true, demo: true },
      { code: `${prefix}300`, scope: 'store', storeId: store._id, title: 'Rs. 300 off on Rs. 3,000', type: 'fixed', value: 30_000, minSpend: 300_000, startsAt: new Date(now - DAY), endsAt: new Date(now + 30 * DAY), usageLimit: 0, perUserLimit: 2, productIds: [a._id, b._id], demo: true },
    ]).catch((err) => logger.warn({ err }, 'growth seed: voucher skipped'));
    out.vouchers! += 2;

    const v = a.variants[0]!;
    await StoreFlashDeal.create({
      storeId: store._id,
      title: 'Weekend flash deal',
      startsAt: new Date(now - 3_600_000),
      endsAt: new Date(now + 3 * DAY),
      items: [{ productId: a._id, variantId: v._id, price: Math.round((v.price * 0.8) / 100) * 100, quantityLimit: 20, sold: 3 }],
      demo: true,
    });
    out.flashDeals! += 1;
    const regular = b.priceMin + c.priceMin;
    await Bundle.create({ storeId: store._id, name: `${b.title.split(' ').slice(0, 2).join(' ')} + ${c.title.split(' ').slice(0, 2).join(' ')} set`, items: [{ productId: b._id, qty: 1 }, { productId: c._id, qty: 1 }], bundlePrice: Math.round((regular * 0.85) / 100) * 100, demo: true });
    out.bundles! += 1;
    await Promotion.create({ storeId: store._id, type: 'bxgy', name: i % 2 ? 'Buy 2, get 1 at half price' : 'Buy 1, get 1 free', buy: { productIds: [d._id], qty: i % 2 ? 2 : 1 }, get: { productIds: [d._id], qty: 1, discountBps: i % 2 ? 5000 : 10_000 }, startsAt: new Date(now - DAY), endsAt: new Date(now + 14 * DAY), demo: true });
    out.promotions! += 1;
    await Store.updateOne({ _id: store._id }, { $set: { featuredProductIds: products.slice(0, 4).map((p) => p._id) } });

    // Analytics counters (last 14 days).
    const docs = [];
    for (let day = 0; day < 14; day++) {
      const date = utcDay(new Date(now - day * DAY));
      for (const [j, p] of products.entries()) {
        docs.push({ storeId: store._id, date, type: 'product_view', productId: p._id, source: ['', 'whatsapp', 'instagram', 'facebook'][(day + j) % 4]!, count: 5 + ((day * 7 + j * 3) % 20), demo: true });
        docs.push({ storeId: store._id, date, type: 'add_to_cart', productId: p._id, source: '', count: 1 + ((day + j) % 4), demo: true });
      }
      docs.push({ storeId: store._id, date, type: 'store_view', productId: null, source: day % 3 ? 'instagram' : '', count: 20 + day, demo: true });
    }
    await AnalyticsEvent.insertMany(docs, { ordered: false }).catch(() => undefined);
    out.analytics! += docs.length;

    await reconcileLedger(store._id);
  }

  // POS: a closed shift with a few sales for the Pro store.
  const pro = stores[0]! as StoreDoc;
  const posProducts = await Product.find({ storeId: pro._id, status: 'published', totalStock: { $gt: 5 } }).limit(3).lean();
  if (posProducts.length) {
    const req = { store: pro, user: { id: String(pro.ownerId), permissions: [] }, headers: {}, ip: '127.0.0.1', get: () => undefined, header: () => undefined } as unknown as Request;
    const shift = await PosShift.create({ storeId: pro._id, openedBy: pro.ownerId, openingCash: 500_000, openedAt: new Date(now - 6 * 3_600_000), demo: true });
    const sales = posProducts.map((p, k) => {
      const v = p.variants[0]!;
      const total = v.price * (k + 1);
      return {
        clientId: randomUUID(),
        createdAt: new Date(now - (5 - k) * 3_600_000),
        items: [{ variantId: String(v._id), qty: k + 1, price: v.price, discount: 0 }],
        payments: k === 1 ? [{ method: 'card' as const, amount: total }] : [{ method: 'cash' as const, amount: Math.ceil(total / 100_000) * 100_000 }],
        discount: 0,
        shiftId: String(shift._id),
        ...(k === 0 ? { customer: { name: 'Walk-in regular', phone: '+923001112233' } } : {}),
      };
    });
    const results = await syncSales(req, sales);
    await Order.updateMany({ storeId: pro._id, channel: 'pos' }, { $set: { demo: true } });
    out.posSales = results.filter((r) => r.status === 'created').length;
    const cashExpected = 500_000 + sales.filter((s) => s.payments[0]!.method === 'cash').reduce((a, s) => a + s.items[0]!.price * s.items[0]!.qty, 0);
    await closeShift(req, String(shift._id), cashExpected - 5_000, 'Demo: Rs. 50 short');
  }

  out.ledger = await SellerLedger.countDocuments({ storeId: { $in: stores.map((s) => s._id as Types.ObjectId) } });
  await SellerLedger.updateMany({ storeId: { $in: stores.map((s) => s._id) } }, { $set: { demo: true } });
  return out;
}

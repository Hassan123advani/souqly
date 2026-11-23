import { describe, expect, it } from 'vitest';
import { makeOrder, setPlan } from '../../test/growthFixtures';
import { xhr } from '../../test/helpers';
import { Product } from '../catalog/product.model';
import { computeHealth, type HealthMetrics } from '../health/storeHealth.service';
import { addStaff, api, makeBuyer, makeItem, makeSeller } from '../orders/orderTestFixtures';
import { Store } from '../stores/store.model';
import { AnalyticsEvent } from './analyticsEvent.model';
import { trafficSource } from './analytics.service';

const until = async (fn: () => Promise<boolean>) => {
  for (let i = 0; i < 50 && !(await fn()); i++) await new Promise((r) => setTimeout(r, 20));
};

describe('traffic source', () => {
  it('prefers utm_source, normalises and caps', () => {
    expect(trafficSource({ ref: 'Facebook', utm_source: 'WhatsApp Status' })).toBe('whatsappstatus');
    expect(trafficSource({ ref: 'insta<script>' })).toBe('instascript');
    expect(trafficSource({})).toBe('');
  });
});

describe('seller analytics API', () => {
  it('funnel, top products, traffic, new vs returning, CSV/PDF export (Pro) and tenant isolation', async () => {
    const s = await makeSeller('Analytics Store');
    const other = await makeSeller('Analytics Other');
    const item = await makeItem(s.store._id, 100_000, 10);
    const slug = (await Product.findById(item.productId).lean())!.slug;

    await xhr().get(api(`/products/${slug}?utm_source=whatsapp`));
    await xhr().get(api(`/stores/${s.store.slug}?ref=instagram`));
    const buyer = await makeBuyer();
    await buyer.agent.post(api('/cart/items')).send({ productId: item.productId, variantId: item.variantId, qty: 1 });
    await until(async () => (await AnalyticsEvent.countDocuments({ storeId: s.store._id })) >= 3);

    const returning = await makeBuyer();
    await makeOrder({ storeId: s.store._id, buyerId: returning.user._id, total: 50_000, createdAt: new Date(Date.now() - 200 * 86_400_000) });
    await makeOrder({ storeId: s.store._id, buyerId: returning.user._id, total: 100_000, productId: item.productId, variantId: item.variantId });
    await makeOrder({ storeId: s.store._id, buyerId: buyer.user._id, total: 100_000, productId: item.productId, variantId: item.variantId });

    let res = await s.agent.get(api('/seller/analytics?range=7d'));
    expect(res.status).toBe(200);
    const r = res.body.data;
    expect(r.series).toHaveLength(7);
    expect(r.funnel).toMatchObject({ productViews: 1, addToCart: 1, orders: 2 });
    expect(r.traffic).toEqual(expect.arrayContaining([{ source: 'whatsapp', views: 1 }, { source: 'instagram', views: 1 }]));
    expect(r.topProducts[0]).toMatchObject({ productId: item.productId, revenue: 200_000, units: 2, views: 1 });
    expect(r.customers).toEqual({ new: 1, returning: 1 });

    // Export needs Pro.
    expect((await s.agent.get(api('/seller/analytics?format=pdf'))).body.error.code).toBe('PLAN_LIMIT');
    await setPlan(s.store._id, 'pro');
    res = await s.agent.get(api('/seller/analytics?format=csv'));
    expect(res.text).toContain('funnel_visits');
    res = await s.agent.get(api('/seller/analytics?format=pdf')).buffer(true);
    expect(res.headers['content-type']).toBe('application/pdf');

    // Isolation: the other store sees none of it; staff without the permission are refused.
    const o = (await other.agent.get(api('/seller/analytics'))).body.data;
    expect(o.funnel).toMatchObject({ productViews: 0, addToCart: 0, orders: 0 });
    expect(o.topProducts).toEqual([]);
    const cashier = await addStaff(s.store._id, 'CASHIER');
    expect((await cashier.agent.get(api('/seller/analytics'))).status).toBe(403);
  });
});

const base: HealthMetrics = {
  orders: 0,
  delivered: 0,
  cancelled: 0,
  shipped: 0,
  shippedOnTime: 0,
  returns: 0,
  ratingAvg: 0,
  ratingCount: 0,
  responseRate: 100,
  responseTimeHours: 1,
  policy: { shipping: true, returns: true, warranty: true, phone: true, address: true, logo: true, description: true },
};

describe('store health', () => {
  it('computeHealth: perfect new store = 100; bad operations lower the score with recommendations', () => {
    expect(computeHealth(base)).toMatchObject({ score: 100, recommendations: [] });
    const bad = computeHealth({ ...base, orders: 10, delivered: 5, cancelled: 4, shipped: 6, shippedOnTime: 2, returns: 3, ratingAvg: 3, ratingCount: 10, responseRate: 50, responseTimeHours: 30, policy: { ...base.policy, returns: false } });
    expect(bad.score).toBeLessThan(60);
    expect(bad.factors.map((f) => f.key)).toEqual(['fulfilmentRate', 'onTimeShipRate', 'cancellationRate', 'returnRate', 'rating', 'chatResponse', 'policyCompleteness']);
    expect(bad.recommendations.join(' ')).toMatch(/return policy/);
    expect(bad.recommendations.length).toBeGreaterThan(4);
  });

  it('GET /seller/health computes + stores the score; recompute on demand; tenant scoped', async () => {
    const s = await makeSeller('Health Store');
    const other = await makeSeller('Health Other');
    await makeOrder({ storeId: s.store._id, status: 'cancelled' });
    let res = await s.agent.get(api('/seller/health'));
    expect(res.status).toBe(200);
    expect(res.body.data.factors.find((f: { key: string }) => f.key === 'cancellationRate').value).toBe(0);
    expect((await Store.findById(s.store._id).lean())!.healthScore).toBe(res.body.data.score);
    res = await s.agent.post(api('/seller/health/recompute'));
    expect(res.body.data.recommendations.length).toBeGreaterThan(0);
    // The other store's score is unaffected by this store's cancellation.
    const o = (await other.agent.get(api('/seller/health'))).body.data;
    expect(o.factors.find((f: { key: string }) => f.key === 'cancellationRate').value).toBe(1);
  });
});

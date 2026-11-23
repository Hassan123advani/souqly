import type { PlatformRole } from '@souqly/shared';
import { describe, expect, it } from 'vitest';
import { makeOrder } from '../../test/growthFixtures';
import { api, signupAgent } from '../../test/helpers';
import { FlashSale, HomeContent } from '../catalog/marketing.models';
import { CommissionRule } from '../commission/commission.model';
import { makeItem, makeSeller, categories } from '../orders/orderTestFixtures';
import { Payout } from '../payouts/payout.model';
import { Product } from '../catalog/product.model';
import { Store } from '../stores/store.model';
import { User } from '../users/user.model';

async function staff(role: PlatformRole) {
  const s = await signupAgent({ name: `${role} p10` });
  await User.updateOne({ email: s.email }, { $set: { platformRole: role } });
  const user = await User.findOne({ email: s.email }).lean();
  return { agent: s.agent, user: user! };
}

describe('Phase 10 admin routers never block other /admin routes', () => {
  it('impersonation/stop works for the impersonated (non-staff) session with the Phase 10 routers mounted', async () => {
    const admin = await staff('ADMIN');
    const buyer = await signupAgent({ name: 'P10 Imp Target' });
    const buyerId = String((await User.findOne({ email: buyer.email }).lean())!._id);
    expect((await admin.agent.post(api(`/admin/users/${buyerId}/impersonate`)).send({ reason: 'Regression check' })).status).toBe(200);
    // Phase 10 admin routes reject the impersonated session via can() (not a router-wide guard)...
    expect((await admin.agent.get(api('/admin/plan-requests'))).body.error.code).toBe('IMPERSONATION_FORBIDDEN');
    expect((await admin.agent.get(api('/admin/gift-cards'))).body.error.code).toBe('IMPERSONATION_FORBIDDEN');
    // ...while stop still reaches its handler.
    const stop = await admin.agent.post(api('/admin/impersonation/stop'));
    expect(stop.status, JSON.stringify(stop.body)).toBe(200);
    expect((await admin.agent.get(api('/admin/plan-requests'))).status).toBe(200);
  });
});

describe('admin API gaps (Phase 10 follow-ups)', () => {
  it('dashboard returns previous-period totals and deltas', async () => {
    const admin = await staff('ADMIN');
    const s = await makeSeller('P10 Dash');
    const day = 86_400_000;
    await makeOrder({ storeId: s.store._id, total: 300_000, createdAt: new Date(Date.now() - 2 * day) });
    await makeOrder({ storeId: s.store._id, total: 100_000, createdAt: new Date(Date.now() - 12 * day) });
    const from = new Date(Date.now() - 10 * day).toISOString();
    const res = await admin.agent.get(api(`/admin/dashboard?from=${from}&to=${new Date().toISOString()}`));
    expect(res.status).toBe(200);
    expect(res.body.data.previous.gmv).toBeGreaterThanOrEqual(100_000);
    expect(res.body.data.deltas).toHaveProperty('gmv');
    expect(res.body.data.deltas).toHaveProperty('newSignups');
    expect(typeof res.body.data.deltas.orders === 'number' || res.body.data.deltas.orders === null).toBe(true);
  });

  it('flash sales, home featured, commission rules and payouts carry display names', async () => {
    const sa = await staff('SUPER_ADMIN');
    const s = await makeSeller('P10 Names Store');
    const item = await makeItem(s.store._id, 100_000);
    const { sub } = await categories();
    const sale = await FlashSale.create({ title: 'P10 Sale', startsAt: new Date(), endsAt: new Date(Date.now() + 86_400_000), items: [{ productId: item.productId, flashPrice: 50_000 }] });
    let res = await sa.agent.get(api('/admin/flash-sales'));
    const found = res.body.data.find((x: { id: string }) => x.id === String(sale._id));
    expect(found.items[0].product).toMatchObject({ id: item.productId, title: (await Product.findById(item.productId).lean())!.title });
    res = await sa.agent.get(api(`/admin/flash-sales/${sale._id}`));
    expect(res.body.data.items[0].product.id).toBe(item.productId);

    await HomeContent.updateOne({ key: 'home' }, { $set: { featured: { productIds: [item.product._id], storeIds: [s.store._id], categoryIds: [sub._id] } } }, { upsert: true });
    res = await sa.agent.get(api('/admin/cms/home'));
    expect(res.body.data.featured.products[0]).toMatchObject({ id: item.productId });
    expect(res.body.data.featured.stores[0]).toMatchObject({ name: 'P10 Names Store' });
    expect(res.body.data.featured.categories[0].id).toBe(String(sub._id));

    await CommissionRule.create({ scope: 'store', storeId: s.store._id, bps: 700 });
    res = await sa.agent.get(api('/admin/commission-rules'));
    expect(res.body.data.find((r: { storeId: string }) => r.storeId === String(s.store._id)).store).toMatchObject({ name: 'P10 Names Store' });

    const p = await Payout.create({ storeId: s.store._id, amount: 150_000, method: { type: 'bank', accountMasked: '****1' } });
    res = await sa.agent.post(api(`/admin/payouts/${p._id}/approve`));
    expect(res.body.data).toMatchObject({ storeName: 'P10 Names Store', method: { type: 'bank', accountMasked: '****1' } });
  });

  it('email template defaults, assignable staff, payments settings', async () => {
    const admin = await staff('ADMIN');
    let res = await admin.agent.get(api('/admin/email-templates/welcome/default'));
    expect(res.status).toBe(200);
    expect(res.body.data.subject).toBe('Welcome to Souqly!');
    expect(res.body.data.html).toContain('{{name}}');
    expect(res.body.data.variables).toEqual(expect.arrayContaining(['name', 'url']));
    expect((await admin.agent.get(api('/admin/email-templates/nope/default'))).status).toBe(400);

    const support = await staff('SUPPORT');
    const moderator = await staff('MODERATOR');
    res = await support.agent.get(api('/admin/staff/assignable?permission=admin.support.manage'));
    expect(res.status).toBe(200);
    const ids = res.body.data.map((u: { id: string }) => u.id);
    expect(ids).toContain(String(support.user._id));
    expect(ids).not.toContain(String(moderator.user._id));
    expect(res.body.data[0]).not.toHaveProperty('email');
    expect((await moderator.agent.get(api('/admin/staff/assignable'))).status).toBe(403);
    expect((await support.agent.get(api('/admin/staff/assignable?permission=store.pos.use'))).status).toBe(400);

    res = await admin.agent.get(api('/admin/settings/payments'));
    expect(res.status).toBe(200);
    expect(res.body.data.integrations).toMatchObject({ cod: true, stripe: false, jazzcash: false });
    expect(res.body.data.methods.find((m: { method: string }) => m.method === 'stripe')).toMatchObject({ configured: false, available: false });
  });

  it('admin lists accept sort=newest|oldest|<metric> with working cursors', async () => {
    const sa = await staff('SUPER_ADMIN');
    const a = await makeSeller('P10 Sort A');
    const b = await makeSeller('P10 Sort B');
    await Store.updateOne({ _id: a.store._id }, { $set: { followerCount: 9_999 } });
    await Store.updateOne({ _id: b.store._id }, { $set: { followerCount: 9_998 } });
    let res = await sa.agent.get(api('/admin/stores?sort=followers&limit=1'));
    expect(res.body.data[0].id).toBe(String(a.store._id));
    res = await sa.agent.get(api(`/admin/stores?sort=followers&limit=1&cursor=${encodeURIComponent(res.body.meta.nextCursor)}`));
    expect(res.body.data[0].id).toBe(String(b.store._id));

    const o1 = await makeOrder({ storeId: a.store._id, total: 99_000_000 });
    expect((await sa.agent.get(api('/admin/orders?sort=total&limit=1'))).body.data[0].id).toBe(String(o1._id));
    const newest = (await sa.agent.get(api('/admin/users?sort=newest&limit=1'))).body.data[0].id;
    const oldest = (await sa.agent.get(api('/admin/users?sort=oldest&limit=1'))).body.data[0].id;
    expect(newest).not.toBe(oldest);
    expect((await sa.agent.get(api('/admin/users?sort=wallet'))).status).toBe(200);
    const item = await makeItem(a.store._id, 1000);
    await Product.updateOne({ _id: item.productId }, { $set: { soldCount: 1_000_000 } });
    expect((await sa.agent.get(api('/admin/products?sort=best_selling&limit=1'))).body.data[0].id).toBe(item.productId);
    expect((await sa.agent.get(api('/admin/products?sort=bogus'))).status).toBe(400);
  });
});

import { PLANS, planCommissionBps } from '@souqly/shared';
import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { setPlan } from '../../test/growthFixtures';
import { signupAgent } from '../../test/helpers';
import { Product } from '../catalog/product.model';
import { addStaff, api, categories, makeSeller } from '../orders/orderTestFixtures';
import { Store } from '../stores/store.model';
import { User } from '../users/user.model';

async function fillProducts(storeId: unknown, n: number) {
  await Product.collection.insertMany(Array.from({ length: n }, (_, i) => ({ storeId, title: `Filler ${i}`, slug: `filler-${String(storeId)}-${i}`, status: 'draft', variants: [] })));
}

describe('PLANS constant', () => {
  it('has the agreed limits and commission discounts', () => {
    expect(PLANS.free.limits).toEqual({ products: 50, staff: 2 });
    expect(PLANS.pro.limits).toEqual({ products: 1000, staff: 10 });
    expect(PLANS.business.limits).toEqual({ products: null, staff: 50 });
    expect(planCommissionBps(1000, 'business')).toBe(800);
    expect(planCommissionBps(50, 'business')).toBe(0);
    expect(PLANS.free.features.pos || PLANS.free.features.bulkUpload || PLANS.free.features.analyticsExport).toBe(false);
    expect(PLANS.business.features.customDomain).toBe(true);
  });
});

describe('plan limits', () => {
  it('product limit: Free blocks the 51st product with 403 PLAN_LIMIT; Pro allows it', async () => {
    const s = await makeSeller('Plan Products');
    const { sub } = await categories();
    await fillProducts(s.store._id, 50);
    const body = { title: 'One Too Many', categoryId: String(sub._id), variants: [{ price: 10_000, stock: 1 }] };
    let res = await s.agent.post(api('/seller/products')).send(body);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatchObject({ code: 'PLAN_LIMIT', details: { plan: 'free', limit: 'products', used: 50, max: 50 } });
    await setPlan(s.store._id, 'pro');
    res = await s.agent.post(api('/seller/products')).send(body);
    expect(res.status).toBe(201);
  });

  it('staff limit: Free allows 2 non-owner members', async () => {
    const s = await makeSeller('Plan Staff');
    await addStaff(s.store._id, 'ORDERS');
    await addStaff(s.store._id, 'INVENTORY');
    const invitee = await signupAgent({ name: 'Third' });
    const res = await s.agent.post(api('/seller/staff/invite')).send({ email: invitee.email, role: 'CASHIER' });
    expect(res.status).toBe(403);
    expect(res.body.error.details).toMatchObject({ limit: 'staff', used: 2, max: 2 });
  });

  it('analytics export needs Pro', async () => {
    const s = await makeSeller('Plan Analytics');
    expect((await s.agent.get(api('/seller/analytics?format=csv'))).body.error.code).toBe('PLAN_LIMIT');
    expect((await s.agent.get(api('/seller/analytics'))).status).toBe(200);
  });
});

describe('plan upgrade requests', () => {
  it('seller requests, admin approves, store plan changes; one pending at a time', async () => {
    const s = await makeSeller('Plan Upgrade');
    let res = await s.agent.get(api('/seller/plan'));
    expect(res.body.data).toMatchObject({ plan: 'free', usage: { products: 0, staff: 0 }, pendingRequest: null });
    expect((await s.agent.post(api('/seller/plan/request')).send({ plan: 'free' })).body.error.code).toBe('ALREADY_ON_PLAN');
    res = await s.agent.post(api('/seller/plan/request')).send({ plan: 'business', note: 'Growing fast' });
    expect(res.status).toBe(201);
    const id = res.body.data.id;
    expect((await s.agent.post(api('/seller/plan/request')).send({ plan: 'pro' })).body.error.code).toBe('REQUEST_PENDING');
    // Staff without settings permission cannot request; sellers cannot approve.
    const cashier = await addStaff(s.store._id, 'CASHIER');
    expect((await cashier.agent.post(api('/seller/plan/request')).send({ plan: 'pro' })).status).toBe(403);
    expect((await s.agent.patch(api(`/admin/plan-requests/${id}`)).send({ status: 'approved' })).status).toBe(403);

    const admin = await signupAgent({ name: 'Plan Admin' });
    await User.updateOne({ email: admin.email }, { $set: { platformRole: 'ADMIN' } });
    res = await admin.agent.get(api('/admin/plan-requests?status=pending'));
    expect(res.body.data.some((r: { id: string }) => r.id === id)).toBe(true);
    res = await admin.agent.patch(api(`/admin/plan-requests/${id}`)).send({ status: 'approved' });
    expect(res.status).toBe(200);
    expect((await Store.findById(s.store._id).lean())!.plan).toBe('business');
    expect((await admin.agent.patch(api(`/admin/plan-requests/${id}`)).send({ status: 'rejected' })).status).toBe(404);
    expect((await admin.agent.patch(api(`/admin/plan-requests/${new Types.ObjectId()}`)).send({ status: 'approved' })).status).toBe(404);
  });
});

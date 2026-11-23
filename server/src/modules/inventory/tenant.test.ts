import { beforeAll, describe, expect, it } from 'vitest';
import { makeCategoryTree, makeProduct } from '../../test/catalogFixtures';
import { api, signupAgent, xhr } from '../../test/helpers';
import { AuditLog } from '../audit/auditLog.model';
import { Product } from '../catalog/product.model';
import { CustomRole } from '../staff/customRole.model';
import { Store, type StoreDoc } from '../stores/store.model';
import { StoreMember } from '../stores/storeMember.model';
import { StoreVisit } from '../stores/storeVisit.model';
import { User } from '../users/user.model';
import { adjustStock } from './inventory.service';
import { StockMovement } from './stockMovement.model';

type Agent = Awaited<ReturnType<typeof signupAgent>>['agent'];
let ownerA: Agent;
let ownerB: Agent;
let ordersStaff: Agent;
let customStaff: Agent;
let storeA: StoreDoc;
let storeB: StoreDoc;
let productA = '';
let variantA = '';
let productB = '';
let variantB = '';
let customStaffMemberId = '';

async function seller(name: string) {
  const s = await signupAgent({ name });
  const u = await User.findOne({ email: s.email });
  return { ...s, userId: u!._id };
}

beforeAll(async () => {
  const [a, b, o, c] = await Promise.all([seller('Owner A'), seller('Owner B'), seller('Orders A'), seller('Custom A')]);
  ownerA = a.agent;
  ownerB = b.agent;
  ordersStaff = o.agent;
  customStaff = c.agent;
  storeA = await Store.create({ ownerId: a.userId, name: 'Inv A', slug: 'inv-a', status: 'approved' });
  storeB = await Store.create({ ownerId: b.userId, name: 'Inv B', slug: 'inv-b', status: 'approved' });
  const role = await CustomRole.create({ storeId: storeA._id, name: 'Stock clerk', permissions: ['store.products.view', 'store.inventory.manage'] });
  const members = await StoreMember.create([
    { storeId: storeA._id, userId: a.userId, role: 'OWNER' },
    { storeId: storeB._id, userId: b.userId, role: 'OWNER' },
    { storeId: storeA._id, userId: o.userId, role: 'ORDERS' },
    { storeId: storeA._id, userId: c.userId, role: 'CUSTOM', customRoleId: role._id },
  ]);
  customStaffMemberId = String(members[3]!._id);
  const { sub } = await makeCategoryTree();
  const pA = await makeProduct({ storeId: storeA._id, category: sub, title: 'Clay Pot', price: 50_000, stock: 10 });
  const pB = await makeProduct({ storeId: storeB._id, category: sub, title: 'Brass Lamp', price: 90_000, stock: 4 });
  productA = String(pA._id);
  variantA = String(pA.variants[0]!._id);
  productB = String(pB._id);
  variantB = String(pB.variants[0]!._id);
});

describe('inventory', () => {
  it('adjusts atomically, never below 0, and records movements', async () => {
    const up = await ownerA.post(api('/seller/inventory/adjust')).send({ productId: productA, variantId: variantA, delta: 5, reason: 'restock', note: 'New batch' });
    expect(up.status).toBe(200);
    expect(up.body.data.balanceAfter).toBe(15);
    const down = await ownerA.post(api('/seller/inventory/adjust')).send({ productId: productA, variantId: variantA, delta: -16, reason: 'damage' });
    expect(down.status).toBe(409);
    expect(down.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect((await Product.findById(productA).lean())!.totalStock).toBe(15);

    const mv = await ownerA.get(api(`/seller/inventory/movements?productId=${productA}`));
    expect(mv.body.data[0]).toMatchObject({ delta: 5, reason: 'restock', balanceAfter: 15, note: 'New batch', ref: { type: 'adjustment' } });
    expect(await AuditLog.exists({ action: 'store.stock_adjusted', storeId: storeA._id })).not.toBeNull();

    const list = await ownerA.get(api('/seller/inventory?q=clay'));
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({ productId: productA, variantId: variantA, stock: 15, available: 15, lowStock: false });
  });

  it('tracks per-warehouse stock', async () => {
    const w = await ownerA.post(api('/seller/warehouses')).send({ name: 'Main', address: { city: 'Lahore' } });
    expect(w.status).toBe(201);
    expect(w.body.data.isDefault).toBe(true); // first warehouse becomes default
    const wid = w.body.data.id;
    const add = await ownerA.post(api('/seller/inventory/adjust')).send({ productId: productA, variantId: variantA, warehouseId: wid, delta: 3, reason: 'restock' });
    expect(add.body.data.balanceAfter).toBe(18);
    const tooMuch = await ownerA.post(api('/seller/inventory/adjust')).send({ productId: productA, variantId: variantA, warehouseId: wid, delta: -4, reason: 'damage' });
    expect(tooMuch.status).toBe(409);
    const v = (await Product.findById(productA).lean())!.variants[0]!;
    expect(v.warehouseStock).toEqual([{ warehouseId: expect.anything(), qty: 3 }]);
    expect((await ownerA.delete(api(`/seller/warehouses/${wid}`))).status).toBe(409);
  });

  it('exported adjustStock() is scoped by storeId (Phase 6 entry point)', async () => {
    await expect(adjustStock({ storeId: storeA._id, productId: productB, variantId: variantB, delta: -1, reason: 'sale' })).rejects.toMatchObject({ status: 404 });
    const r = await adjustStock({ storeId: storeB._id, productId: productB, variantId: variantB, delta: -1, reason: 'sale', ref: { type: 'order', id: 'SQ-1' } });
    expect(r.balanceAfter).toBe(3);
    expect(await StockMovement.exists({ storeId: storeB._id, reason: 'sale', 'ref.id': 'SQ-1' })).not.toBeNull();
  });

  it('store A cannot see or adjust store B inventory / warehouses', async () => {
    const adj = await ownerA.post(api('/seller/inventory/adjust')).send({ productId: productB, variantId: variantB, delta: 100, reason: 'restock' });
    expect(adj.status).toBe(404);
    expect((await Product.findById(productB).lean())!.variants[0]!.stock).toBe(3);
    const list = await ownerA.get(api('/seller/inventory?limit=100'));
    expect(list.body.data.map((r: { productId: string }) => r.productId)).not.toContain(productB);
    const mv = await ownerA.get(api(`/seller/inventory/movements?productId=${productB}`));
    expect(mv.body.data).toEqual([]);
    const wB = await ownerB.post(api('/seller/warehouses')).send({ name: 'B depot', address: { city: 'Karachi' } });
    expect((await ownerA.patch(api(`/seller/warehouses/${wB.body.data.id}`)).send({ name: 'Hacked' })).status).toBe(404);
    expect((await ownerA.delete(api(`/seller/warehouses/${wB.body.data.id}`))).status).toBe(404);
    expect((await ownerA.get(api('/seller/warehouses'))).body.data.map((w: { id: string }) => w.id)).not.toContain(wB.body.data.id);
    // Using store A's warehouse id on store A's product but via store B → 404.
    expect((await ownerA.post(api('/seller/inventory/adjust')).send({ productId: productA, variantId: variantA, warehouseId: wB.body.data.id, delta: 1, reason: 'restock' })).status).toBe(404);
  });

  it('ORDERS-role staff cannot adjust inventory', async () => {
    const res = await ordersStaff.post(api('/seller/inventory/adjust')).send({ productId: productA, variantId: variantA, delta: 1, reason: 'restock' });
    expect(res.status).toBe(403);
    expect((await ordersStaff.post(api('/seller/warehouses')).send({ name: 'X', address: { city: 'Lahore' } })).status).toBe(403);
  });
});

describe('custom roles', () => {
  it('storeContext resolves custom role permissions', async () => {
    const ok = await customStaff.post(api('/seller/inventory/adjust')).send({ productId: productA, variantId: variantA, delta: 1, reason: 'correction' });
    expect(ok.status).toBe(200);
    expect((await customStaff.get(api('/seller/dashboard'))).status).toBe(403); // not in the role
    expect((await customStaff.get(api('/seller/staff'))).status).toBe(403);
    const me = await customStaff.get(api('/seller/store'));
    expect(me.body.data.myRole).toBe('CUSTOM');
    expect(me.body.data.myPermissions.sort()).toEqual(['store.inventory.manage', 'store.products.view']);
  });

  it('role edits apply immediately; permissions must be store.* and grantable', async () => {
    const roles = await ownerA.get(api('/seller/roles'));
    const role = roles.body.data.find((r: { name: string }) => r.name === 'Stock clerk');
    expect(role.memberCount).toBe(1);
    expect((await ownerA.patch(api(`/seller/roles/${role.id}`)).send({ permissions: ['admin.users.manage'] })).status).toBe(400);
    expect((await ownerA.post(api('/seller/roles')).send({ name: 'Bad', permissions: ['store.nope'] })).status).toBe(400);
    expect((await ownerA.patch(api(`/seller/roles/${role.id}`)).send({ permissions: ['store.products.view'] })).status).toBe(200);
    expect((await customStaff.post(api('/seller/inventory/adjust')).send({ productId: productA, variantId: variantA, delta: 1, reason: 'correction' })).status).toBe(403);
    expect((await ownerA.delete(api(`/seller/roles/${role.id}`))).status).toBe(409); // still assigned
    expect((await ownerA.post(api('/seller/roles')).send({ name: 'stock CLERK', permissions: ['store.products.view'] })).status).toBe(409);
  });

  it('store A cannot read, edit, delete or assign store B roles', async () => {
    const rB = await ownerB.post(api('/seller/roles')).send({ name: 'B packer', permissions: ['store.orders.view'] });
    expect(rB.status).toBe(201);
    const id = rB.body.data.id;
    expect((await ownerA.get(api('/seller/roles'))).body.data.map((r: { id: string }) => r.id)).not.toContain(id);
    expect((await ownerA.patch(api(`/seller/roles/${id}`)).send({ permissions: ['store.staff.manage'] })).status).toBe(404);
    expect((await ownerA.delete(api(`/seller/roles/${id}`))).status).toBe(404);
    expect((await ownerA.patch(api(`/seller/staff/${customStaffMemberId}`)).send({ customRoleId: id })).status).toBe(404);
    expect((await CustomRole.findById(id).lean())!.permissions).toEqual(['store.orders.view']);
  });
});

describe('staff', () => {
  it('invites an existing user who accepts; owner is protected; cross-store edits fail', async () => {
    const invitee = await seller('Invitee');
    const inv = await ownerA.post(api('/seller/staff/invite')).send({ email: invitee.email, role: 'INVENTORY' });
    expect(inv.status).toBe(201);
    expect(inv.body.data.status).toBe('invited');
    const memberId = inv.body.data.member.id;
    expect((await invitee.agent.get(api('/seller/dashboard'))).status).toBe(403); // not active yet
    const mine = await invitee.agent.get(api('/seller/invitations'));
    expect(mine.body.data[0]).toMatchObject({ id: memberId, role: 'INVENTORY', store: { slug: 'inv-a' } });
    expect((await ownerB.post(api(`/seller/invitations/${memberId}/accept`))).status).toBe(404); // not theirs
    expect((await invitee.agent.post(api(`/seller/invitations/${memberId}/accept`))).status).toBe(204);
    expect((await invitee.agent.get(api('/seller/dashboard'))).status).toBe(200);

    const unknown = await ownerA.post(api('/seller/staff/invite')).send({ email: 'nobody-here@test.souqly.pk', role: 'ORDERS' });
    expect(unknown.body.data).toEqual({ status: 'email_sent' });
    expect((await ownerA.post(api('/seller/staff/invite')).send({ email: invitee.email, role: 'OWNER' })).status).toBe(400);

    const staff = (await ownerA.get(api('/seller/staff'))).body.data as { id: string; role: string }[];
    const ownerMember = staff.find((m) => m.role === 'OWNER')!;
    expect((await ownerA.patch(api(`/seller/staff/${ownerMember.id}`)).send({ role: 'ORDERS' })).status).toBe(403);
    expect((await ownerA.delete(api(`/seller/staff/${ownerMember.id}`))).status).toBe(403);

    // Store B owner cannot touch store A staff.
    expect((await ownerB.patch(api(`/seller/staff/${memberId}`)).send({ role: 'MANAGER' })).status).toBe(404);
    expect((await ownerB.delete(api(`/seller/staff/${memberId}`))).status).toBe(404);
    expect((await ownerB.get(api('/seller/staff'))).body.data.map((m: { id: string }) => m.id)).not.toContain(memberId);
    expect((await ordersStaff.get(api('/seller/staff'))).status).toBe(403);

    expect((await ownerA.patch(api(`/seller/staff/${memberId}`)).send({ status: 'disabled' })).status).toBe(200);
    expect((await invitee.agent.get(api('/seller/dashboard'))).status).toBe(403);
    expect((await ownerA.delete(api(`/seller/staff/${memberId}`))).status).toBe(204);
  });

  it('activity log is store-scoped', async () => {
    const a = await ownerA.get(api('/seller/activity?limit=100'));
    expect(a.status).toBe(200);
    expect(a.body.data.length).toBeGreaterThan(0);
    const b = await ownerB.get(api('/seller/activity?limit=100'));
    const bActions = b.body.data.map((e: { action: string }) => e.action);
    expect(bActions).not.toContain('store.staff_invited');
    const ids = new Set(a.body.data.map((e: { id: string }) => e.id));
    expect(b.body.data.some((e: { id: string }) => ids.has(e.id))).toBe(false);
  });
});

describe('settings', () => {
  it('shipping settings default, save, validate and stay per store', async () => {
    const def = await ownerA.get(api('/seller/settings/shipping'));
    expect(def.body.data.zones[0]).toMatchObject({ cities: 'all' });
    const body = { zones: [{ name: 'Lahore', cities: ['Lahore'], rate: 15_000, freeAbove: 300_000, etaDays: [1, 2] }, { name: 'Rest', cities: 'all', rate: 25_000, etaDays: [3, 5] }], processingDays: 2 };
    const put = await ownerA.put(api('/seller/settings/shipping')).send(body);
    expect(put.status).toBe(200);
    expect(put.body.data).toEqual(body);
    expect((await ownerA.put(api('/seller/settings/shipping')).send({ ...body, zones: [{ ...body.zones[0], rate: -1 }] })).status).toBe(400);
    expect((await ownerA.put(api('/seller/settings/shipping')).send({ ...body, storeId: String(storeB._id) })).status).toBe(400);
    expect((await ownerB.get(api('/seller/settings/shipping'))).body.data.processingDays).toBe(1);
    expect((await ordersStaff.put(api('/seller/settings/shipping')).send(body)).status).toBe(403);
    const store = await ownerA.get(api('/seller/store'));
    expect(store.body.data.checklist.shipping).toBe(true);
    const n = await ownerA.put(api('/seller/settings/notifications')).send({ lowStockThreshold: 20 });
    expect(n.body.data).toMatchObject({ lowStockThreshold: 20, newOrderEmail: true });
    const low = await ownerA.get(api('/seller/inventory?lowStock=1'));
    expect(low.body.data.map((r: { productId: string }) => r.productId)).toContain(productA);
  });
});

describe('dashboard', () => {
  it('returns KPIs (orders 0 until Phase 6), visitors from public views, isolated per store', async () => {
    await xhr().get(api('/stores/inv-a'));
    await xhr().get(api('/stores/inv-a'));
    const visit = await StoreVisit.findOne({ storeId: storeA._id }).lean();
    expect(visit).toMatchObject({ views: 2, visitors: 1 });

    const res = await ownerA.get(api('/seller/dashboard?range=7d'));
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.range).toBe('7d');
    expect(d.salesSeries).toHaveLength(7);
    expect(d.kpis.visitors.value).toBe(1);
    expect(d.todo.lowStock).toBeGreaterThanOrEqual(1);
    expect(d.healthScore.score).toBeGreaterThan(0);
    expect(d.healthScore.factors.map((f: { key: string }) => f.key)).toContain('listingQuality');

    const b = await ownerB.get(api('/seller/dashboard?range=7d'));
    expect(b.body.data.kpis.visitors.value).toBe(0);
    expect((await ownerA.get(api('/seller/dashboard?range=1y'))).status).toBe(400);
    expect((await ownerA.get(api('/seller/dashboard')).set('x-store-id', String(storeB._id))).status).toBe(403);
  });
});

describe('suspended store', () => {
  it('is blocked from every Seller Center route including GET /seller/store', async () => {
    const s = await seller('Suspended owner');
    const st = await Store.create({ ownerId: s.userId, name: 'Sus', slug: 'sus-store', status: 'suspended' });
    await StoreMember.create({ storeId: st._id, userId: s.userId, role: 'OWNER' });
    for (const path of ['/seller/store', '/seller/dashboard', '/seller/inventory', '/seller/staff', '/seller/settings/shipping']) {
      const res = await s.agent.get(api(path));
      expect(res.status, path).toBe(403);
      expect(res.body.error.code).toBe('STORE_SUSPENDED');
    }
    expect((await s.agent.patch(api('/seller/store/business')).send({ type: 'individual', legalName: 'Sus', cnicOrRegNo: '12345-1234567-1' })).status).toBe(403);
  });
});

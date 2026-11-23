import { beforeAll, describe, expect, it } from 'vitest';
import { sha256 } from '../../lib/crypto';
import { notifyOutbox } from '../../services/notify';
import { Product } from '../catalog/product.model';
import { Order } from './order.model';
import { addStaff, api, key, makeBuyer, makeItem, makeSeller } from './orderTestFixtures';

type Agent = Awaited<ReturnType<typeof makeBuyer>>['agent'];

let buyer: Awaited<ReturnType<typeof makeBuyer>>;
let buyer2: Awaited<ReturnType<typeof makeBuyer>>;
let sellerA: Awaited<ReturnType<typeof makeSeller>>;
let sellerB: Awaited<ReturnType<typeof makeSeller>>;
let itemA: Awaited<ReturnType<typeof makeItem>>;
let itemB: Awaited<ReturnType<typeof makeItem>>;

async function place(b: typeof buyer, items: { productId: string; variantId: string; qty: number }[]) {
  for (const it of items) await b.agent.post(api('/cart/items')).send(it);
  const res = await b.agent.post(api('/checkout')).send({ addressId: b.addressId, paymentMethod: 'cod', idempotencyKey: key() });
  expect(res.status).toBe(201);
  return res.body.data as { number: string; orders: { id: string; number: string; store: { id: string } }[] };
}

const stock = async (productId: string) => (await Product.findById(productId).lean())!.variants[0]!.stock;
const pdf = (agent: Agent, path: string) =>
  agent
    .get(api(path))
    .buffer(true)
    .parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });

beforeAll(async () => {
  buyer = await makeBuyer();
  buyer2 = await makeBuyer('Karachi');
  sellerA = await makeSeller('Tenant A');
  sellerB = await makeSeller('Tenant B');
  itemA = await makeItem(sellerA.store._id, 100_000, 20);
  itemB = await makeItem(sellerB.store._id, 80_000, 20);
});

describe('buyer orders', () => {
  it('lists by tab, shows detail with tracking steps, cancels with stock restore, reorders', async () => {
    const co = await place(buyer, [{ productId: itemA.productId, variantId: itemA.variantId, qty: 3 }]);
    const number = co.orders[0]!.number;
    expect(await stock(itemA.productId)).toBe(17);

    let res = await buyer.agent.get(api('/orders?tab=to_ship'));
    expect(res.status).toBe(200);
    expect(res.body.data.map((o: { number: string }) => o.number)).toContain(number);
    expect(res.body.meta.counts.to_ship).toBeGreaterThanOrEqual(1);
    expect((await buyer.agent.get(api('/orders?tab=delivered'))).body.data).toHaveLength(0);

    res = await buyer.agent.get(api(`/orders/${number}`));
    expect(res.body.data).toMatchObject({ number, status: 'placed', canCancel: true, checkoutNumber: co.number });
    expect(res.body.data.trackingSteps[0]).toMatchObject({ status: 'placed', done: true });
    expect(res.body.data.trackingSteps[1]).toMatchObject({ status: 'confirmed', done: false });

    res = await buyer.agent.post(api(`/orders/${number}/cancel`)).send({ reason: 'Ordered by mistake' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'cancelled', cancel: { by: 'buyer', reason: 'Ordered by mistake' } });
    expect(await stock(itemA.productId)).toBe(20);
    // Second cancel is an invalid transition and does not restore twice.
    expect((await buyer.agent.post(api(`/orders/${number}/cancel`)).send({ reason: 'again' })).status).toBe(409);
    expect(await stock(itemA.productId)).toBe(20);

    res = await buyer.agent.post(api(`/orders/${number}/reorder`));
    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ added: 1, skipped: 0 });
    expect(res.body.data.groups[0].items[0].qty).toBe(3);
    await buyer.agent.delete(api(`/cart/items/${res.body.data.groups[0].items[0].id}`));
  });

  it('a buyer cannot read, cancel or download another buyer’s order', async () => {
    const co = await place(buyer, [{ productId: itemA.productId, variantId: itemA.variantId, qty: 1 }]);
    const number = co.orders[0]!.number;
    expect((await buyer2.agent.get(api(`/orders/${number}`))).status).toBe(404);
    expect((await buyer2.agent.post(api(`/orders/${number}/cancel`)).send({ reason: 'not mine' })).status).toBe(404);
    expect((await buyer2.agent.get(api(`/orders/${number}/invoice.pdf`))).status).toBe(404);
    expect((await buyer2.agent.get(api('/orders'))).body.data.map((o: { number: string }) => o.number)).not.toContain(number);
    const own = await pdf(buyer.agent, `/orders/${number}/invoice.pdf`);
    expect(own.status).toBe(200);
    expect(own.headers['content-type']).toBe('application/pdf');
    expect((own.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    // Real content was drawn (a blank page is ~1 KB).
    expect((own.body as Buffer).length).toBeGreaterThan(2000); // blank page ≈ 1.2 KB
    // A member of the selling store may download it too; a member of another store may not.
    expect((await pdf(sellerA.agent, `/orders/${number}/invoice.pdf`)).status).toBe(200);
    expect((await sellerB.agent.get(api(`/orders/${number}/invoice.pdf`))).status).toBe(404);
  });
});

describe('seller orders', () => {
  let orderA = '';
  let orderB = '';

  beforeAll(async () => {
    const co = await place(buyer2, [
      { productId: itemA.productId, variantId: itemA.variantId, qty: 1 },
      { productId: itemB.productId, variantId: itemB.variantId, qty: 2 },
    ]);
    orderA = co.orders.find((o) => o.store.id === String(sellerA.store._id))!.id;
    orderB = co.orders.find((o) => o.store.id === String(sellerB.store._id))!.id;
  });

  it('lists only own orders with per-status counts and search', async () => {
    const res = await sellerA.agent.get(api('/seller/orders'));
    expect(res.status).toBe(200);
    const ids = res.body.data.map((o: { id: string }) => o.id);
    expect(ids).toContain(orderA);
    expect(ids).not.toContain(orderB);
    expect(res.body.meta.counts.placed).toBeGreaterThanOrEqual(1);
    expect(res.body.data[0].commission).toBeDefined();
    const one = await Order.findById(orderA).lean();
    const q = await sellerA.agent.get(api(`/seller/orders?q=${one!.number}`));
    expect(q.body.data.map((o: { id: string }) => o.id)).toEqual([orderA]);
  });

  it('Store A cannot read or act on Store B orders, invoices or labels', async () => {
    expect((await sellerA.agent.get(api(`/seller/orders/${orderB}`))).status).toBe(404);
    expect((await sellerA.agent.get(api(`/seller/orders/${orderB}/invoice.pdf`))).status).toBe(404);
    expect((await sellerA.agent.get(api(`/seller/orders/${orderB}/label.pdf`))).status).toBe(404);
    expect((await sellerA.agent.post(api(`/seller/orders/${orderB}/status`)).send({ to: 'confirmed' })).status).toBe(404);
    expect((await sellerA.agent.post(api(`/seller/orders/${orderB}/notes`)).send({ text: 'hi' })).status).toBe(404);
    const bulk = await sellerA.agent.post(api('/seller/orders/bulk-status')).send({ ids: [orderB], to: 'confirmed' });
    expect(bulk.body.data).toMatchObject({ updated: 0, results: [{ id: orderB, ok: false, error: 'NOT_FOUND' }] });
    // x-store-id cannot select a store the user is not a member of.
    expect((await sellerA.agent.get(api(`/seller/orders/${orderB}`)).set('x-store-id', String(sellerB.store._id))).status).toBe(403);
    expect((await Order.findById(orderB).lean())!.status).toBe('placed');
    expect((await sellerB.agent.get(api(`/seller/orders/${orderB}`))).status).toBe(200);
  });

  it('rejects invalid transitions and requires a reason to cancel', async () => {
    let res = await sellerA.agent.post(api(`/seller/orders/${orderA}/status`)).send({ to: 'shipped' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
    res = await sellerA.agent.post(api(`/seller/orders/${orderA}/status`)).send({ to: 'cancelled' });
    expect(res.status).toBe(400);
    res = await sellerA.agent.post(api(`/seller/orders/${orderA}/status`)).send({ to: 'delivered' });
    expect(res.status).toBe(400); // not a seller target status
  });

  it('ORDERS staff can manage orders; CASHIER cannot; shipping creates a buyer-only delivery OTP', async () => {
    const ordersStaff = await addStaff(sellerB.store._id, 'ORDERS');
    const cashier = await addStaff(sellerB.store._id, 'CASHIER');
    expect((await cashier.agent.get(api('/seller/orders'))).status).toBe(403);
    expect((await cashier.agent.post(api(`/seller/orders/${orderB}/status`)).send({ to: 'confirmed' })).status).toBe(403);

    let res = await ordersStaff.agent.post(api('/seller/orders/bulk-status')).send({ ids: [orderB], to: 'confirmed' });
    expect(res.body.data.updated).toBe(1);
    res = await ordersStaff.agent.post(api(`/seller/orders/${orderB}/status`)).send({ to: 'packed', note: 'Boxed' });
    expect(res.status).toBe(200);
    res = await ordersStaff.agent.post(api(`/seller/orders/${orderB}/notes`)).send({ text: 'Fragile' });
    expect(res.status).toBe(201);
    expect(res.body.data.sellerNotes[0].text).toBe('Fragile');

    res = await ordersStaff.agent.post(api(`/seller/orders/${orderB}/status`)).send({ to: 'shipped', tracking: { courier: 'TCS', trackingNumber: 'TCS123456' } });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'shipped', tracking: { courier: 'TCS', trackingNumber: 'TCS123456' } });
    expect(res.body.data.deliveryOtp).toBeUndefined(); // never shown to the seller
    expect(res.body.data.timeline.map((t: { status: string }) => t.status)).toEqual(['placed', 'confirmed', 'packed', 'shipped']);

    const number = res.body.data.number as string;
    const mine = await buyer2.agent.get(api(`/orders/${number}`));
    const otp = mine.body.data.deliveryOtp as string;
    expect(otp).toMatch(/^\d{4}$/);
    const stored = await Order.findById(orderB).select('+deliveryOtpHash').lean();
    expect(stored!.deliveryOtpHash).toBe(sha256(`${orderB}:${otp}`));
    await new Promise((r) => setTimeout(r, 50));
    expect(notifyOutbox.some((m) => m.text.includes(number) && m.text.includes(`code: ${otp}`))).toBe(true);

    // Buyer can no longer cancel a shipped order; seller cannot cancel either.
    expect((await buyer2.agent.post(api(`/orders/${number}/cancel`)).send({ reason: 'late' })).status).toBe(409);
    expect((await ordersStaff.agent.post(api(`/seller/orders/${orderB}/status`)).send({ to: 'cancelled', reason: 'Changed mind' })).status).toBe(409);

    const label = await pdf(ordersStaff.agent, `/seller/orders/${orderB}/label.pdf`);
    expect(label.status).toBe(200);
    expect((label.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    expect((label.body as Buffer).toString('latin1')).toContain('/MediaBox [0 0 288 432]');
    expect((label.body as Buffer).length).toBeGreaterThan(3000); // includes the QR image
  });

  it('seller cancel restores stock; rider assignment needs a store rider', async () => {
    const co = await place(buyer, [{ productId: itemA.productId, variantId: itemA.variantId, qty: 2 }]);
    const id = co.orders[0]!.id;
    const before = await stock(itemA.productId);
    let res = await sellerA.agent.post(api(`/seller/orders/${id}/status`)).send({ to: 'cancelled', reason: 'Out of stock in shop' });
    expect(res.status).toBe(200);
    expect(res.body.data.cancel).toMatchObject({ by: 'seller', reason: 'Out of stock in shop' });
    expect(await stock(itemA.productId)).toBe(before + 2);

    const co2 = await place(buyer, [{ productId: itemA.productId, variantId: itemA.variantId, qty: 1 }]);
    const id2 = co2.orders[0]!.id;
    await sellerA.agent.post(api(`/seller/orders/${id2}/status`)).send({ to: 'confirmed' });
    await sellerA.agent.post(api(`/seller/orders/${id2}/status`)).send({ to: 'packed' });
    const rider = await addStaff(sellerA.store._id, 'RIDER');
    const foreignRider = await addStaff(sellerB.store._id, 'RIDER');
    res = await sellerA.agent.post(api(`/seller/orders/${id2}/assign-rider`)).send({ riderMemberId: String(foreignRider.member._id) });
    expect(res.status).toBe(400);
    res = await sellerA.agent.post(api(`/seller/orders/${id2}/assign-rider`)).send({ riderMemberId: String(rider.member._id) });
    expect(res.status).toBe(200);
    expect(String((await Order.findById(id2).lean())!.riderId)).toBe(String(rider.user._id));
  });
});

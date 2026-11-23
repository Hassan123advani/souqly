import { beforeAll, describe, expect, it } from 'vitest';
import { Product } from '../catalog/product.model';
import { placeOrder } from '../delivery/deliveryTestFixtures';
import { Order } from '../orders/order.model';
import { addStaff, api, makeBuyer, makeItem, makeSeller } from '../orders/orderTestFixtures';
import { User } from '../users/user.model';
import { Dispute, ReturnRequest } from './return.model';

let buyer: Awaited<ReturnType<typeof makeBuyer>>;
let buyer2: Awaited<ReturnType<typeof makeBuyer>>;
let sellerA: Awaited<ReturnType<typeof makeSeller>>;
let sellerB: Awaited<ReturnType<typeof makeSeller>>;
let item: Awaited<ReturnType<typeof makeItem>>;
let noReturn: Awaited<ReturnType<typeof makeItem>>;
let rider: Awaited<ReturnType<typeof addStaff>>;

const DAY = 24 * 3600_000;

/** Places an order and marks it delivered `daysAgo` days ago (bypasses the rider flow). */
async function delivered(it: typeof item, daysAgo = 1, qty = 2) {
  const o = await placeOrder(buyer, it, qty);
  const at = new Date(Date.now() - daysAgo * DAY);
  await Order.updateOne({ _id: o.orderId }, { $set: { status: 'delivered' }, $push: { timeline: { status: 'delivered', at, actor: 'rider' } } });
  return o;
}

const stock = async (productId: string) => (await Product.findById(productId).lean())!.variants[0]!.stock;
const balance = async () => (await User.findById(buyer.user._id).lean())!.walletBalance ?? 0;

beforeAll(async () => {
  buyer = await makeBuyer();
  buyer2 = await makeBuyer();
  sellerA = await makeSeller('Returns A');
  sellerB = await makeSeller('Returns B');
  rider = await addStaff(sellerA.store._id, 'RIDER');
  item = await makeItem(sellerA.store._id, 40_000, 50);
  noReturn = await makeItem(sellerA.store._id, 10_000, 50);
  await Product.updateOne({ _id: noReturn.productId }, { $set: { returnPolicy: { days: 0 } } });
});

describe('returns', () => {
  it('enforces delivered status, ownership, item rules and the return window', async () => {
    const placed = await placeOrder(buyer, item);
    const body = (variantId: string, qty = 1) => ({ items: [{ variantId, qty }], reason: 'damaged', description: 'Broken' });
    expect((await buyer.agent.post(api(`/orders/${placed.number}/returns`)).send(body(item.variantId))).status).toBe(409);

    const old = await delivered(item, 10);
    expect((await buyer.agent.post(api(`/orders/${old.number}/returns`)).send(body(item.variantId))).body.error.code).toBe('RETURN_WINDOW_CLOSED');
    const nr = await delivered(noReturn, 1);
    expect((await buyer.agent.post(api(`/orders/${nr.number}/returns`)).send(body(noReturn.variantId))).body.error.code).toBe('NOT_RETURNABLE');

    const o = await delivered(item, 2);
    expect((await buyer2.agent.post(api(`/orders/${o.number}/returns`)).send(body(item.variantId))).status).toBe(404);
    expect((await buyer.agent.post(api(`/orders/${o.number}/returns`)).send(body(item.variantId, 3))).body.error.code).toBe('QTY_EXCEEDS_ORDERED');
    expect((await buyer.agent.post(api(`/orders/${o.number}/returns`)).send(body(noReturn.variantId))).body.error.code).toBe('ITEM_NOT_IN_ORDER');
    expect((await buyer.agent.post(api(`/orders/${o.number}/returns`)).send({ ...body(item.variantId), photos: ['forged'] })).body.error.code).toBe('INVALID_UPLOAD');
    const res = await buyer.agent.post(api(`/orders/${o.number}/returns`)).send(body(item.variantId));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: 'requested', refund: { method: 'wallet', amount: 40_000 }, order: { status: 'return_requested' } });
    expect((await buyer.agent.post(api(`/orders/${o.number}/returns`)).send(body(item.variantId))).status).toBe(409);
    expect((await buyer2.agent.get(api(`/returns/${res.body.data.id}`))).status).toBe(404);
    expect((await buyer.agent.get(api('/returns'))).body.data.map((r: { id: string }) => r.id)).toContain(res.body.data.id);
  });

  it('seller flow approve → received (restock) → refund credits the wallet exactly once; tenant + permission isolation', async () => {
    const o = await delivered(item, 1, 2);
    const r = (await buyer.agent.post(api(`/orders/${o.number}/returns`)).send({ items: [{ variantId: item.variantId, qty: 2 }], reason: 'wrong_item' })).body.data;
    const id = r.id as string;

    // Store B cannot see or act; a RIDER of store A lacks orders permissions.
    expect((await sellerB.agent.get(api(`/seller/returns/${id}`))).status).toBe(404);
    expect((await sellerB.agent.post(api(`/seller/returns/${id}/approve`)).send({})).status).toBe(404);
    expect((await sellerB.agent.get(api('/seller/returns'))).body.data.map((x: { id: string }) => x.id)).not.toContain(id);
    expect((await rider.agent.post(api(`/seller/returns/${id}/approve`)).send({})).status).toBe(403);
    expect((await buyer.agent.post(api(`/seller/returns/${id}/approve`)).send({})).status).toBe(403);

    expect((await sellerA.agent.post(api(`/seller/returns/${id}/refund`)).send({})).status).toBe(409);
    expect((await sellerA.agent.post(api(`/seller/returns/${id}/approve`)).send({ note: 'OK, send it back' })).body.data.status).toBe('approved');
    const before = await stock(item.productId);
    const rec = await sellerA.agent.post(api(`/seller/returns/${id}/received`)).send({});
    expect(rec.body.data).toMatchObject({ status: 'received', order: { status: 'returned' } });
    expect(await stock(item.productId)).toBe(before + 2);

    const bal = await balance();
    const [x, y] = await Promise.all([sellerA.agent.post(api(`/seller/returns/${id}/refund`)).send({}), sellerA.agent.post(api(`/seller/returns/${id}/refund`)).send({})]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);
    expect(await balance()).toBe(bal + 80_000);
    expect((await sellerA.agent.post(api(`/seller/returns/${id}/refund`)).send({})).status).toBe(409);
    expect(await balance()).toBe(bal + 80_000);
    const order = await Order.findById(o.orderId).lean();
    expect(order).toMatchObject({ status: 'refunded', payment: { status: 'refunded' } });
  });

  it('reject returns the order to delivered; buyer can escalate into a dispute', async () => {
    const o = await delivered(item, 1, 1);
    const id = (await buyer.agent.post(api(`/orders/${o.number}/returns`)).send({ items: [{ variantId: item.variantId, qty: 1 }], reason: 'changed_mind' })).body.data.id;
    expect((await sellerA.agent.post(api(`/seller/returns/${id}/reject`)).send({})).status).toBe(400);
    const rej = await sellerA.agent.post(api(`/seller/returns/${id}/reject`)).send({ note: 'Used item' });
    expect(rej.body.data).toMatchObject({ status: 'rejected', sellerNote: 'Used item', order: { status: 'delivered' } });
    expect((await buyer2.agent.post(api(`/returns/${id}/escalate`)).send({ message: 'Please help me' })).status).toBe(404);
    const esc = await buyer.agent.post(api(`/returns/${id}/escalate`)).send({ message: 'It was unused, please help' });
    expect(esc.body.data.status).toBe('escalated');
    expect(await Dispute.countDocuments({ returnId: id, status: 'open' })).toBe(1);
    expect((await ReturnRequest.findById(id).lean())!.disputeId).toBeTruthy();
  });
});

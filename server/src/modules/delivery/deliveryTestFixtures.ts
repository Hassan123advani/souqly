/** Test-only helpers for Phase 7 tests (imported by *.test.ts only). */
import { expect } from 'vitest';
import { key, makeBuyer, makeSeller } from '../orders/orderTestFixtures';
import { api } from '../../test/helpers';

type Buyer = Awaited<ReturnType<typeof makeBuyer>>;
type Seller = Awaited<ReturnType<typeof makeSeller>>;

export async function placeOrder(b: Buyer, item: { productId: string; variantId: string }, qty = 1) {
  expect((await b.agent.post(api('/cart/items')).send({ productId: item.productId, variantId: item.variantId, qty })).status).toBe(201);
  const res = await b.agent.post(api('/checkout')).send({ addressId: b.addressId, paymentMethod: 'cod', idempotencyKey: key() });
  expect(res.status).toBe(201);
  const o = res.body.data.orders[0] as { id: string; number: string; total: number };
  return { orderId: o.id, number: o.number, total: o.total };
}

/** Places an order and walks it to `shipped` with the given rider assigned. Returns the buyer's OTP. */
export async function shippedOrder(b: Buyer, s: Seller, item: { productId: string; variantId: string }, riderMemberId: string) {
  const o = await placeOrder(b, item);
  for (const to of ['confirmed', 'packed']) expect((await s.agent.post(api(`/seller/orders/${o.orderId}/status`)).send({ to })).status).toBe(200);
  expect((await s.agent.post(api(`/seller/orders/${o.orderId}/assign-rider`)).send({ riderMemberId })).status).toBe(200);
  expect((await s.agent.post(api(`/seller/orders/${o.orderId}/status`)).send({ to: 'shipped' })).status).toBe(200);
  const detail = await b.agent.get(api(`/orders/${o.number}`));
  return { ...o, otp: detail.body.data.deliveryOtp as string };
}

/** Test-only helpers for Phase 8 API tests (imported by *.test.ts only). */
import { expect } from 'vitest';
import { Types } from 'mongoose';
import { api, key, makeBuyer } from '../orders/orderTestFixtures';
import { transitionOrder } from '../orders/order.service';

type Buyer = Awaited<ReturnType<typeof makeBuyer>>;

export async function placeOrder(b: Buyer, items: { productId: string; variantId: string; qty: number }[], extra: Record<string, unknown> = {}) {
  for (const it of items) {
    const r = await b.agent.post(api('/cart/items')).send(it);
    expect([200, 201]).toContain(r.status);
  }
  const res = await b.agent.post(api('/checkout')).send({ addressId: b.addressId, paymentMethod: 'cod', idempotencyKey: key(), ...extra });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data as { number: string; orders: { id: string; number: string; total: number; store: { id: string } }[] };
}

const PATH = ['confirmed', 'packed', 'shipped', 'delivered'] as const;

/** Walks an order from placed to delivered (system actor), triggering the delivered hooks. */
export async function deliver(orderId: string) {
  for (const to of PATH) await transitionOrder(new Types.ObjectId(orderId), to, { userId: null, kind: 'system' });
}

export async function deliveredOrder(b: Buyer, items: { productId: string; variantId: string; qty: number }[]) {
  const placed = await placeOrder(b, items);
  for (const o of placed.orders) await deliver(o.id);
  return placed.orders;
}

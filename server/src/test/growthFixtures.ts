/** Test-only helpers for Phase 10 (seller growth) API tests. */
import type { OrderStatus } from '@souqly/shared';
import { Types } from 'mongoose';
import { Order } from '../modules/orders/order.model';
import { Store } from '../modules/stores/store.model';

let n = 0;
const DAY = 86_400_000;

export async function setPlan(storeId: unknown, plan: 'free' | 'pro' | 'business') {
  await Store.updateOne({ _id: storeId }, { $set: { plan } });
}

export async function setPayoutMethod(storeId: unknown) {
  await Store.updateOne(
    { _id: storeId },
    { $set: { payout: { method: 'bank', accountTitle: 'Test Owner', accountNumberEnc: 'enc', accountNumberLast4: '4321', bankName: 'HBL', updatedAt: new Date() } } },
  );
}

/** Creates an order directly (skips checkout). `deliveredDaysAgo` adds a delivered timeline entry. */
export async function makeOrder(o: { storeId: unknown; buyerId?: unknown; total?: number; sellerNet?: number; status?: OrderStatus; deliveredDaysAgo?: number; productId?: unknown; variantId?: unknown; createdAt?: Date }) {
  n++;
  const total = o.total ?? 200_000;
  const deliveredAt = o.deliveredDaysAgo !== undefined ? new Date(Date.now() - o.deliveredDaysAgo * DAY) : undefined;
  const number = `SQ-${String(100000 + n).slice(-6)}-${Math.random().toString(36).slice(2, 7).toUpperCase().padEnd(5, 'X')}-A`;
  return Order.create({
    storeId: o.storeId,
    number,
    buyerId: o.buyerId ?? new Types.ObjectId(),
    items: [{ productId: o.productId ?? new Types.ObjectId(), variantId: o.variantId ?? new Types.ObjectId(), title: 'Thing', sku: 'T-1', price: total, qty: 1, lineTotal: total }],
    subtotal: total,
    total,
    commission: { bps: 1000, amount: Math.round(total / 10) },
    sellerNet: o.sellerNet ?? total - Math.round(total / 10),
    status: o.status ?? (deliveredAt ? 'delivered' : 'placed'),
    timeline: [{ status: 'placed', at: o.createdAt ?? new Date(), actor: 'buyer' }, ...(deliveredAt ? [{ status: 'delivered', at: deliveredAt, actor: 'rider' }] : [])],
    payment: { method: 'cod', status: deliveredAt ? 'paid' : 'pending' },
    invoiceNumber: `INV-${number.slice(3)}`,
    ...(o.createdAt ? { createdAt: o.createdAt } : {}),
  });
}

export const withStore = (storeId: unknown) => ({ 'x-store-id': String(storeId) });

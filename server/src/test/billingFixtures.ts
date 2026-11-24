/** Test-only helpers for billing tests (docs/api-billing.md). */
import type { StorePlan } from '@souqly/shared';
import { Types } from 'mongoose';
import { recognizeCommission } from '../modules/billing/commission.service';
import { Subscription } from '../modules/billing/subscription.model';
import { ensureSubscription } from '../modules/billing/subscription.service';
import { Order } from '../modules/orders/order.model';
import { Store } from '../modules/stores/store.model';
import { User } from '../modules/users/user.model';
import { signupAgent } from './helpers';

let n = 0;
const DAY = 86_400_000;

/**
 * A sub-order created directly (skips checkout). `items` default to one line worth `subtotal`.
 * `deliveredDaysAgo` adds a delivered timeline entry; `recognize` runs the delivered hook.
 */
export async function billingOrder(o: {
  storeId: unknown;
  subtotal: number;
  shipping?: number;
  method?: 'cod' | 'stripe' | 'jazzcash';
  deliveredDaysAgo?: number;
  status?: string;
  items?: { price: number; qty: number }[];
  recognize?: boolean;
}) {
  n++;
  const items = (o.items ?? [{ price: o.subtotal, qty: 1 }]).map((it, i) => ({
    productId: new Types.ObjectId(),
    variantId: new Types.ObjectId(),
    title: `Thing ${i}`,
    sku: `T-${i}`,
    price: it.price,
    qty: it.qty,
    lineTotal: it.price * it.qty,
  }));
  const shipping = o.shipping ?? 0;
  const deliveredAt = o.deliveredDaysAgo !== undefined ? new Date(Date.now() - o.deliveredDaysAgo * DAY) : undefined;
  const number = `SQ-${String(200000 + n).slice(-6)}-${Math.random().toString(36).slice(2, 7).toUpperCase().padEnd(5, 'X')}-A`;
  const method = o.method ?? 'cod';
  const order = await Order.create({
    storeId: o.storeId,
    number,
    buyerId: new Types.ObjectId(),
    items,
    subtotal: o.subtotal,
    shippingFee: shipping,
    total: o.subtotal + shipping,
    commission: { bps: 0, amount: 0 },
    sellerNet: 0,
    status: o.status ?? (deliveredAt ? 'delivered' : 'placed'),
    timeline: [{ status: 'placed', at: new Date(Date.now() - 20 * DAY), actor: 'buyer' }, ...(deliveredAt ? [{ status: 'delivered', at: deliveredAt, actor: 'rider' }] : [])],
    payment: { method, status: deliveredAt || method !== 'cod' ? 'paid' : 'pending' },
    invoiceNumber: `INV-${number.slice(3)}`,
  });
  if (deliveredAt && o.recognize !== false) await recognizeCommission(order._id);
  return order;
}

export async function setStorePlan(storeId: Types.ObjectId, plan: StorePlan) {
  await Store.updateOne({ _id: storeId }, { $set: { plan } });
  await ensureSubscription(storeId);
  await Subscription.updateOne({ storeId }, { $set: { plan } });
}

/** Moves the store's current period into the past so the next sweep renews it. */
export async function endPeriod(storeId: Types.ObjectId, endedDaysAgo = 1) {
  await ensureSubscription(storeId);
  const end = new Date(Date.now() - endedDaysAgo * DAY);
  const start = new Date(end.getTime() - 30 * DAY);
  await Subscription.updateOne({ storeId }, { $set: { currentPeriodStart: start, currentPeriodEnd: end, anchorDay: end.getUTCDate() } });
  return end;
}

export async function staffAgent(role: 'SUPER_ADMIN' | 'ADMIN' | 'FINANCE' | 'SUPPORT') {
  const s = await signupAgent({ name: `${role} staff` });
  await User.updateOne({ email: s.email }, { $set: { platformRole: role } });
  return s;
}

import { BUYER_ORDER_TABS, PERMISSIONS, TRACKING_STEPS, type BuyerOrderListQuery, type OrderStatus } from '@souqly/shared';
import type { Request } from 'express';
import { Types } from 'mongoose';
import { AppError, notFound } from '../../lib/AppError';
import { cursorFilter, cursorSort, paginate } from '../../lib/pagination';
import { addMany } from '../cart/cart.service';
import { Checkout } from '../checkout/checkout.model';
import { Store } from '../stores/store.model';
import { StoreMember } from '../stores/storeMember.model';
import { Order, type OrderLean } from './order.model';
import { storeInfoMap, toOrderDTO, transitionOrder } from './order.service';
import { renderInvoice } from './pdf';

const oid = (s: string) => new Types.ObjectId(s);
const BUYER_CANCELLABLE: OrderStatus[] = ['pending_payment', 'placed', 'confirmed'];

export async function listBuyerOrders(userId: string, q: BuyerOrderListQuery) {
  const filter: Record<string, unknown> = { buyerId: oid(userId), ...cursorFilter('createdAt', -1, q.cursor) };
  if (q.tab) filter.status = { $in: [...BUYER_ORDER_TABS[q.tab]] };
  const rows = await Order.find(filter).sort(cursorSort('createdAt', -1)).limit(q.limit + 1).select('+deliveryOtpEnc').lean<OrderLean[]>();
  const { items, nextCursor } = paginate(rows, q.limit, 'createdAt');
  const stores = await storeInfoMap(items.map((o) => o.storeId));
  const counts = await Order.aggregate<{ _id: OrderStatus; n: number }>([{ $match: { buyerId: oid(userId) } }, { $group: { _id: '$status', n: { $sum: 1 } } }]);
  const tabCounts = Object.fromEntries(
    Object.entries(BUYER_ORDER_TABS).map(([tab, statuses]) => [tab, counts.filter((c) => (statuses as readonly string[]).includes(c._id)).reduce((a, c) => a + c.n, 0)]),
  );
  return { items: items.map((o) => toOrderDTO(o, stores.get(String(o.storeId)), 'buyer')), nextCursor, counts: tabCounts };
}

async function ownOrder(userId: string, number: string): Promise<OrderLean> {
  // Same 404 for "not yours" and "does not exist" (no order-number enumeration).
  const o = await Order.findOne({ number, buyerId: oid(userId) }).select('+deliveryOtpEnc').lean<OrderLean>();
  if (!o) throw notFound('Order');
  return o;
}

export function trackingSteps(o: OrderLean) {
  const at = new Map<string, Date>();
  for (const t of o.timeline) if (!at.has(t.status)) at.set(t.status, t.at);
  const reachedIdx = Math.max(-1, ...TRACKING_STEPS.map((s, i) => (at.has(s) ? i : -1)));
  return TRACKING_STEPS.map((s, i) => ({ status: s, done: i <= reachedIdx, at: at.get(s)?.toISOString() ?? null, current: TRACKING_STEPS[reachedIdx] === s && o.status === s }));
}

export async function getBuyerOrder(userId: string, number: string) {
  const o = await ownOrder(userId, number);
  const [stores, checkout] = await Promise.all([storeInfoMap([o.storeId]), o.checkoutId ? Checkout.findById(o.checkoutId).select('number').lean() : null]);
  return {
    ...toOrderDTO(o, stores.get(String(o.storeId)), 'buyer', checkout ? { checkoutNumber: checkout.number } : {}),
    trackingSteps: trackingSteps(o),
    canCancel: BUYER_CANCELLABLE.includes(o.status),
  };
}

export async function cancelBuyerOrder(req: Request, number: string, reason: string) {
  const o = await ownOrder(req.user!.id, number);
  if (!BUYER_CANCELLABLE.includes(o.status)) {
    throw new AppError(409, 'INVALID_TRANSITION', 'This order can no longer be cancelled. Contact the seller or request a return after delivery.', { from: o.status });
  }
  await transitionOrder(o._id, 'cancelled', { userId: oid(req.user!.id), kind: 'buyer' }, { reason, req });
  return getBuyerOrder(req.user!.id, number);
}

export async function reorder(userId: string, number: string) {
  const o = await ownOrder(userId, number);
  return addMany(userId, o.items.map((i) => ({ productId: String(i.productId), variantId: String(i.variantId), qty: i.qty })));
}

/** Invoice for the buyer, any active member of the order's store, or platform staff with order access. */
export async function invoiceForViewer(req: Request, number: string): Promise<{ pdf: Buffer; filename: string }> {
  const o = await Order.findOne({ number }).lean<OrderLean>();
  if (!o) throw notFound('Order');
  const uid = req.user!.id;
  const allowed =
    String(o.buyerId) === uid ||
    req.user!.permissions.includes(PERMISSIONS.ADMIN_ORDERS_VIEW) ||
    !!(await StoreMember.exists({ storeId: o.storeId, userId: oid(uid), status: 'active' }));
  if (!allowed) throw notFound('Order');
  return invoicePdf(o);
}

export async function invoicePdf(o: OrderLean): Promise<{ pdf: Buffer; filename: string }> {
  const store = await Store.findById(o.storeId).select('name address contact').lean();
  const pdf = await renderInvoice(o, store ?? { name: 'Store' });
  return { pdf, filename: `${o.invoiceNumber}.pdf` };
}

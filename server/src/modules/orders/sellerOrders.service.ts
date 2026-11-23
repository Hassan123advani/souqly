import { ORDER_STATUSES, PERMISSIONS, type OrderStatus, type SellerBulkStatusInput, type SellerOrderListQuery, type SellerOrderStatusInput } from '@souqly/shared';
import type { Request } from 'express';
import { Types } from 'mongoose';
import { AppError, notFound } from '../../lib/AppError';
import { resolveMemberPermissions } from '../../middleware/storeContext';
import { cursorFilter, cursorSort, paginate } from '../../lib/pagination';
import { escapeRegex } from '../../lib/text';
import { audit } from '../audit/audit.service';
import { Checkout } from '../checkout/checkout.model';
import { Store } from '../stores/store.model';
import { StoreMember } from '../stores/storeMember.model';
import { User } from '../users/user.model';
import { Order, type OrderLean } from './order.model';
import { toOrderDTO, transitionOrder } from './order.service';
import { invoicePdf } from './orders.service';
import { renderLabel } from './pdf';

type StoreCtx = NonNullable<Request['store']>;

function storeInfo(store: StoreCtx) {
  return { _id: store._id, slug: store.slug, name: store.name, ...(store.logo?.url ? { logo: { url: store.logo.url } } : {}) };
}

export async function listStoreOrders(store: StoreCtx, q: SellerOrderListQuery) {
  const base: Record<string, unknown> = { storeId: store._id };
  if (q.from || q.to) base.createdAt = { ...(q.from ? { $gte: q.from } : {}), ...(q.to ? { $lte: q.to } : {}) };
  if (q.q) {
    const rx = new RegExp(escapeRegex(q.q), 'i');
    base.$or = [{ number: rx }, { 'shippingAddress.fullName': rx }, { 'shippingAddress.phone': rx }, { 'items.title': rx }, { 'items.sku': rx }];
  }
  const filter: Record<string, unknown> = { ...base, ...(q.status ? { status: q.status } : {}) };
  const cf = cursorFilter('createdAt', -1, q.cursor);
  const rows = await Order.find(cf.$or && filter.$or ? { $and: [filter, cf] } : { ...filter, ...cf })
    .sort(cursorSort('createdAt', -1))
    .limit(q.limit + 1)
    .lean<OrderLean[]>();
  const { items, nextCursor } = paginate(rows, q.limit, 'createdAt');
  const grouped = await Order.aggregate<{ _id: OrderStatus; n: number }>([{ $match: base }, { $group: { _id: '$status', n: { $sum: 1 } } }]);
  const counts = Object.fromEntries(ORDER_STATUSES.map((s) => [s, grouped.find((g) => g._id === s)?.n ?? 0])) as Record<OrderStatus, number>;
  const info = storeInfo(store);
  return { items: items.map((o) => toOrderDTO(o, info, 'seller')), nextCursor, counts: { all: grouped.reduce((a, g) => a + g.n, 0), ...counts } };
}

async function storeOrder(store: StoreCtx, id: string): Promise<OrderLean> {
  const o = await Order.findOne({ _id: new Types.ObjectId(id), storeId: store._id }).lean<OrderLean>();
  if (!o) throw notFound('Order');
  return o;
}

export async function getStoreOrder(store: StoreCtx, id: string) {
  const o = await storeOrder(store, id);
  const [buyer, checkout] = await Promise.all([
    User.findById(o.buyerId).select('name').lean(),
    o.checkoutId ? Checkout.findById(o.checkoutId).select('number').lean() : null,
  ]);
  return toOrderDTO(o, storeInfo(store), 'seller', { ...(buyer ? { buyerName: buyer.name } : {}), ...(checkout ? { checkoutNumber: checkout.number } : {}) });
}

export async function setStatus(req: Request, id: string, input: SellerOrderStatusInput) {
  const store = req.store!;
  const o = await storeOrder(store, id);
  await transitionOrder(o._id, input.to, { userId: new Types.ObjectId(req.user!.id), kind: 'seller' }, {
    ...(input.note ? { note: input.note } : {}),
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.tracking ? { tracking: input.tracking } : {}),
    req,
    storeId: store._id,
  });
  return getStoreOrder(store, id);
}

export async function bulkStatus(req: Request, input: SellerBulkStatusInput) {
  const store = req.store!;
  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const id of [...new Set(input.ids)]) {
    try {
      const o = await storeOrder(store, id);
      await transitionOrder(o._id, input.to, { userId: new Types.ObjectId(req.user!.id), kind: 'seller' }, { req, storeId: store._id });
      results.push({ id, ok: true });
    } catch (err) {
      results.push({ id, ok: false, error: err instanceof AppError ? err.code : 'INTERNAL_ERROR' });
    }
  }
  return { results, updated: results.filter((r) => r.ok).length };
}

export async function addNote(req: Request, id: string, text: string) {
  const store = req.store!;
  const res = await Order.updateOne(
    { _id: new Types.ObjectId(id), storeId: store._id },
    { $push: { sellerNotes: { $each: [{ by: new Types.ObjectId(req.user!.id), at: new Date(), text }], $slice: -200 } } },
  );
  if (res.matchedCount === 0) throw notFound('Order');
  return getStoreOrder(store, id);
}

export async function storeInvoice(store: StoreCtx, id: string) {
  return invoicePdf(await storeOrder(store, id));
}

export async function storeLabel(store: StoreCtx, id: string) {
  const o = await storeOrder(store, id);
  const full = await Store.findById(store._id).select('name address contact').lean();
  return { pdf: await renderLabel(o, full ?? { name: store.name }), filename: `label-${o.number}.pdf` };
}

/** Phase 7 stub: records which store rider (StoreMember with delivery permission) will deliver the order. */
export async function assignRider(req: Request, id: string, riderMemberId: string) {
  const store = req.store!;
  const o = await storeOrder(store, id);
  if (!['packed', 'shipped', 'out_for_delivery', 'failed_delivery'].includes(o.status)) {
    throw new AppError(409, 'INVALID_TRANSITION', 'Riders can be assigned once the order is packed');
  }
  const member = await StoreMember.findOne({ _id: new Types.ObjectId(riderMemberId), storeId: store._id, status: 'active' });
  const perms = member ? await resolveMemberPermissions(member) : [];
  if (!member || !perms.includes(PERMISSIONS.STORE_DELIVERY_PERFORM)) throw new AppError(400, 'INVALID_RIDER', 'Choose an active rider of your store');
  await Order.updateOne({ _id: o._id, storeId: store._id }, { $set: { riderId: member.userId } });
  await audit({ action: 'order.rider_assigned', req, targetType: 'Order', targetId: o._id, meta: { number: o.number, storeId: String(store._id), riderUserId: String(member.userId) } });
  return getStoreOrder(store, id);
}

import { DEFAULT_RETURN_DAYS, type CreateReturnInput, type ReturnListQuery, type ReturnRequestDTO, type ReturnStatus } from '@souqly/shared';
import type { Request } from 'express';
import { Types } from 'mongoose';
import { AppError } from '../../lib/AppError';
import { logger } from '../../lib/logger';
import { cursorFilter, cursorSort, paginate } from '../../lib/pagination';
import { audit } from '../audit/audit.service';
import { Product } from '../catalog/product.model';
import { openUploadRef } from '../delivery/imageUpload';
import { adjustStock } from '../inventory/inventory.service';
import { refundOrderCoins } from '../loyalty/coinsRefund';
import { notify, notifyMany } from '../notifications/notification.service';
import { storeOrderRecipients } from '../notifications/orderNotifications';
import { Order, type OrderLean } from '../orders/order.model';
import { transitionOrder } from '../orders/order.service';
import { Store, type StoreDoc } from '../stores/store.model';
import { User } from '../users/user.model';
import { credit } from '../wallet/wallet.service';
import { Dispute, ReturnRequest, type ReturnRequestLean } from './return.model';

const DAY = 24 * 3600_000;
const oid = (id: string | Types.ObjectId) => new Types.ObjectId(String(id));

async function toDTO(r: ReturnRequestLean, opts: { withBuyer?: boolean } = {}): Promise<ReturnRequestDTO> {
  const [store, order, buyer] = await Promise.all([
    Store.findById(r.storeId).select('name').lean(),
    Order.findById(r.orderId).select('status').lean(),
    opts.withBuyer ? User.findById(r.buyerId).select('name').lean() : null,
  ]);
  return {
    id: String(r._id),
    order: { id: String(r.orderId), number: r.orderNumber, status: order?.status ?? 'delivered' },
    store: { id: String(r.storeId), name: store?.name ?? '' },
    ...(buyer ? { buyer: { id: String(r.buyerId), name: buyer.name } } : {}),
    items: r.items.map((i) => ({ variantId: String(i.variantId), title: i.title, ...(i.image ? { image: i.image } : {}), options: i.options ?? {}, price: i.price, qty: i.qty, ...(i.reason ? { reason: i.reason } : {}) })),
    reason: r.reason,
    description: r.description,
    photos: r.photos.map((p) => p.url),
    status: r.status,
    refund: { method: r.refund.method, amount: r.refund.amount, ...(r.refund.at ? { at: new Date(r.refund.at).toISOString() } : {}) },
    timeline: r.timeline.map((t) => ({ status: t.status, at: new Date(t.at).toISOString(), actor: t.actor, ...(t.note ? { note: t.note } : {}) })),
    ...(r.sellerNote ? { sellerNote: r.sellerNote } : {}),
    ...(r.disputeId ? { disputeId: String(r.disputeId) } : {}),
    createdAt: new Date(r.createdAt).toISOString(),
  };
}

// ---------- buyer ----------

export async function createReturn(req: Request, number: string, input: CreateReturnInput): Promise<ReturnRequestDTO> {
  const userId = req.user!.id;
  const order = await Order.findOne({ number, buyerId: oid(userId) }).lean<OrderLean>();
  if (!order) throw new AppError(404, 'NOT_FOUND', 'Order not found');
  if (order.status !== 'delivered') throw new AppError(409, 'NOT_RETURNABLE', 'Only delivered orders can be returned', { status: order.status });
  if (await ReturnRequest.exists({ orderId: order._id })) throw new AppError(409, 'RETURN_EXISTS', 'A return was already requested for this order');
  const deliveredAt = order.timeline.filter((t) => t.status === 'delivered').pop()?.at ?? order.updatedAt;

  // Items must be on the order (merged per variant, qty ≤ ordered).
  const wanted = new Map<string, { qty: number; reason?: CreateReturnInput['reason'] }>();
  for (const it of input.items) {
    const prev = wanted.get(it.variantId);
    wanted.set(it.variantId, { qty: (prev?.qty ?? 0) + it.qty, ...(it.reason ? { reason: it.reason } : prev?.reason ? { reason: prev.reason } : {}) });
  }
  const lines = [...wanted.entries()].map(([variantId, w]) => {
    const line = order.items.find((i) => String(i.variantId) === variantId);
    if (!line) throw new AppError(400, 'ITEM_NOT_IN_ORDER', 'One of the items is not part of this order', { variantId });
    if (w.qty > line.qty) throw new AppError(400, 'QTY_EXCEEDS_ORDERED', 'You cannot return more than you ordered', { variantId, max: line.qty });
    return { line, qty: w.qty, reason: w.reason };
  });

  // Return window: each product's returnPolicy.days (default 7). 0 days = not returnable.
  const products = await Product.find({ _id: { $in: lines.map((l) => l.line.productId) } }).select('returnPolicy').lean();
  const now = Date.now();
  for (const l of lines) {
    const days = products.find((p) => String(p._id) === String(l.line.productId))?.returnPolicy?.days ?? DEFAULT_RETURN_DAYS;
    if (days <= 0) throw new AppError(400, 'NOT_RETURNABLE', `"${l.line.title}" cannot be returned`);
    if (now > new Date(deliveredAt).getTime() + days * DAY) throw new AppError(400, 'RETURN_WINDOW_CLOSED', `The ${days}-day return window for "${l.line.title}" has ended`, { days });
  }

  const photos = input.photos.map((ref) => openUploadRef(ref, userId, 'return'));
  const amount = Math.min(order.total, lines.reduce((s, l) => s + l.line.price * l.qty, 0));
  let ret;
  try {
    ret = await ReturnRequest.create({
      orderId: order._id,
      orderNumber: order.number,
      storeId: order.storeId,
      buyerId: order.buyerId,
      items: lines.map((l) => ({ variantId: l.line.variantId, productId: l.line.productId, title: l.line.title, ...(l.line.image ? { image: l.line.image } : {}), options: l.line.options ?? {}, price: l.line.price, qty: l.qty, ...(l.reason ? { reason: l.reason } : {}) })),
      reason: input.reason,
      description: input.description,
      photos,
      status: 'requested',
      refund: { method: 'wallet', amount },
      timeline: [{ status: 'requested', at: new Date(), by: oid(userId), actor: 'buyer' }],
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw new AppError(409, 'RETURN_EXISTS', 'A return was already requested for this order');
    throw err;
  }
  try {
    await transitionOrder(order._id, 'return_requested', { userId: oid(userId), kind: 'buyer' }, { req, note: input.reason });
  } catch (err) {
    await ReturnRequest.deleteOne({ _id: ret._id });
    throw err;
  }
  await audit({ action: 'return.requested', req, targetType: 'ReturnRequest', targetId: ret._id, storeId: order.storeId, meta: { number: order.number, amount, items: lines.length } });
  return toDTO(ret.toObject() as ReturnRequestLean);
}

export async function listBuyerReturns(userId: string, q: ReturnListQuery) {
  const rows = await ReturnRequest.find({ buyerId: oid(userId), ...(q.status ? { status: q.status } : {}), ...cursorFilter('createdAt', -1, q.cursor) })
    .sort(cursorSort('createdAt', -1))
    .limit(q.limit + 1)
    .lean<ReturnRequestLean[]>();
  const { items, nextCursor } = paginate(rows, q.limit, 'createdAt');
  return { items: await Promise.all(items.map((r) => toDTO(r))), nextCursor };
}

export async function getBuyerReturn(userId: string, id: string): Promise<ReturnRequestDTO> {
  const r = await ReturnRequest.findOne({ _id: oid(id), buyerId: oid(userId) }).lean<ReturnRequestLean>();
  if (!r) throw new AppError(404, 'NOT_FOUND', 'Return not found');
  return toDTO(r);
}

export async function escalateReturn(req: Request, id: string, message: string): Promise<ReturnRequestDTO> {
  const userId = req.user!.id;
  const r = await ReturnRequest.findOne({ _id: oid(id), buyerId: oid(userId) }).lean<ReturnRequestLean>();
  if (!r) throw new AppError(404, 'NOT_FOUND', 'Return not found');
  if (r.status !== 'requested' && r.status !== 'rejected') throw new AppError(409, 'INVALID_TRANSITION', 'This return cannot be escalated now', { status: r.status });
  const dispute = await Dispute.findOneAndUpdate(
    { returnId: r._id },
    { $setOnInsert: { orderId: r.orderId, buyerId: r.buyerId, storeId: r.storeId, status: 'open', messages: [{ by: oid(userId), actor: 'buyer', text: message, at: new Date() }] } },
    { upsert: true, new: true },
  );
  const updated = await ReturnRequest.findOneAndUpdate(
    { _id: r._id, status: r.status },
    { $set: { status: 'escalated', disputeId: dispute._id }, $push: { timeline: { status: 'escalated', at: new Date(), by: oid(userId), actor: 'buyer', note: message.slice(0, 200) } } },
    { new: true },
  ).lean<ReturnRequestLean>();
  if (!updated) throw new AppError(409, 'RETURN_CHANGED', 'This return was just updated. Refresh and try again.');
  await audit({ action: 'return.escalated', req, targetType: 'ReturnRequest', targetId: r._id, storeId: r.storeId, meta: { number: r.orderNumber, disputeId: String(dispute._id) } });
  void notifyMany(await storeOrderRecipients(r.storeId), { type: 'return.escalated', title: 'Return escalated', body: `The buyer escalated the return for order ${r.orderNumber} to Souqly support.`, link: `/seller/returns/${String(r._id)}` });
  return toDTO(updated);
}

// ---------- seller (storeId ONLY from req.store) ----------

export async function listStoreReturns(store: StoreDoc, q: ReturnListQuery) {
  const rows = await ReturnRequest.find({ storeId: store._id, ...(q.status ? { status: q.status } : {}), ...cursorFilter('createdAt', -1, q.cursor) })
    .sort(cursorSort('createdAt', -1))
    .limit(q.limit + 1)
    .lean<ReturnRequestLean[]>();
  const { items, nextCursor } = paginate(rows, q.limit, 'createdAt');
  return { items: await Promise.all(items.map((r) => toDTO(r, { withBuyer: true }))), nextCursor, counts: await storeReturnCounts(store) };
}

/** Per-status counts (+ `all`) for the seller returns tabs. */
export async function storeReturnCounts(store: StoreDoc): Promise<Record<string, number>> {
  const rows = await ReturnRequest.aggregate<{ _id: string; n: number }>([{ $match: { storeId: store._id } }, { $group: { _id: '$status', n: { $sum: 1 } } }]);
  const counts: Record<string, number> = { all: 0, requested: 0, approved: 0, rejected: 0, received: 0, refunded: 0, escalated: 0 };
  for (const r of rows) {
    counts[r._id] = r.n;
    counts.all! += r.n;
  }
  return counts;
}

export async function getStoreReturn(store: StoreDoc, id: string): Promise<ReturnRequestDTO> {
  const r = await ReturnRequest.findOne({ _id: oid(id), storeId: store._id }).lean<ReturnRequestLean>();
  if (!r) throw new AppError(404, 'NOT_FOUND', 'Return not found');
  return toDTO(r, { withBuyer: true });
}

/** Compare-and-set status change scoped to the store. */
async function move(req: Request, id: string, from: ReturnStatus[], to: ReturnStatus, note?: string, extra: Record<string, unknown> = {}): Promise<ReturnRequestLean> {
  const store = req.store!;
  const r = await ReturnRequest.findOne({ _id: oid(id), storeId: store._id }).lean<ReturnRequestLean>();
  if (!r) throw new AppError(404, 'NOT_FOUND', 'Return not found');
  if (!from.includes(r.status)) throw new AppError(409, 'INVALID_TRANSITION', `A ${r.status} return cannot be moved to ${to}`, { from: r.status, to });
  const updated = await ReturnRequest.findOneAndUpdate(
    { _id: r._id, storeId: store._id, status: r.status },
    { $set: { status: to, ...(note ? { sellerNote: note } : {}), ...extra }, $push: { timeline: { status: to, at: new Date(), by: oid(req.user!.id), actor: 'seller', ...(note ? { note } : {}) } } },
    { new: true },
  ).lean<ReturnRequestLean>();
  if (!updated) throw new AppError(409, 'RETURN_CHANGED', 'This return was just updated. Refresh and try again.');
  await audit({ action: `return.${to}`, req, targetType: 'ReturnRequest', targetId: r._id, meta: { number: r.orderNumber, from: r.status, to, ...(note ? { note } : {}) } });
  return updated;
}

const sellerActor = (req: Request) => ({ userId: oid(req.user!.id), kind: 'seller' as const });

export async function approveReturn(req: Request, id: string, note?: string) {
  const r = await move(req, id, ['requested'], 'approved', note);
  void notify({ userId: r.buyerId, type: 'return.approved', title: 'Return approved', body: `Your return for order ${r.orderNumber} was approved. Please send the items back.`, link: `/account/returns/${String(r._id)}` });
  return toDTO(r, { withBuyer: true });
}

export async function rejectReturn(req: Request, id: string, note: string) {
  const r = await move(req, id, ['requested'], 'rejected', note);
  await transitionOrder(r.orderId, 'delivered', sellerActor(req), { storeId: req.store!._id, req, note: 'Return rejected' }).catch((err) => logger.warn({ err }, 'Order revert after return reject failed'));
  void notify({ userId: r.buyerId, type: 'return.rejected', title: 'Return rejected', body: `Your return for order ${r.orderNumber} was rejected: ${note}`, link: `/account/returns/${String(r._id)}` });
  return toDTO(r, { withBuyer: true });
}

export async function receiveReturn(req: Request, id: string, note?: string) {
  const r = await move(req, id, ['approved'], 'received', note);
  // Restock exactly once (claim the flag first).
  const claimed = await ReturnRequest.updateOne({ _id: r._id, restocked: false }, { $set: { restocked: true } });
  if (claimed.modifiedCount === 1) {
    for (const it of r.items) {
      await adjustStock({ storeId: r.storeId, productId: it.productId, variantId: it.variantId, delta: it.qty, reason: 'return', note: `Return ${r.orderNumber}`, ref: { type: 'order', id: String(r.orderId) }, actorId: req.user!.id }).catch((err) =>
        logger.warn({ err, variantId: String(it.variantId) }, 'Return restock failed'),
      );
    }
  }
  await transitionOrder(r.orderId, 'returned', sellerActor(req), { storeId: req.store!._id, req });
  return toDTO(r, { withBuyer: true });
}

/** Coins spent on the order go back proportionally to the returned item value (idempotent per order). */
export async function refundReturnCoins(r: Pick<ReturnRequestLean, 'orderId' | 'items'>): Promise<void> {
  const order = await Order.findById(r.orderId).select('buyerId coinsUsed discounts subtotal').lean();
  if (!order) return;
  await refundOrderCoins(order, r.items.reduce((s, i) => s + i.price * i.qty, 0));
}

/** Credits the buyer's wallet once (wallet ref `refund:<returnId>` is idempotent), then marks refunded. */
export async function refundReturn(req: Request, id: string, note?: string) {
  const store = req.store!;
  const r = await ReturnRequest.findOne({ _id: oid(id), storeId: store._id }).lean<ReturnRequestLean>();
  if (!r) throw new AppError(404, 'NOT_FOUND', 'Return not found');
  if (r.status !== 'received') throw new AppError(409, 'INVALID_TRANSITION', `A ${r.status} return cannot be refunded`, { from: r.status, to: 'refunded' });
  let transactionId: string | undefined;
  if (r.refund.amount > 0) {
    const res = await credit({ userId: r.buyerId, amount: r.refund.amount, reason: 'refund', ref: `refund:${String(r._id)}`, meta: { orderNumber: r.orderNumber, returnId: String(r._id) } });
    transactionId = res.transactionId;
  }
  const updated = await move(req, id, ['received'], 'refunded', note, { 'refund.at': new Date(), ...(transactionId ? { 'refund.transactionId': transactionId } : {}) });
  await Order.updateOne({ _id: r.orderId, storeId: store._id }, { $set: { 'payment.status': 'refunded' } });
  await refundReturnCoins(r);
  await transitionOrder(r.orderId, 'refunded', sellerActor(req), { storeId: store._id, req });
  return toDTO(updated, { withBuyer: true });
}

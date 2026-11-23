import { PERMISSIONS, adminOrderListQuerySchema, adminOrderRefundSchema, adminOrderStatusSchema, canTransition, objectIdSchema, type OrderStatus } from '@souqly/shared';
import { Router } from 'express';
import { z } from 'zod';
import { AppError, notFound } from '../../lib/AppError';
import { asyncHandler } from '../../lib/asyncHandler';
import { streamCsv } from '../../lib/csv';
import { cursorFilter, cursorSort, paginate } from '../../lib/pagination';
import { escapeRegex } from '../../lib/text';
import { validate } from '../../middleware/validate';
import { audit } from '../audit/audit.service';
import { refundOrderCoins } from '../loyalty/coinsRefund';
import { Order, type OrderLean } from '../orders/order.model';
import { storeInfoMap, toOrderDTO, transitionOrder } from '../orders/order.service';
import { restoreOrderStock } from '../orders/stock';
import { ReturnRequest } from '../returns/return.model';
import { User } from '../users/user.model';
import { credit } from '../wallet/wallet.service';
import { listSort } from './common';
import { can, oid, q } from './common';

export const adminOrdersRouter = Router();
const idParams = z.object({ id: objectIdSchema });
type OrderListQuery = z.infer<typeof adminOrderListQuerySchema>;

function orderFilter(f: OrderListQuery): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  if (f.status) filter.status = f.status;
  if (f.storeId) filter.storeId = oid(f.storeId);
  if (f.buyerId) filter.buyerId = oid(f.buyerId);
  if (f.q) filter.number = { $regex: `^${escapeRegex(f.q.toUpperCase())}` };
  if (f.from || f.to) filter.createdAt = { ...(f.from ? { $gte: f.from } : {}), ...(f.to ? { $lte: f.to } : {}) };
  return filter;
}

adminOrdersRouter.get(
  '/orders',
  ...can(PERMISSIONS.ADMIN_ORDERS_VIEW),
  validate({ query: adminOrderListQuerySchema }),
  asyncHandler(async (req, res) => {
    const f = q<OrderListQuery>(req);
    const srt = listSort(f.sort, { key: 'total', field: 'total' });
    if (f.format === 'csv') {
      await audit({ action: 'admin.export_csv', targetType: 'Order', meta: { resource: 'orders' }, req });
      const cursor = Order.find(orderFilter(f)).sort(cursorSort(srt.field, srt.dir)).lean<OrderLean[]>().cursor() as AsyncIterable<OrderLean>;
      return streamCsv(res, 'orders.csv', [
        { header: 'number', value: (o: OrderLean) => o.number },
        { header: 'storeId', value: (o) => String(o.storeId) },
        { header: 'buyerId', value: (o) => String(o.buyerId) },
        { header: 'status', value: (o) => o.status },
        { header: 'paymentMethod', value: (o) => o.payment.method },
        { header: 'paymentStatus', value: (o) => o.payment.status },
        { header: 'subtotal', value: (o) => o.subtotal },
        { header: 'shippingFee', value: (o) => o.shippingFee },
        { header: 'total', value: (o) => o.total },
        { header: 'commission', value: (o) => o.commission.amount },
        { header: 'city', value: (o) => o.shippingAddress?.city },
        { header: 'createdAt', value: (o) => o.createdAt },
      ], cursor);
    }
    const rows = await Order.find({ ...orderFilter(f), ...cursorFilter(srt.field, srt.dir, f.cursor) }).sort(cursorSort(srt.field, srt.dir)).limit(f.limit + 1).lean<OrderLean[]>();
    const page = paginate(rows, f.limit, srt.field);
    const stores = await storeInfoMap(page.items.map((o) => o.storeId));
    res.json({ data: page.items.map((o) => ({ ...toOrderDTO(o, stores.get(String(o.storeId)), 'seller'), buyerId: String(o.buyerId) })), meta: { nextCursor: page.nextCursor } });
  }),
);

adminOrdersRouter.get(
  '/orders/:id',
  ...can(PERMISSIONS.ADMIN_ORDERS_VIEW),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const o = await Order.findById(req.params.id).lean<OrderLean>();
    if (!o) throw notFound('Order');
    const [stores, buyer, ret] = await Promise.all([
      storeInfoMap([o.storeId]),
      User.findById(o.buyerId).select('name email phone').lean(),
      ReturnRequest.findOne({ orderId: o._id }).select('status refund disputeId').lean(),
    ]);
    res.json({
      data: {
        ...toOrderDTO(o, stores.get(String(o.storeId)), 'seller', { buyerName: buyer?.name }),
        buyerContact: buyer ? { id: String(buyer._id), name: buyer.name, email: buyer.email ?? null, phone: buyer.phone ?? null } : null,
        coinsUsed: o.coinsUsed ?? 0,
        adminRefunded: o.adminRefunded ?? 0,
        return: ret ? { id: String(ret._id), status: ret.status, refundAmount: ret.refund.amount, disputeId: ret.disputeId ? String(ret.disputeId) : null } : null,
      },
    });
  }),
);

/**
 * Admin status override. A normal transition runs the usual side effects; a transition outside the
 * state machine is forced (timeline entry + audit `forced: true`), restoring stock and coins on cancel.
 */
adminOrdersRouter.post(
  '/orders/:id/status',
  ...can(PERMISSIONS.ADMIN_ORDERS_MANAGE),
  validate({ params: idParams, body: adminOrderStatusSchema }),
  asyncHandler(async (req, res) => {
    const { status, reason } = req.body as { status: OrderStatus; reason: string };
    const o = await Order.findById(req.params.id).lean<OrderLean>();
    if (!o) throw notFound('Order');
    if (o.status === status) throw new AppError(409, 'SAME_STATUS', 'The order already has this status');
    const actor = { userId: oid(req.user!.id), kind: 'admin' as const };
    const forced = !canTransition(o.status, status);
    if (!forced) {
      await transitionOrder(o._id, status, actor, { reason, note: reason, req });
    } else {
      const now = new Date();
      const updated = await Order.findOneAndUpdate(
        { _id: o._id, status: o.status },
        {
          $set: { status, ...(status === 'cancelled' ? { cancel: { by: actor.userId, actor: 'admin', reason, at: now } } : {}) },
          $push: { timeline: { status, at: now, by: actor.userId, actor: 'admin', note: `Admin override: ${reason}` } },
        },
        { new: true },
      ).lean<OrderLean>();
      if (!updated) throw new AppError(409, 'ORDER_CHANGED', 'This order was just updated. Refresh and try again.');
      if (status === 'cancelled') {
        const claimed = await Order.updateOne({ _id: o._id, stockRestored: false }, { $set: { stockRestored: true } });
        if (claimed.modifiedCount === 1) await restoreOrderStock(updated, actor.userId, 'cancel');
        await refundOrderCoins(updated);
      }
    }
    await audit({ action: 'admin.order_status_override', targetType: 'Order', targetId: o._id, storeId: o.storeId, meta: { number: o.number, from: o.status, to: status, forced, reason }, req });
    res.json({ data: { id: String(o._id), status, forced } });
  }),
);

/** Goodwill / manual refund to the buyer's wallet. Total admin refunds can never exceed the order total. */
adminOrdersRouter.post(
  '/orders/:id/refund',
  ...can(PERMISSIONS.ADMIN_ORDERS_MANAGE),
  validate({ params: idParams, body: adminOrderRefundSchema }),
  asyncHandler(async (req, res) => {
    const { amount, reason } = req.body as { amount: number; reason: string };
    const updated = await Order.findOneAndUpdate(
      { _id: oid(req.params.id!), $expr: { $lte: [{ $add: [{ $ifNull: ['$adminRefunded', 0] }, amount] }, '$total'] } },
      { $inc: { adminRefunded: amount } },
      { new: true },
    ).lean<OrderLean>();
    if (!updated) {
      if (!(await Order.exists({ _id: oid(req.params.id!) }))) throw notFound('Order');
      throw new AppError(409, 'REFUND_EXCEEDS_TOTAL', 'Refunds cannot exceed the order total');
    }
    const r = await credit({ userId: updated.buyerId, amount, reason: 'refund', ref: `admin-refund:${String(updated._id)}:${updated.adminRefunded}`, meta: { orderNumber: updated.number, note: reason } });
    await audit({ action: 'admin.order_refunded', targetType: 'Order', targetId: updated._id, storeId: updated.storeId, meta: { number: updated.number, amount, reason, transactionId: r.transactionId }, req });
    res.json({ data: { id: String(updated._id), adminRefunded: updated.adminRefunded, transactionId: r.transactionId } });
  }),
);

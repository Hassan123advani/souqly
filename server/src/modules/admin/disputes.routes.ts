import { PERMISSIONS, RETURN_STATUSES, adminDisputeMessageSchema, adminDisputeResolveSchema, adminListQuerySchema, objectIdSchema, type OrderStatus } from '@souqly/shared';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { AppError, notFound } from '../../lib/AppError';
import { asyncHandler } from '../../lib/asyncHandler';
import { cursorFilter, cursorSort, paginate } from '../../lib/pagination';
import { validate } from '../../middleware/validate';
import { audit } from '../audit/audit.service';
import { notify, notifyMany } from '../notifications/notification.service';
import { storeOrderRecipients } from '../notifications/orderNotifications';
import { Order, type OrderLean } from '../orders/order.model';
import { transitionOrder } from '../orders/order.service';
import { Dispute, ReturnRequest, type ReturnRequestLean } from '../returns/return.model';
import { refundReturnCoins } from '../returns/return.service';
import { Store } from '../stores/store.model';
import { User } from '../users/user.model';
import { credit } from '../wallet/wallet.service';
import { can, iso, oid, q } from './common';

export const adminDisputesRouter = Router();
const idParams = z.object({ id: objectIdSchema });
const MANAGE = PERMISSIONS.ADMIN_DISPUTES_MANAGE;
const returnListQuery = adminListQuerySchema.extend({ status: z.enum(RETURN_STATUSES).optional() });
const disputeListQuery = adminListQuerySchema.extend({ status: z.enum(['open', 'resolved']).optional() });

const returnRow = (r: ReturnRequestLean) => ({
  id: String(r._id),
  orderId: String(r.orderId),
  orderNumber: r.orderNumber,
  storeId: String(r.storeId),
  buyerId: String(r.buyerId),
  status: r.status,
  reason: r.reason,
  items: r.items.map((i) => ({ title: i.title, qty: i.qty, price: i.price })),
  refund: { method: r.refund.method, amount: r.refund.amount, at: iso(r.refund.at) },
  disputeId: r.disputeId ? String(r.disputeId) : null,
  createdAt: iso((r as unknown as { createdAt: Date }).createdAt),
});

adminDisputesRouter.get(
  '/returns',
  ...can(MANAGE),
  validate({ query: returnListQuery }),
  asyncHandler(async (req, res) => {
    const f = q<z.infer<typeof returnListQuery>>(req);
    const rows = await ReturnRequest.find({ ...(f.status ? { status: f.status } : {}), ...cursorFilter('_id', -1, f.cursor) }).sort(cursorSort('_id', -1)).limit(f.limit + 1).lean<ReturnRequestLean[]>();
    const page = paginate(rows, f.limit, '_id');
    res.json({ data: page.items.map(returnRow), meta: { nextCursor: page.nextCursor } });
  }),
);

type DisputeLean = { _id: import('mongoose').Types.ObjectId; returnId?: unknown; orderId: unknown; buyerId: unknown; storeId: unknown; status: string; messages: { by: unknown; actor: string; text: string; at: Date }[]; resolution?: string; createdAt: Date; updatedAt: Date };
const disputeRow = (d: DisputeLean) => ({
  id: String(d._id),
  returnId: d.returnId ? String(d.returnId) : null,
  orderId: String(d.orderId),
  buyerId: String(d.buyerId),
  storeId: String(d.storeId),
  status: d.status,
  resolution: d.resolution ?? null,
  messageCount: d.messages.length,
  lastMessageAt: iso(d.messages[d.messages.length - 1]?.at),
  createdAt: iso(d.createdAt),
});

adminDisputesRouter.get(
  '/disputes',
  ...can(MANAGE),
  validate({ query: disputeListQuery }),
  asyncHandler(async (req, res) => {
    const f = q<z.infer<typeof disputeListQuery>>(req);
    const rows = await Dispute.find({ ...(f.status ? { status: f.status } : {}), ...cursorFilter('_id', -1, f.cursor) }).sort(cursorSort('_id', -1)).limit(f.limit + 1).lean<DisputeLean[]>();
    const page = paginate(rows, f.limit, '_id');
    res.json({ data: page.items.map(disputeRow), meta: { nextCursor: page.nextCursor } });
  }),
);

adminDisputesRouter.get(
  '/disputes/:id',
  ...can(MANAGE),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const d = await Dispute.findById(req.params.id).lean<DisputeLean>();
    if (!d) throw notFound('Dispute');
    const [ret, order, buyer, store] = await Promise.all([
      d.returnId ? ReturnRequest.findById(d.returnId).lean<ReturnRequestLean>() : null,
      Order.findById(d.orderId).select('number status total payment').lean(),
      User.findById(d.buyerId).select('name').lean(),
      Store.findById(d.storeId).select('name slug').lean(),
    ]);
    res.json({
      data: {
        ...disputeRow(d),
        messages: d.messages.map((m) => ({ by: String(m.by), actor: m.actor, text: m.text, at: iso(m.at) })),
        return: ret ? { ...returnRow(ret), description: ret.description ?? null, photos: (ret.photos ?? []).map((p) => p.url), timeline: ret.timeline.map((t) => ({ status: t.status, at: iso(t.at), actor: t.actor, note: t.note ?? null })) } : null,
        order: order ? { number: order.number, status: order.status, total: order.total, payment: order.payment } : null,
        buyer: buyer ? { id: String(buyer._id), name: buyer.name } : null,
        store: store ? { id: String(store._id), name: store.name, slug: store.slug } : null,
      },
    });
  }),
);

adminDisputesRouter.post(
  '/disputes/:id/messages',
  ...can(MANAGE),
  validate({ params: idParams, body: adminDisputeMessageSchema }),
  asyncHandler(async (req, res) => {
    const d = await Dispute.findOneAndUpdate(
      { _id: oid(req.params.id!), status: 'open' },
      { $push: { messages: { by: oid(req.user!.id), actor: 'admin', text: req.body.text, at: new Date() } } },
      { new: true },
    ).lean<DisputeLean>();
    if (!d) throw new AppError(409, 'DISPUTE_CLOSED', 'This dispute is not open');
    await audit({ action: 'admin.dispute_message', targetType: 'Dispute', targetId: d._id, storeId: d.storeId as never, req });
    void notify({ userId: d.buyerId as never, type: 'dispute.message', title: 'Souqly support replied', body: req.body.text.slice(0, 200), link: d.returnId ? `/account/returns/${String(d.returnId)}` : '/account/orders' });
    void notifyMany(await storeOrderRecipients(d.storeId as never), { type: 'dispute.message', title: 'Souqly support replied on a dispute', body: req.body.text.slice(0, 200), link: d.returnId ? `/seller/returns/${String(d.returnId)}` : '/seller/orders' });
    res.status(201).json({ data: { messageCount: d.messages.length } });
  }),
);

/** Moves the order along the state machine to `target` through the listed steps (skips what is already done). */
async function walkOrder(req: Request, orderId: import('mongoose').Types.ObjectId, steps: OrderStatus[]) {
  for (const to of steps) {
    const o = await Order.findById(orderId).select('status').lean<OrderLean>();
    if (!o || o.status === to) continue;
    if (steps.indexOf(o.status as OrderStatus) > steps.indexOf(to)) continue;
    try {
      await transitionOrder(orderId, to, { userId: oid(req.user!.id), kind: 'admin' }, { reason: 'Dispute resolved by Souqly', req });
    } catch (err) {
      if (!(err instanceof AppError) || err.code !== 'INVALID_TRANSITION') throw err;
    }
  }
}

adminDisputesRouter.post(
  '/disputes/:id/resolve',
  ...can(MANAGE),
  validate({ params: idParams, body: adminDisputeResolveSchema }),
  asyncHandler(async (req, res) => {
    const { outcome, note } = req.body as { outcome: 'refund_buyer' | 'side_with_seller'; note: string };
    // Claim the dispute first so two admins cannot resolve it twice.
    const d = await Dispute.findOneAndUpdate(
      { _id: oid(req.params.id!), status: 'open' },
      { $set: { status: 'resolved', resolution: `${outcome}: ${note}` }, $push: { messages: { by: oid(req.user!.id), actor: 'admin', text: note, at: new Date() } } },
      { new: true },
    ).lean<DisputeLean>();
    if (!d) {
      if (!(await Dispute.exists({ _id: oid(req.params.id!) }))) throw notFound('Dispute');
      throw new AppError(409, 'DISPUTE_CLOSED', 'This dispute was already resolved');
    }
    const ret = d.returnId ? await ReturnRequest.findById(d.returnId).lean<ReturnRequestLean>() : null;
    const orderId = oid(String(d.orderId));
    let transactionId: string | undefined;
    if (outcome === 'refund_buyer') {
      const order = await Order.findById(orderId).select('total number').lean();
      const amount = ret?.refund.amount ?? order?.total ?? 0;
      if (amount > 0) {
        // Same ledger ref as the seller refund path → never paid twice.
        const r = await credit({ userId: d.buyerId as never, amount, reason: 'refund', ref: ret ? `refund:${String(ret._id)}` : `dispute-refund:${String(d._id)}`, meta: { orderNumber: order?.number, disputeId: String(d._id) } });
        transactionId = r.transactionId;
      }
      if (ret) {
        await ReturnRequest.updateOne(
          { _id: ret._id },
          {
            $set: { status: 'refunded', 'refund.at': new Date(), ...(transactionId ? { 'refund.transactionId': transactionId } : {}) },
            $push: { timeline: { status: 'refunded', at: new Date(), by: oid(req.user!.id), actor: 'admin', note: note.slice(0, 200) } },
          },
        );
        await refundReturnCoins(ret);
      }
      await Order.updateOne({ _id: orderId }, { $set: { 'payment.status': 'refunded' } });
      await walkOrder(req, orderId, ['delivered', 'return_requested', 'returned', 'refunded']);
    } else {
      if (ret && ret.status !== 'rejected') {
        await ReturnRequest.updateOne({ _id: ret._id }, { $set: { status: 'rejected' }, $push: { timeline: { status: 'rejected', at: new Date(), by: oid(req.user!.id), actor: 'admin', note: note.slice(0, 200) } } });
      }
      const o = await Order.findById(orderId).select('status').lean();
      if (o?.status === 'return_requested') await walkOrder(req, orderId, ['return_requested', 'delivered']);
    }
    await audit({ action: 'admin.dispute_resolved', targetType: 'Dispute', targetId: d._id, storeId: d.storeId as never, meta: { outcome, note, ...(transactionId ? { transactionId } : {}) }, req });
    void notify({ userId: d.buyerId as never, type: 'dispute.resolved', title: 'Your dispute was resolved', body: outcome === 'refund_buyer' ? 'A refund was added to your Souqly wallet.' : note.slice(0, 200), link: '/account/orders' });
    void notifyMany(await storeOrderRecipients(d.storeId as never), { type: 'dispute.resolved', title: 'Dispute resolved', body: outcome === 'refund_buyer' ? 'Souqly refunded the buyer.' : 'Souqly resolved the dispute in your favour.', link: '/seller/returns' });
    res.json({ data: { id: String(d._id), status: 'resolved', outcome, ...(transactionId ? { transactionId } : {}) } });
  }),
);

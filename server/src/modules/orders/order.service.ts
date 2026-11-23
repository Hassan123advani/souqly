import { canTransition, formatMoney, type OrderDTO, type OrderStatus } from '@souqly/shared';
import type { Request } from 'express';
import { Types } from 'mongoose';
import { AppError } from '../../lib/AppError';
import { decrypt, encrypt, randomCode, randomDigits, sha256 } from '../../lib/crypto';
import { logger } from '../../lib/logger';
import { getEmail } from '../../services/email';
import { orderStatusChanged } from '../../services/email/templates';
import { getNotifier } from '../../services/notify';
import { emitToStore, emitToUser } from '../../socket';
import { audit } from '../audit/audit.service';
import { Store } from '../stores/store.model';
import { User } from '../users/user.model';
import { Order, type OrderDoc, type OrderLean } from './order.model';
import { restoreOrderStock } from './stock';
import { notifyOrderStatus } from '../notifications/orderNotifications';
import { onOrderDelivered } from '../loyalty/rewards.service';

/** `SQ-YYMMDD-XXXXX` (UTC date + 5 unambiguous uppercase chars). */
export function newCheckoutNumber(at = new Date()): string {
  const d = at.toISOString().slice(2, 10).replace(/-/g, '');
  return `SQ-${d}-${randomCode(5)}`;
}

/** Sub-order suffix: A, B, ... Z, AA, AB ... */
export function orderSuffix(i: number): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return i < 26 ? letters[i]! : `${letters[Math.floor(i / 26) - 1]}${letters[i % 26]}`;
}

export const invoiceNumberFor = (orderNumber: string) => `INV-${orderNumber.slice(3)}`;

export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: 'Awaiting payment',
  placed: 'Placed',
  confirmed: 'Confirmed',
  packed: 'Packed',
  shipped: 'Shipped',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  failed_delivery: 'Delivery failed',
  return_requested: 'Return requested',
  returned: 'Returned',
  refunded: 'Refunded',
};

type StoreInfo = { _id: Types.ObjectId; slug: string; name: string; logo?: { url?: string } };

export async function storeInfoMap(storeIds: Types.ObjectId[]): Promise<Map<string, StoreInfo>> {
  const stores = await Store.find({ _id: { $in: storeIds } }).select('slug name logo').lean<StoreInfo[]>();
  return new Map(stores.map((s) => [String(s._id), s]));
}

const OTP_VISIBLE: OrderStatus[] = ['shipped', 'out_for_delivery', 'failed_delivery'];

export function toOrderDTO(
  o: OrderLean,
  store: StoreInfo | undefined,
  view: 'buyer' | 'seller',
  extras: { checkoutNumber?: string; buyerName?: string } = {},
): OrderDTO {
  const dto: OrderDTO = {
    id: String(o._id),
    number: o.number,
    ...(extras.checkoutNumber ? { checkoutNumber: extras.checkoutNumber } : {}),
    store: { id: String(o.storeId), slug: store?.slug ?? '', name: store?.name ?? 'Store', ...(store?.logo?.url ? { logo: store.logo.url } : {}) },
    status: o.status,
    channel: o.channel,
    items: o.items.map((i) => ({
      productId: String(i.productId),
      variantId: String(i.variantId),
      title: i.title,
      ...(i.slug ? { slug: i.slug } : {}),
      ...(i.image ? { image: i.image } : {}),
      options: i.options ?? {},
      sku: i.sku,
      price: i.price,
      qty: i.qty,
      lineTotal: i.lineTotal,
    })),
    subtotal: o.subtotal,
    shippingFee: o.shippingFee,
    discounts: { store: o.discounts?.store ?? 0, platform: o.discounts?.platform ?? 0 },
    total: o.total,
    payment: { method: o.payment.method, status: o.payment.status },
    shippingAddress: { ...o.shippingAddress },
    ...(o.buyerNote ? { buyerNote: o.buyerNote } : {}),
    ...(o.tracking?.trackingNumber ? { tracking: { courier: o.tracking.courier, trackingNumber: o.tracking.trackingNumber } } : {}),
    timeline: o.timeline.map((t) => ({ status: t.status, at: t.at.toISOString(), ...(t.note ? { note: t.note } : {}) })),
    ...(o.cancel ? { cancel: { by: o.cancel.actor, reason: o.cancel.reason, at: o.cancel.at.toISOString() } } : {}),
    invoiceNumber: o.invoiceNumber,
    createdAt: o.createdAt.toISOString(),
  };
  if (view === 'buyer' && o.deliveryOtpEnc && OTP_VISIBLE.includes(o.status)) {
    try {
      dto.deliveryOtp = decrypt(o.deliveryOtpEnc);
    } catch {
      // key rotated: OTP simply not shown
    }
  }
  if (view === 'seller') {
    dto.commission = { bps: o.commission.bps, amount: o.commission.amount };
    dto.sellerNet = o.sellerNet;
    dto.sellerNotes = (o.sellerNotes ?? []).map((n) => ({ by: String(n.by), at: n.at.toISOString(), text: n.text }));
    dto.buyer = { id: String(o.buyerId), name: extras.buyerName ?? o.shippingAddress?.fullName ?? 'Buyer' };
  }
  return dto;
}

export type Actor = { userId: Types.ObjectId | null; kind: 'buyer' | 'seller' | 'system' | 'admin' | 'rider' };

/**
 * Moves an order to `to`. Validates the transition, applies it atomically (only if the status is
 * still the one we read), restores stock on cancel, creates the delivery OTP on ship, notifies.
 */
export async function transitionOrder(
  orderId: Types.ObjectId,
  to: OrderStatus,
  actor: Actor,
  opts: { note?: string; reason?: string; tracking?: { courier: string; trackingNumber: string }; req?: Request; storeId?: Types.ObjectId } = {},
): Promise<OrderLean> {
  const order = await Order.findOne({ _id: orderId, ...(opts.storeId ? { storeId: opts.storeId } : {}) }).lean<OrderLean>();
  if (!order) throw new AppError(404, 'NOT_FOUND', 'Order not found');
  const from = order.status;
  if (!canTransition(from, to)) {
    throw new AppError(409, 'INVALID_TRANSITION', `An order that is ${STATUS_LABELS[from].toLowerCase()} cannot be moved to ${STATUS_LABELS[to].toLowerCase()}`, { from, to });
  }
  const now = new Date();
  const set: Record<string, unknown> = { status: to };
  let otp: string | undefined;
  if (to === 'cancelled') set.cancel = { by: actor.userId, actor: actor.kind, reason: opts.reason ?? 'Cancelled', at: now };
  if (to === 'shipped') {
    if (opts.tracking) set.tracking = opts.tracking;
    otp = randomDigits(4);
    set.deliveryOtpHash = sha256(`${order._id}:${otp}`);
    set.deliveryOtpEnc = encrypt(otp);
  }
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, status: from },
    { $set: set, $push: { timeline: { status: to, at: now, by: actor.userId, actor: actor.kind, ...(opts.note || opts.reason ? { note: opts.note ?? opts.reason } : {}) } } },
    { new: true },
  ).lean<OrderLean>();
  if (!updated) throw new AppError(409, 'ORDER_CHANGED', 'This order was just updated. Refresh and try again.');

  if (to === 'cancelled' && !updated.stockRestored) {
    const claimed = await Order.updateOne({ _id: updated._id, stockRestored: false }, { $set: { stockRestored: true } });
    if (claimed.modifiedCount === 1) await restoreOrderStock(updated, actor.userId, 'cancel');
  }

  await audit({
    action: `order.${to}`,
    actorId: actor.userId,
    actorRole: actor.kind,
    targetType: 'Order',
    targetId: updated._id,
    meta: { number: updated.number, storeId: String(updated.storeId), from, to },
    ...(opts.req ? { req: opts.req } : {}),
  });
  void notifyStatus(updated, to, otp);
  void notifyOrderStatus(updated, to);
  if (to === 'delivered') await onOrderDelivered(updated); // Phase 8: coins + referral rewards (idempotent, never throws)
  return updated;
}

/** Fire-and-forget buyer / store notifications for a status change. Never throws. */
async function notifyStatus(order: OrderLean, to: OrderStatus, otp?: string): Promise<void> {
  try {
    emitToUser(String(order.buyerId), 'order:updated', { id: String(order._id), number: order.number, status: to });
    emitToStore(String(order.storeId), 'order:updated', { id: String(order._id), number: order.number, status: to });
    const buyer = await User.findById(order.buyerId).select('name email').lean();
    let extra: string | undefined;
    if (to === 'shipped' && otp) {
      extra = 'Share your delivery code with the rider only when you receive the parcel. You can see it in your order details.';
      // Plain code goes ONLY to the buyer's phone (and their own order page); never logged by us.
      const phone = order.shippingAddress?.phone;
      if (phone) await getNotifier().sendSms(phone, `Souqly: your order ${order.number} has shipped. Delivery code: ${otp}. Share it with the rider only on delivery.`);
    }
    if (buyer?.email) await getEmail().send({ to: buyer.email, ...orderStatusChanged(buyer.name, order.number, STATUS_LABELS[to], extra) });
  } catch (err) {
    logger.warn({ err, order: order.number }, 'Order notification failed');
  }
}

export function totalFormatted(minor: number) {
  return formatMoney(minor);
}

export type { OrderDoc };

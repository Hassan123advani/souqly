import {
  PERMISSIONS,
  type DeliverInput,
  type DeliveryFailReason,
  type OrderStatus,
  type RiderCodDTO,
  type RiderDeliveryDTO,
  type RiderDeliveryListQuery,
  type RiderLocationInput,
  type RiderMeDTO,
} from '@souqly/shared';
import type { Request } from 'express';
import { Types } from 'mongoose';
import { AppError } from '../../lib/AppError';
import { safeEqual, sha256 } from '../../lib/crypto';
import { cursorFilter, cursorSort, paginate } from '../../lib/pagination';
import { resolveMemberPermissions } from '../../middleware/storeContext';
import { audit } from '../audit/audit.service';
import { notifyMany } from '../notifications/notification.service';
import { storeOrderRecipients } from '../notifications/orderNotifications';
import { Order, type OrderLean } from '../orders/order.model';
import { transitionOrder } from '../orders/order.service';
import { Store } from '../stores/store.model';
import { StoreMember } from '../stores/storeMember.model';
import { User } from '../users/user.model';
import { DeliverySession, RiderCashEntry, RiderLocation, riderFeeFor } from './delivery.model';
import { etaMinutes, startOfTodayPK } from './geo';
import { broadcastLocation, endTracking } from './tracking.service';

export const OTP_MAX_ATTEMPTS = 5;
export const OTP_LOCK_MS = 15 * 60_000;
/** Mutable so tests can shorten it. */
export const deliveryConfig = { minLocationIntervalMs: 3000 };

const RIDER_STATUSES: OrderStatus[] = ['shipped', 'out_for_delivery', 'failed_delivery', 'delivered'];
const HISTORY_STATUSES: OrderStatus[] = ['delivered', 'failed_delivery', 'return_requested', 'returned', 'refunded'];
const oid = (id: string | Types.ObjectId) => new Types.ObjectId(String(id));

/** Store ids where the user is an active member with store.delivery.perform. */
export async function riderStoreIds(userId: string): Promise<Types.ObjectId[]> {
  const members = await StoreMember.find({ userId: oid(userId), status: 'active' });
  const out: Types.ObjectId[] = [];
  for (const m of members) if ((await resolveMemberPermissions(m)).includes(PERMISSIONS.STORE_DELIVERY_PERFORM)) out.push(m.storeId);
  return out;
}

async function requireRiderStores(userId: string): Promise<Types.ObjectId[]> {
  const stores = await riderStoreIds(userId);
  if (!stores.length) throw new AppError(403, 'NOT_A_RIDER', 'You are not a rider for any store');
  return stores;
}

/** Loads an order assigned to this rider in one of their rider stores; 404 otherwise (no enumeration). */
async function assignedOrder(userId: string, orderId: string, select = ''): Promise<OrderLean> {
  const stores = await requireRiderStores(userId);
  const q = Order.findOne({ _id: oid(orderId), riderId: oid(userId), storeId: { $in: stores } });
  if (select) q.select(select);
  const order = await q.lean<OrderLean>();
  if (!order) throw new AppError(404, 'NOT_FOUND', 'Delivery not found');
  return order;
}

const codAmountOf = (o: OrderLean) => (o.payment?.method === 'cod' && o.payment.status !== 'paid' ? o.total : 0);

function toDeliveryDTO(o: OrderLean, storeName: string, s?: { startedAt?: Date; endedAt?: Date; failReason?: DeliveryFailReason; otpAttempts?: number; otpLockedUntil?: Date | null } | null): RiderDeliveryDTO {
  const a = o.shippingAddress ?? ({} as OrderLean['shippingAddress']);
  const locked = s?.otpLockedUntil && s.otpLockedUntil > new Date() ? s.otpLockedUntil : undefined;
  const deliveredAt = o.timeline.filter((t) => t.status === 'delivered').pop()?.at;
  return {
    orderId: String(o._id),
    number: o.number,
    status: o.status,
    store: { id: String(o.storeId), name: storeName },
    buyer: { name: a.fullName ?? '', phone: a.phone ?? '' },
    address: { line1: a.line1 ?? '', city: a.city ?? '', ...(a.line2 ? { line2: a.line2 } : {}), ...(a.area ? { area: a.area } : {}), ...(a.postalCode ? { postalCode: a.postalCode } : {}) },
    location: a.location?.lat != null && a.location?.lng != null ? { lat: a.location.lat, lng: a.location.lng } : null,
    codAmount: codAmountOf(o),
    itemsCount: o.items.reduce((n, i) => n + i.qty, 0),
    total: o.total,
    createdAt: new Date(o.createdAt).toISOString(),
    ...(s?.startedAt ? { startedAt: new Date(s.startedAt).toISOString() } : {}),
    ...(deliveredAt ? { deliveredAt: new Date(deliveredAt).toISOString() } : {}),
    ...(s?.failReason ? { failReason: s.failReason } : {}),
    ...(locked ? { otpLockedUntil: locked.toISOString() } : {}),
    otpAttemptsLeft: locked ? 0 : OTP_MAX_ATTEMPTS - (s?.otpAttempts ?? 0),
    canStart: o.status === 'shipped' || o.status === 'failed_delivery',
    canDeliver: (o.status === 'shipped' || o.status === 'out_for_delivery') && !locked,
    canFail: o.status === 'shipped' || o.status === 'out_for_delivery',
  };
}

async function storeNames(ids: Types.ObjectId[]): Promise<Map<string, string>> {
  const stores = await Store.find({ _id: { $in: ids } }).select('name').lean();
  return new Map(stores.map((s) => [String(s._id), s.name]));
}

// ---------- reads ----------

export async function riderMe(userId: string): Promise<RiderMeDTO> {
  const storeIds = await requireRiderStores(userId);
  const rider = oid(userId);
  const today = startOfTodayPK();
  const [user, stores, earnAgg, cashAgg, todayCash] = await Promise.all([
    User.findById(rider).select('name').lean(),
    Store.find({ _id: { $in: storeIds } }).select('name slug').lean(),
    DeliverySession.aggregate<{ _id: null; total: number; today: number; todayCount: number }>([
      { $match: { riderId: rider, status: 'delivered' } },
      { $group: { _id: null, total: { $sum: '$earning' }, today: { $sum: { $cond: [{ $gte: ['$endedAt', today] }, '$earning', 0] } }, todayCount: { $sum: { $cond: [{ $gte: ['$endedAt', today] }, 1, 0] } } } },
    ]),
    RiderCashEntry.aggregate<{ _id: string; sum: number }>([{ $match: { riderId: rider, storeId: { $in: storeIds } } }, { $group: { _id: '$type', sum: { $sum: '$amount' } } }]),
    RiderCashEntry.aggregate<{ sum: number }>([{ $match: { riderId: rider, type: 'collected', createdAt: { $gte: today } } }, { $group: { _id: null, sum: { $sum: '$amount' } } }]),
  ]);
  const fees = await Promise.all(stores.map((s) => riderFeeFor(s._id)));
  const cash = (t: string) => cashAgg.find((c) => c._id === t)?.sum ?? 0;
  return {
    user: { id: userId, name: user?.name ?? '' },
    stores: stores.map((s, i) => ({ id: String(s._id), name: s.name, slug: s.slug, riderFee: fees[i]! })),
    stats: {
      todayDeliveries: earnAgg[0]?.todayCount ?? 0,
      codCollectedToday: todayCash[0]?.sum ?? 0,
      codOutstanding: cash('collected') - cash('settled'),
      earningsToday: earnAgg[0]?.today ?? 0,
      earningsTotal: earnAgg[0]?.total ?? 0,
    },
  };
}

export async function listRiderDeliveries(userId: string, q: RiderDeliveryListQuery) {
  const stores = await requireRiderStores(userId);
  const base = { riderId: oid(userId), storeId: { $in: stores } };
  let filter: Record<string, unknown>;
  if (q.date === 'upcoming') filter = { ...base, status: 'shipped' };
  else if (q.date === 'history') filter = { ...base, status: { $in: HISTORY_STATUSES } };
  else filter = { ...base, $or: [{ status: 'out_for_delivery' }, { status: { $in: ['delivered', 'failed_delivery'] }, updatedAt: { $gte: startOfTodayPK() } }] };
  const rows = await Order.find({ $and: [filter, cursorFilter('updatedAt', -1, q.cursor)] })
    .sort(cursorSort('updatedAt', -1))
    .limit(q.limit + 1)
    .lean<(OrderLean & { updatedAt: Date })[]>();
  const { items, nextCursor } = paginate(rows, q.limit, 'updatedAt');
  const [names, sessions] = await Promise.all([storeNames(items.map((o) => o.storeId)), DeliverySession.find({ orderId: { $in: items.map((o) => o._id) } }).lean()]);
  const sMap = new Map(sessions.map((s) => [String(s.orderId), s]));
  return { items: items.map((o) => toDeliveryDTO(o, names.get(String(o.storeId)) ?? '', sMap.get(String(o._id)))), nextCursor };
}

export async function getRiderDelivery(userId: string, orderId: string): Promise<RiderDeliveryDTO> {
  const o = await assignedOrder(userId, orderId);
  if (!RIDER_STATUSES.includes(o.status) && !HISTORY_STATUSES.includes(o.status)) throw new AppError(404, 'NOT_FOUND', 'Delivery not found');
  const [names, s] = await Promise.all([storeNames([o.storeId]), DeliverySession.findOne({ orderId: o._id }).lean()]);
  return toDeliveryDTO(o, names.get(String(o.storeId)) ?? '', s);
}

// ---------- actions ----------

export async function startDelivery(req: Request, orderId: string): Promise<RiderDeliveryDTO> {
  const userId = req.user!.id;
  const o = await assignedOrder(userId, orderId);
  if (o.status !== 'shipped' && o.status !== 'failed_delivery') throw new AppError(409, 'INVALID_TRANSITION', 'This delivery cannot be started now', { status: o.status });
  await transitionOrder(o._id, 'out_for_delivery', { userId: oid(userId), kind: 'rider' }, { storeId: o.storeId, req });
  await DeliverySession.findOneAndUpdate(
    { orderId: o._id },
    { $set: { storeId: o.storeId, riderId: oid(userId), status: 'active', startedAt: new Date(), lastLocation: null }, $unset: { endedAt: 1, failReason: 1, failNote: 1 }, $inc: { attempts: 1 } },
    { upsert: true },
  );
  return getRiderDelivery(userId, orderId);
}

const lastLocationAt = new Map<string, number>();

/** Shared by HTTP and the socket `rider:location` event. */
export async function recordLocation(userId: string, orderId: string, input: RiderLocationInput): Promise<{ at: string; eta: number | null }> {
  const o = await assignedOrder(userId, orderId, 'storeId status shippingAddress riderId');
  if (o.status !== 'out_for_delivery') throw new AppError(409, 'TRACKING_INACTIVE', 'Locations are accepted only while the order is out for delivery');
  const key = `${userId}:${orderId}`;
  const now = Date.now();
  const prev = lastLocationAt.get(key);
  if (prev && now - prev < deliveryConfig.minLocationIntervalMs) throw new AppError(429, 'TOO_FAST', 'Send location updates at most every 3 seconds');
  lastLocationAt.set(key, now);
  if (lastLocationAt.size > 10_000) lastLocationAt.clear();

  const at = new Date(now);
  await RiderLocation.create({ orderId: o._id, riderId: oid(userId), storeId: o.storeId, lat: input.lat, lng: input.lng, at, ...(input.accuracy != null ? { accuracy: input.accuracy } : {}), ...(input.heading != null ? { heading: input.heading } : {}), ...(input.speed != null ? { speed: input.speed } : {}) });
  // Guarded on the session still being active, so a late update cannot revive a finished delivery.
  await DeliverySession.updateOne({ orderId: o._id, status: 'active' }, { $set: { lastLocation: { lat: input.lat, lng: input.lng, at } } });
  const dest = o.shippingAddress?.location;
  const eta = etaMinutes(input, dest?.lat != null && dest?.lng != null ? { lat: dest.lat, lng: dest.lng } : null);
  broadcastLocation({ orderId: String(o._id), lat: input.lat, lng: input.lng, at: at.toISOString(), eta });
  return { at: at.toISOString(), eta };
}

export async function deliverOrder(req: Request, orderId: string, input: DeliverInput, photo?: { key: string; url: string }): Promise<RiderDeliveryDTO> {
  const userId = req.user!.id;
  const o = await assignedOrder(userId, orderId, '+deliveryOtpHash');
  if (o.status !== 'shipped' && o.status !== 'out_for_delivery') throw new AppError(409, 'INVALID_TRANSITION', 'This order cannot be delivered now', { status: o.status });
  if (!o.deliveryOtpHash) throw new AppError(409, 'OTP_MISSING', 'This order has no delivery code');

  let session = await DeliverySession.findOneAndUpdate(
    { orderId: o._id },
    { $setOnInsert: { storeId: o.storeId, riderId: oid(userId), status: 'active', startedAt: new Date() } },
    { upsert: true, new: true },
  );
  const now = new Date();
  if (session.otpLockedUntil && session.otpLockedUntil > now) {
    throw new AppError(423, 'OTP_LOCKED', 'Too many wrong codes. Try again later.', { lockedUntil: session.otpLockedUntil.toISOString() });
  }
  const ok = safeEqual(sha256(`${o._id}:${input.otp}`), o.deliveryOtpHash);
  if (!ok) {
    session = (await DeliverySession.findOneAndUpdate({ _id: session._id }, { $inc: { otpAttempts: 1 } }, { new: true }))!;
    if (session.otpAttempts >= OTP_MAX_ATTEMPTS) {
      const until = new Date(now.getTime() + OTP_LOCK_MS);
      await DeliverySession.updateOne({ _id: session._id }, { $set: { otpLockedUntil: until, otpAttempts: 0 } });
      await audit({ action: 'delivery.otp_locked', req, actorRole: 'rider', targetType: 'Order', targetId: o._id, storeId: o.storeId, meta: { number: o.number } });
      throw new AppError(423, 'OTP_LOCKED', 'Too many wrong codes. Try again in 15 minutes.', { lockedUntil: until.toISOString() });
    }
    throw new AppError(400, 'OTP_INVALID', 'Wrong delivery code', { attemptsLeft: OTP_MAX_ATTEMPTS - session.otpAttempts });
  }

  const codDue = codAmountOf(o);
  const collected = input.codCollected ?? codDue;
  if (collected > codDue) throw new AppError(400, 'COD_MISMATCH', 'Collected cash is more than the amount due', { codAmount: codDue });

  await transitionOrder(o._id, 'delivered', { userId: oid(userId), kind: 'rider' }, { storeId: o.storeId, req });
  const fee = await riderFeeFor(o.storeId);
  await DeliverySession.updateOne(
    { _id: session._id },
    { $set: { status: 'delivered', endedAt: now, otpAttempts: 0, otpLockedUntil: null, codCollected: collected, earning: fee, riderId: oid(userId), ...(photo ? { photo } : {}) } },
  );
  if (codDue > 0 && collected === codDue) await Order.updateOne({ _id: o._id, 'payment.method': 'cod' }, { $set: { 'payment.status': 'paid' } });
  if (collected > 0) {
    await RiderCashEntry.create({ storeId: o.storeId, riderId: oid(userId), type: 'collected', amount: collected, orderId: o._id, orderNumber: o.number, by: oid(userId) }).catch((err: { code?: number }) => {
      if (err.code !== 11000) throw err;
    });
  }
  await audit({ action: 'delivery.delivered', req, actorRole: 'rider', targetType: 'Order', targetId: o._id, storeId: o.storeId, meta: { number: o.number, codCollected: collected, photo: !!photo } });
  endTracking(String(o._id), 'delivered');
  return getRiderDelivery(userId, orderId);
}

export async function failDelivery(req: Request, orderId: string, input: { reason: DeliveryFailReason; note?: string }): Promise<RiderDeliveryDTO> {
  const userId = req.user!.id;
  const o = await assignedOrder(userId, orderId);
  if (o.status !== 'shipped' && o.status !== 'out_for_delivery') throw new AppError(409, 'INVALID_TRANSITION', 'This delivery cannot be marked failed now', { status: o.status });
  await transitionOrder(o._id, 'failed_delivery', { userId: oid(userId), kind: 'rider' }, { storeId: o.storeId, req, reason: input.reason.replace(/_/g, ' '), ...(input.note ? { note: `${input.reason}: ${input.note}` } : {}) });
  await DeliverySession.findOneAndUpdate(
    { orderId: o._id },
    { $set: { storeId: o.storeId, riderId: oid(userId), status: 'failed', endedAt: new Date(), failReason: input.reason, ...(input.note ? { failNote: input.note } : {}) } },
    { upsert: true },
  );
  endTracking(String(o._id), 'failed_delivery');
  void notifyMany(await storeOrderRecipients(o.storeId), {
    type: 'store.delivery_failed',
    title: 'Delivery failed',
    body: `Order ${o.number}: ${input.reason.replace(/_/g, ' ')}.`,
    link: `/seller/orders/${String(o._id)}`,
    data: { orderId: String(o._id) },
  });
  return getRiderDelivery(userId, orderId);
}

// ---------- COD ledger ----------

export async function cashBalances(riderId: Types.ObjectId, storeIds: Types.ObjectId[]) {
  const agg = await RiderCashEntry.aggregate<{ _id: { s: Types.ObjectId; t: string }; sum: number }>([
    { $match: { riderId, storeId: { $in: storeIds } } },
    { $group: { _id: { s: '$storeId', t: '$type' }, sum: { $sum: '$amount' } } },
  ]);
  return storeIds.map((s) => {
    const get = (t: string) => agg.find((a) => String(a._id.s) === String(s) && a._id.t === t)?.sum ?? 0;
    return { storeId: s, collected: get('collected'), settled: get('settled'), outstanding: get('collected') - get('settled') };
  });
}

export async function riderCod(userId: string): Promise<RiderCodDTO> {
  const stores = await requireRiderStores(userId);
  const [balances, names, entries] = await Promise.all([
    cashBalances(oid(userId), stores),
    storeNames(stores),
    RiderCashEntry.find({ riderId: oid(userId), storeId: { $in: stores } }).sort({ createdAt: -1 }).limit(100).lean(),
  ]);
  return {
    stores: balances.map((b) => ({ ...b, storeId: String(b.storeId), storeName: names.get(String(b.storeId)) ?? '' })),
    entries: entries.map((e) => ({ id: String(e._id), storeId: String(e.storeId), type: e.type, amount: e.amount, ...(e.orderNumber ? { orderNumber: e.orderNumber } : {}), at: new Date(e.createdAt).toISOString() })),
  };
}

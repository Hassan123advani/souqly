import { PERMISSIONS, type OrderTrackingDTO, type RiderLocationEvent } from '@souqly/shared';
import { Types } from 'mongoose';
import { AppError } from '../../lib/AppError';
import { logger } from '../../lib/logger';
import { getIO } from '../../socket';
import { Order, type OrderLean } from '../orders/order.model';
import { StoreMember } from '../stores/storeMember.model';
import { User } from '../users/user.model';
import type { AuthUser } from '../../types/express';
import { DeliverySession } from './delivery.model';
import { etaMinutes, maskPhone } from './geo';

export const orderTrackRoom = (orderId: string) => `order-track:${orderId}`;

/** Buyer of the order, an active member of its store, or platform staff with admin.orders.view. */
export async function canViewOrderTracking(user: Pick<AuthUser, 'id' | 'permissions'>, order: Pick<OrderLean, 'buyerId' | 'storeId'>): Promise<boolean> {
  if (String(order.buyerId) === user.id) return true;
  if (user.permissions?.includes(PERMISSIONS.ADMIN_ORDERS_VIEW)) return true;
  return !!(await StoreMember.exists({ storeId: order.storeId, userId: new Types.ObjectId(user.id), status: 'active' }));
}

/**
 * Authorises a socket `order-track:join`. Throws AppError (404 for unknown/foreign orders so ids are
 * not enumerable; 409 TRACKING_INACTIVE when the order is not out for delivery).
 */
export async function authorizeTrackJoin(user: AuthUser, orderId: string): Promise<void> {
  const order = await Order.findById(orderId).select('buyerId storeId status').lean();
  if (!order || !(await canViewOrderTracking(user, order))) throw new AppError(404, 'NOT_FOUND', 'Order not found');
  if (order.status !== 'out_for_delivery') throw new AppError(409, 'TRACKING_INACTIVE', 'Live tracking is available only while the order is out for delivery');
}

/** Emits a location update to the order's tracking room. */
export function broadcastLocation(evt: RiderLocationEvent): void {
  getIO()?.to(orderTrackRoom(evt.orderId)).emit('rider:location', evt);
}

/** Tells watchers tracking is over and empties the room (delivered / failed / cancelled). */
export function endTracking(orderId: string, status: string): void {
  const io = getIO();
  if (!io) return;
  try {
    io.to(orderTrackRoom(orderId)).emit('tracking:ended', { orderId, status });
    io.in(orderTrackRoom(orderId)).socketsLeave(orderTrackRoom(orderId));
  } catch (err) {
    logger.warn({ err }, 'Failed to end tracking room');
  }
}

/** GET /orders/:number/tracking. Rider/location/ETA only while out_for_delivery. */
export async function getTracking(user: AuthUser, number: string): Promise<OrderTrackingDTO> {
  const order = await Order.findOne({ number }).lean<OrderLean>();
  if (!order || !(await canViewOrderTracking(user, order))) throw new AppError(404, 'NOT_FOUND', 'Order not found');
  const loc = order.shippingAddress?.location;
  const destination = {
    city: order.shippingAddress?.city ?? '',
    ...(order.shippingAddress?.area ? { area: order.shippingAddress.area } : {}),
    ...(loc?.lat != null && loc?.lng != null ? { location: { lat: loc.lat, lng: loc.lng } } : {}),
  };
  const base: OrderTrackingDTO = { number: order.number, status: order.status, active: false, rider: null, lastLocation: null, eta: null, destination };
  if (order.status !== 'out_for_delivery') return base;

  const [rider, session] = await Promise.all([
    order.riderId ? User.findById(order.riderId).select('name phone').lean() : null,
    DeliverySession.findOne({ orderId: order._id }).select('lastLocation').lean(),
  ]);
  const last = session?.lastLocation ?? null;
  return {
    ...base,
    active: true,
    rider: rider ? { name: rider.name, phone: maskPhone(rider.phone) } : null,
    lastLocation: last ? { lat: last.lat, lng: last.lng, at: new Date(last.at).toISOString() } : null,
    eta: etaMinutes(last, destination.location),
  };
}

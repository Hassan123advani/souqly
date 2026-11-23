import { orderTrackJoinSchema, riderSocketLocationSchema } from '@souqly/shared';
import type { Socket } from 'socket.io';
import { AppError } from '../../lib/AppError';
import { logger } from '../../lib/logger';
import type { AuthUser } from '../../types/express';
import { recordLocation } from './rider.service';
import { authorizeTrackJoin, orderTrackRoom } from './tracking.service';

type Ack = (res: { ok: true; [k: string]: unknown } | { error: { code: string; message: string } }) => void;

const fail = (ack: Ack | undefined, err: unknown) => {
  if (typeof ack !== 'function') return;
  if (err instanceof AppError) return ack({ error: { code: err.code, message: err.message } });
  logger.warn({ err }, 'socket handler failed');
  ack({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
};

/**
 * Delivery socket events for an authenticated socket:
 *  - `order-track:join {orderId}` / `order-track:leave {orderId}` (buyer / store member / admin.orders.view; out_for_delivery only)
 *  - `rider:location {orderId, lat, lng, ...}` (assigned rider only; same rules + rate limit as HTTP)
 */
export function registerDeliverySocket(socket: Socket): void {
  const user = socket.data.user as AuthUser;

  socket.on('order-track:join', (payload: unknown, ack?: Ack) => {
    const parsed = orderTrackJoinSchema.safeParse(payload);
    if (!parsed.success) return fail(ack, new AppError(400, 'VALIDATION_ERROR', 'Invalid order id'));
    authorizeTrackJoin(user, parsed.data.orderId)
      .then(async () => {
        await socket.join(orderTrackRoom(parsed.data.orderId));
        ack?.({ ok: true });
      })
      .catch((err) => fail(ack, err));
  });

  socket.on('order-track:leave', (payload: unknown, ack?: Ack) => {
    const parsed = orderTrackJoinSchema.safeParse(payload);
    if (parsed.success) void socket.leave(orderTrackRoom(parsed.data.orderId));
    ack?.({ ok: true });
  });

  socket.on('rider:location', (payload: unknown, ack?: Ack) => {
    const parsed = riderSocketLocationSchema.safeParse(payload);
    if (!parsed.success) return fail(ack, new AppError(400, 'VALIDATION_ERROR', 'Invalid location'));
    const { orderId, ...loc } = parsed.data;
    recordLocation(user.id, orderId, loc)
      .then((r) => ack?.({ ok: true, ...r }))
      .catch((err) => fail(ack, err));
  });
}

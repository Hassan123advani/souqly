import { notificationListQuerySchema, objectIdSchema, type NotificationListQuery } from '@souqly/shared';
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as svc from './notification.service';

/** In-app notification inbox (mounted at /notifications). Every query is scoped to req.user. */
export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);
const idParams = z.object({ id: objectIdSchema });

notificationsRouter.get(
  '/',
  validate({ query: notificationListQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as NotificationListQuery;
    const { items, nextCursor } = await svc.listNotifications(req.user!.id, { limit: q.limit, ...(q.cursor ? { cursor: q.cursor } : {}), unread: q.unread === '1' || q.unread === 'true' });
    res.json({ data: items, meta: { nextCursor } });
  }),
);

notificationsRouter.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    res.json({ data: { count: await svc.unreadCount(req.user!.id) } });
  }),
);

notificationsRouter.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    res.json({ data: { updated: await svc.markAllRead(req.user!.id) } });
  }),
);

notificationsRouter.post(
  '/:id/read',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.markRead(req.user!.id, req.params.id!) });
  }),
);

notificationsRouter.delete(
  '/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    await svc.deleteNotification(req.user!.id, req.params.id!);
    res.status(204).end();
  }),
);

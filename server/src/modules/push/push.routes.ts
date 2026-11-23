import { pushSubscriptionSchema, pushUnsubscribeSchema } from '@souqly/shared';
import { Router } from 'express';
import { integrations } from '../../config/env';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { removeSubscription, saveSubscription } from './push.service';

/** Web push subscriptions (mounted at /push). Stored even without VAPID keys; sending is a no-op then. */
export const pushRouter = Router();
pushRouter.use(requireAuth);

pushRouter.post(
  '/subscriptions',
  validate({ body: pushSubscriptionSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as { endpoint: string; keys: { p256dh: string; auth: string } };
    await saveSubscription(req.user!.id, { endpoint: body.endpoint, keys: body.keys }, req.header('user-agent') ?? undefined);
    res.status(201).json({ data: { ok: true }, meta: { enabled: integrations.hasVapid } });
  }),
);

pushRouter.delete(
  '/subscriptions',
  validate({ body: pushUnsubscribeSchema }),
  asyncHandler(async (req, res) => {
    await removeSubscription(req.user!.id, (req.body as { endpoint: string }).endpoint);
    res.status(204).end();
  }),
);

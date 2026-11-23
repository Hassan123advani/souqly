import { alertSchema } from '@souqly/shared';
import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as svc from './alert.service';

/** Mounted at `/alerts`. */
export const alertRouter = Router();
alertRouter.use(requireAuth);

alertRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.listAlerts(req.user!.id) });
  }),
);

alertRouter.post(
  '/',
  validate({ body: alertSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await svc.subscribe(req.user!.id, req.body) });
  }),
);

alertRouter.delete(
  '/',
  validate({ body: alertSchema }),
  asyncHandler(async (req, res) => {
    await svc.unsubscribe(req.user!.id, req.body);
    res.status(204).end();
  }),
);

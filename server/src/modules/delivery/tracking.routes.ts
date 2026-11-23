import { orderNumberParamsSchema } from '@souqly/shared';
import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { getTracking } from './tracking.service';

/** GET /orders/:number/tracking (mounted at /orders before the buyer orders router). */
export const trackingRouter = Router();

trackingRouter.get(
  '/:number/tracking',
  requireAuth,
  validate({ params: orderNumberParamsSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await getTracking(req.user!, String(req.params.number)) });
  }),
);

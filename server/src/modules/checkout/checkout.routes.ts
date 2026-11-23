import { checkoutNumberParamsSchema, checkoutPreviewSchema, checkoutSchema } from '@souqly/shared';
import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/auth';
import { rateLimits } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import * as svc from './checkout.service';

export const checkoutRouter = Router();
checkoutRouter.use(requireAuth);

checkoutRouter.post(
  '/preview',
  validate({ body: checkoutPreviewSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.preview(req.user!.id, req.body) });
  }),
);

checkoutRouter.post(
  '/',
  rateLimits.checkout,
  validate({ body: checkoutSchema }),
  asyncHandler(async (req, res) => {
    const { checkout, created } = await svc.placeCheckout(req, req.body);
    res.status(created ? 201 : 200).json({ data: checkout });
  }),
);

checkoutRouter.get(
  '/:number',
  validate({ params: checkoutNumberParamsSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.getCheckout(req.user!.id, String(req.params.number)) });
  }),
);

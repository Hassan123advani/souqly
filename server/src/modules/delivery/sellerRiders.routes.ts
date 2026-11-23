import { PERMISSIONS, codSettleSchema, objectIdSchema, riderSettingsSchema } from '@souqly/shared';
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/auth';
import { requirePermission } from '../../middleware/permissions';
import { storeContext } from '../../middleware/storeContext';
import { validate } from '../../middleware/validate';
import * as svc from './sellerRiders.service';

/** Seller Center riders + COD settlement (mounted at /seller/riders). storeId comes ONLY from req.store. */
export const sellerRidersRouter = Router();
sellerRidersRouter.use(requireAuth, storeContext);

sellerRidersRouter.get(
  '/',
  requirePermission(PERMISSIONS.STORE_ORDERS_VIEW),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.listStoreRiders(req.store!) });
  }),
);

sellerRidersRouter.get(
  '/settings',
  requirePermission(PERMISSIONS.STORE_ORDERS_VIEW),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.getRiderSettings(req.store!) });
  }),
);

sellerRidersRouter.patch(
  '/settings',
  requirePermission(PERMISSIONS.STORE_SETTINGS_MANAGE),
  validate({ body: riderSettingsSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.updateRiderSettings(req, (req.body as { riderFee: number }).riderFee) });
  }),
);

sellerRidersRouter.post(
  '/:memberId/cod-settle',
  requirePermission(PERMISSIONS.STORE_ORDERS_MANAGE),
  validate({ params: z.object({ memberId: objectIdSchema }), body: codSettleSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await svc.settleCod(req, req.params.memberId!, (req.body as { amount: number }).amount) });
  }),
);

import { PERMISSIONS, objectIdSchema, storeRejectSchema } from '@souqly/shared';
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/auth';
import { requirePermission } from '../../middleware/permissions';
import { validate } from '../../middleware/validate';
import { reviewStore } from './storeReview.service';

/** Minimal store review API (the full admin panel comes later). Mounted at /api/v1/admin. */
export const adminStoresRouter = Router();
const MANAGE = [requireAuth, requirePermission(PERMISSIONS.ADMIN_STORES_MANAGE)];
const idParams = z.object({ id: objectIdSchema });

adminStoresRouter.post(
  '/stores/:id/approve',
  ...MANAGE,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    res.json({ data: await reviewStore(req.params.id!, 'approved', { req }) });
  }),
);

adminStoresRouter.post(
  '/stores/:id/reject',
  ...MANAGE,
  validate({ params: idParams, body: storeRejectSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await reviewStore(req.params.id!, 'rejected', { req }, req.body.reason) });
  }),
);

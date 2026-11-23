import { PERMISSIONS } from '@souqly/shared';
import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/auth';
import { requirePermission } from '../../middleware/permissions';
import { storeContext } from '../../middleware/storeContext';
import { getHealth, recomputeHealth } from './storeHealth.service';

/** `/seller/health` (cached ≤ 24 h) and `/seller/health/recompute` (on demand). */
export const sellerHealthRouter = Router();
const base = [requireAuth, storeContext, requirePermission(PERMISSIONS.STORE_DASHBOARD)];
sellerHealthRouter.get('/health', ...base, asyncHandler(async (req, res) => res.json({ data: await getHealth(req.store!._id) })));
sellerHealthRouter.post('/health/recompute', ...base, asyncHandler(async (req, res) => res.json({ data: await recomputeHealth(req.store!._id) })));

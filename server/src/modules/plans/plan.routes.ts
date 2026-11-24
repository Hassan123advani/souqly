import { PERMISSIONS, adminPlanRequestReviewSchema, objectIdSchema, planRequestSchema } from '@souqly/shared';
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/auth';
import { forbidWhileImpersonating } from '../../middleware/impersonation';
import { requirePermission } from '../../middleware/permissions';
import { can } from '../admin/common';
import { storeContext } from '../../middleware/storeContext';
import { validate } from '../../middleware/validate';
import { listPlanRequests, planSummary, requestPlan, reviewPlanRequest } from './plan.service';

/** `/seller/plan*` — any member can view; only settings managers (owner/manager) request upgrades. */
export const sellerPlanRouter = Router();
// Per-route middleware: this router is mounted at /seller, so a router-level .use() would also hit /seller/onboarding etc.
sellerPlanRouter.get('/plan', requireAuth, storeContext, requirePermission(PERMISSIONS.STORE_DASHBOARD), asyncHandler(async (req, res) => res.json({ data: await planSummary(req.store!) })));
sellerPlanRouter.post(
  '/plan/request',
  requireAuth,
  forbidWhileImpersonating,
  storeContext,
  requirePermission(PERMISSIONS.STORE_SETTINGS_MANAGE),
  validate({ body: planRequestSchema }),
  asyncHandler(async (req, res) => res.status(201).json({ data: await requestPlan(req, req.body.plan, req.body.note) })),
);

/** `/admin/plan-requests*` — per-route `can()` only (mounted at /admin: never add a router-level .use()). */
export const adminPlanRouter = Router();
adminPlanRouter.get(
  '/plan-requests',
  ...can(PERMISSIONS.ADMIN_STORES_VIEW),
  validate({ query: z.object({ status: z.enum(['pending', 'approved', 'rejected']).optional() }) }),
  asyncHandler(async (req, res) => res.json({ data: await listPlanRequests(req.query.status as string | undefined) })),
);
adminPlanRouter.patch(
  '/plan-requests/:id',
  // Approving changes the plan without an invoice: billing.manage only (security review H2).
  ...can(PERMISSIONS.ADMIN_BILLING_MANAGE),
  validate({ params: z.object({ id: objectIdSchema }), body: adminPlanRequestReviewSchema }),
  asyncHandler(async (req, res) => res.json({ data: await reviewPlanRequest(req, req.params.id!, req.body.status, req.body.note) })),
);

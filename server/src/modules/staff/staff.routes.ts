import { PERMISSIONS, activityQuerySchema, customRoleSchema, customRoleUpdateSchema, objectIdSchema, staffInviteSchema, staffUpdateSchema } from '@souqly/shared';
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler';
import { requirePermission } from '../../middleware/permissions';
import { validate } from '../../middleware/validate';
import * as svc from './staff.service';

/** Mounted inside sellerRouter (requireAuth + storeContext already applied). storeId ONLY from req.store. */
export const staffRouter = Router();
const STAFF = requirePermission(PERMISSIONS.STORE_STAFF_MANAGE);
const idParams = z.object({ id: objectIdSchema });

staffRouter.get(
  '/staff',
  STAFF,
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.listStaff(req.store!._id) });
  }),
);

staffRouter.post(
  '/staff/invite',
  STAFF,
  validate({ body: staffInviteSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await svc.inviteStaff(req, req.body) });
  }),
);

staffRouter.patch(
  '/staff/:id',
  STAFF,
  validate({ params: idParams, body: staffUpdateSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.updateStaff(req, req.params.id!, req.body) });
  }),
);

staffRouter.delete(
  '/staff/:id',
  STAFF,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    await svc.removeStaff(req, req.params.id!);
    res.status(204).end();
  }),
);

staffRouter.get(
  '/roles',
  STAFF,
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.listRoles(req.store!._id) });
  }),
);

staffRouter.post(
  '/roles',
  STAFF,
  validate({ body: customRoleSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await svc.createRole(req, req.body) });
  }),
);

staffRouter.patch(
  '/roles/:id',
  STAFF,
  validate({ params: idParams, body: customRoleUpdateSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.updateRole(req, req.params.id!, req.body) });
  }),
);

staffRouter.delete(
  '/roles/:id',
  STAFF,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    await svc.deleteRole(req, req.params.id!);
    res.status(204).end();
  }),
);

staffRouter.get(
  '/activity',
  STAFF,
  validate({ query: activityQuerySchema }),
  asyncHandler(async (req, res) => {
    const { items, nextCursor } = await svc.storeActivity(req.store!._id, req.query as unknown as { cursor?: string; limit: number });
    res.json({ data: items, meta: { nextCursor } });
  }),
);

import { PERMISSIONS, businessSchema, objectIdSchema, onboardingSchema, payoutSchema } from '@souqly/shared';
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/auth';
import { requirePermission } from '../../middleware/permissions';
import { rateLimits } from '../../middleware/rateLimit';
import { requireStoreOwner, storeContextAllowRejected } from '../../middleware/storeContext';
import { validate } from '../../middleware/validate';
import { getSellerStore, updateBusiness, updatePayout } from '../seller/store.service';
import { myInvitations, respondToInvitation } from '../staff/staff.service';
import { onboard } from './onboarding.service';

/**
 * Seller routes that run WITHOUT the regular storeContext. Mounted at /api/v1/seller BEFORE
 * sellerRouter:
 *  - onboarding + invitations: the caller has no (active) store yet;
 *  - GET /store and PATCH /store/business|payout: also reachable by a REJECTED store so it can read
 *    the reason and resubmit (suspended stores stay locked out).
 */
export const sellerPreStoreRouter = Router();
const idParams = z.object({ id: objectIdSchema });

sellerPreStoreRouter.post(
  '/onboarding',
  requireAuth,
  rateLimits.search,
  validate({ body: onboardingSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await onboard(req, req.body) });
  }),
);

sellerPreStoreRouter.get(
  '/invitations',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ data: await myInvitations(req.user!.id) });
  }),
);

for (const action of ['accept', 'decline'] as const) {
  sellerPreStoreRouter.post(
    `/invitations/:id/${action}`,
    requireAuth,
    validate({ params: idParams }),
    asyncHandler(async (req, res) => {
      await respondToInvitation(req, req.params.id!, action === 'accept');
      res.status(204).end();
    }),
  );
}

sellerPreStoreRouter.get(
  '/store',
  requireAuth,
  storeContextAllowRejected,
  asyncHandler(async (req, res) => {
    res.json({ data: await getSellerStore(req.store!._id, req.storeMember!) });
  }),
);

sellerPreStoreRouter.patch(
  '/store/payout',
  requireAuth,
  storeContextAllowRejected,
  requirePermission(PERMISSIONS.STORE_FINANCE_MANAGE),
  validate({ body: payoutSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await updatePayout(req, req.body) });
  }),
);

sellerPreStoreRouter.patch(
  '/store/business',
  requireAuth,
  storeContextAllowRejected,
  requireStoreOwner,
  validate({ body: businessSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await updateBusiness(req, req.body) });
  }),
);

import { affiliateLinkQuerySchema } from '@souqly/shared';
import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { requireFlag } from '../loyalty/flags';
import { affiliateLink, myCommissions } from './affiliate.service';

/** `/affiliate/*` (flag affiliateLinks). */
export const affiliateRouter = Router();
affiliateRouter.use(requireFlag('affiliateLinks'), requireAuth);
affiliateRouter.get(
  '/link',
  validate({ query: affiliateLinkQuerySchema }),
  asyncHandler(async (req, res) => res.json({ data: await affiliateLink(req.user!.id, String(req.query.productId)) })),
);
affiliateRouter.get('/commissions', asyncHandler(async (req, res) => res.json({ data: await myCommissions(req.user!.id) })));

import { slugAvailableQuerySchema } from '@souqly/shared';
import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { rateLimits } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import { checkSlug } from './slug.service';

/** Public store helpers mounted at /api/v1/stores BEFORE the marketplace router (so /:slug does not swallow them). */
export const storesPublicRouter = Router();

storesPublicRouter.get(
  '/slug-available',
  rateLimits.search,
  validate({ query: slugAvailableQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await checkSlug(String(req.query.slug)) });
  }),
);

import { pageQuerySchema, slugParamsSchema } from '@souqly/shared';
import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { optionalAuth, requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as svc from './follow.service';

/** Mounted at `/`. */
export const followRouter = Router();

followRouter.post(
  '/stores/:slug/follow',
  requireAuth,
  validate({ params: slugParamsSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.follow(req.user!.id, String(req.params.slug)) });
  }),
);

followRouter.delete(
  '/stores/:slug/follow',
  requireAuth,
  validate({ params: slugParamsSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.unfollow(req.user!.id, String(req.params.slug)) });
  }),
);

followRouter.get(
  '/stores/:slug/follow-status',
  optionalAuth,
  validate({ params: slugParamsSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.followStatus(req.user?.id, String(req.params.slug)) });
  }),
);

followRouter.get(
  '/me/following',
  requireAuth,
  validate({ query: pageQuerySchema }),
  asyncHandler(async (req, res) => {
    const { items, nextCursor } = await svc.listFollowing(req.user!.id, req.query as never);
    res.json({ data: items, meta: { nextCursor } });
  }),
);

followRouter.get(
  '/feed/following',
  requireAuth,
  validate({ query: pageQuerySchema }),
  asyncHandler(async (req, res) => {
    const { items, nextCursor } = await svc.followingFeed(req.user!.id, req.query as never);
    res.json({ data: items, meta: { nextCursor } });
  }),
);

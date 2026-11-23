import { PERMISSIONS, idParamsSchema, pageQuerySchema, replySchema, reviewCreateSchema, reviewListQuerySchema, reviewReportSchema, sellerReviewQuerySchema, slugParamsSchema } from '@souqly/shared';
import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { optionalAuth, requireAuth } from '../../middleware/auth';
import { storeContext } from '../../middleware/storeContext';
import { validate } from '../../middleware/validate';
import { requireAnyStorePermission } from '../chat/storePerms';
import { socialLimits } from '../loyalty/limits';
import { createReport } from '../reports/report.service';
import * as svc from './review.service';

/** Mounted at `/`: /products/:slug/reviews*, /reviews*. */
export const reviewRouter = Router();

reviewRouter.get(
  '/products/:slug/reviews',
  optionalAuth,
  validate({ params: slugParamsSchema, query: reviewListQuerySchema }),
  asyncHandler(async (req, res) => {
    const { items, nextCursor } = await svc.listProductReviews(String(req.params.slug), req.query as never, req.user?.id);
    res.json({ data: items, meta: { nextCursor } });
  }),
);

reviewRouter.get(
  '/products/:slug/reviews/summary',
  validate({ params: slugParamsSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.reviewSummary(String(req.params.slug)) });
  }),
);

reviewRouter.post(
  '/reviews',
  requireAuth,
  socialLimits.write,
  validate({ body: reviewCreateSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await svc.createReview(req, req.body) });
  }),
);

reviewRouter.get(
  '/reviews/mine',
  requireAuth,
  validate({ query: pageQuerySchema }),
  asyncHandler(async (req, res) => {
    const { items, nextCursor } = await svc.myReviews(req.user!.id, req.query as never);
    res.json({ data: items, meta: { nextCursor } });
  }),
);

reviewRouter.get(
  '/reviews/pending',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.pendingReviews(req.user!.id) });
  }),
);

reviewRouter.post(
  '/reviews/:id/helpful',
  requireAuth,
  validate({ params: idParamsSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.voteHelpful(req.user!.id, String(req.params.id)) });
  }),
);

reviewRouter.delete(
  '/reviews/:id/helpful',
  requireAuth,
  validate({ params: idParamsSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.unvoteHelpful(req.user!.id, String(req.params.id)) });
  }),
);

reviewRouter.post(
  '/reviews/:id/report',
  requireAuth,
  socialLimits.write,
  validate({ params: idParamsSchema, body: reviewReportSchema }),
  asyncHandler(async (req, res) => {
    await createReport(req, { targetType: 'review', targetId: String(req.params.id), ...req.body });
    res.status(201).json({ data: { reported: true } });
  }),
);

/** Mounted at `/seller` (per-route auth + storeContext so other /seller routes are unaffected). */
export const sellerReviewRouter = Router();
const sellerReviewView = [requireAuth, storeContext, requireAnyStorePermission(PERMISSIONS.STORE_CHAT_MANAGE, PERMISSIONS.STORE_ORDERS_VIEW)];
const sellerReviewManage = [requireAuth, storeContext, requireAnyStorePermission(PERMISSIONS.STORE_CHAT_MANAGE, PERMISSIONS.STORE_ORDERS_MANAGE)];

sellerReviewRouter.get(
  '/reviews',
  ...sellerReviewView,
  validate({ query: sellerReviewQuerySchema }),
  asyncHandler(async (req, res) => {
    const { items, nextCursor } = await svc.sellerReviews(req.store!._id, req.query as never);
    res.json({ data: items, meta: { nextCursor } });
  }),
);

sellerReviewRouter.post(
  '/reviews/:id/reply',
  ...sellerReviewManage,
  validate({ params: idParamsSchema, body: replySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.replyToReview(req, String(req.params.id), req.body.text) });
  }),
);

import { PERMISSIONS, answerSchema, idParamsSchema, pageQuerySchema, questionCreateSchema, sellerQuestionQuerySchema, slugParamsSchema } from '@souqly/shared';
import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/auth';
import { requirePermission } from '../../middleware/permissions';
import { storeContext } from '../../middleware/storeContext';
import { validate } from '../../middleware/validate';
import { socialLimits } from '../loyalty/limits';
import * as svc from './qa.service';

/** Mounted at `/`. */
export const qaRouter = Router();

qaRouter.get(
  '/products/:slug/questions',
  validate({ params: slugParamsSchema, query: pageQuerySchema }),
  asyncHandler(async (req, res) => {
    const { items, nextCursor } = await svc.listQuestions(String(req.params.slug), req.query as never);
    res.json({ data: items, meta: { nextCursor } });
  }),
);

qaRouter.post(
  '/products/:slug/questions',
  requireAuth,
  socialLimits.write,
  validate({ params: slugParamsSchema, body: questionCreateSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await svc.askQuestion(req, String(req.params.slug), req.body.text) });
  }),
);

/** Mounted at `/seller` (per-route auth + storeContext). */
export const sellerQaRouter = Router();
const chatPerm = [requireAuth, storeContext, requirePermission(PERMISSIONS.STORE_CHAT_MANAGE)];

sellerQaRouter.get(
  '/questions',
  ...chatPerm,
  validate({ query: sellerQuestionQuerySchema }),
  asyncHandler(async (req, res) => {
    const { items, nextCursor } = await svc.sellerQuestions(req.store!._id, req.query as never);
    res.json({ data: items, meta: { nextCursor } });
  }),
);

sellerQaRouter.post(
  '/questions/:id/answer',
  ...chatPerm,
  validate({ params: idParamsSchema, body: answerSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.answerQuestion(req, String(req.params.id), req.body.text) });
  }),
);

import { reportCreateSchema } from '@souqly/shared';
import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { socialLimits } from '../loyalty/limits';
import { createReport } from './report.service';

/** Mounted at `/reports`. */
export const reportRouter = Router();

reportRouter.post(
  '/',
  requireAuth,
  socialLimits.write,
  validate({ body: reportCreateSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await createReport(req, req.body) });
  }),
);

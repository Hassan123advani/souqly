import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { AppError, notFound } from '../../lib/AppError';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middleware/validate';
import { SWEEP_NAMES, type SweepName } from '../../services/jobs/sweeps';
import { isValidCronAuth, runSweeps } from './cron.service';

/**
 * Internal scheduler hooks: `GET|POST /internal/cron/:job` with `Authorization: Bearer ${CRON_SECRET}`.
 * `:job` = `all` or one name from the sweep registry (`services/jobs/sweeps.ts`). Vercel Cron calls `GET /api/v1/internal/cron/all`.
 * When CRON_SECRET is unset the endpoint does not exist (404), so it is never reachable by accident.
 */
export const cronRouter = Router();

const params = z.object({ job: z.enum(['all', ...SWEEP_NAMES] as [string, ...string[]]) });

const cronAuth: RequestHandler = (req, _res, next) => {
  const secret = env.CRON_SECRET;
  if (!secret) return next(notFound('Route'));
  if (!isValidCronAuth(req.headers.authorization, secret)) return next(new AppError(401, 'UNAUTHENTICATED', 'Invalid cron credentials'));
  next();
};

const run = asyncHandler(async (req, res) => {
  const { job } = req.params as z.infer<typeof params>;
  const names: SweepName[] = job === 'all' ? SWEEP_NAMES : [job as SweepName];
  const results = await runSweeps(names);
  res.status(results.every((r) => r.ok) ? 200 : 500).json({ data: { results } });
});

// Auth runs before validation so unauthenticated callers cannot probe job names.
cronRouter.get('/internal/cron/:job', cronAuth, validate({ params }), run);
cronRouter.post('/internal/cron/:job', cronAuth, validate({ params }), run);

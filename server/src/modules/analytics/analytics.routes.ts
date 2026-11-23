import { PERMISSIONS, analyticsQuerySchema } from '@souqly/shared';
import { Router } from 'express';
import type { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/auth';
import { requirePermission } from '../../middleware/permissions';
import { storeContext } from '../../middleware/storeContext';
import { validate } from '../../middleware/validate';
import { audit } from '../audit/audit.service';
import { hasPlanFeature } from '../plans/plan.service';
import { AppError } from '../../lib/AppError';
import { analyticsCsv, analyticsPdf, getAnalytics } from './analytics.service';

/** `/seller/analytics` — JSON for everyone with the permission; CSV/PDF export needs Pro+. */
export const sellerAnalyticsRouter = Router();
sellerAnalyticsRouter.get(
  '/analytics',
  requireAuth,
  storeContext,
  requirePermission(PERMISSIONS.STORE_ANALYTICS_VIEW),
  validate({ query: analyticsQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof analyticsQuerySchema>;
    const store = req.store!;
    if (q.format !== 'json' && !hasPlanFeature(store, 'analyticsExport')) {
      throw new AppError(403, 'PLAN_LIMIT', 'Analytics export is available on Pro and Business plans.', { plan: store.plan ?? 'free', feature: 'analyticsExport', requiredPlan: 'pro' });
    }
    const report = await getAnalytics(store._id, q.range);
    if (q.format === 'json') return void res.json({ data: report });
    await audit({ action: 'store.analytics_exported', targetType: 'Store', targetId: store._id, meta: { format: q.format, range: q.range }, req });
    const filename = `analytics-${store.slug}-${q.range}`.replace(/[^a-z0-9._-]/gi, '_');
    if (q.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      return void res.send(analyticsCsv(report));
    }
    const pdf = await analyticsPdf(store.name, report);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
    res.send(pdf);
  }),
);

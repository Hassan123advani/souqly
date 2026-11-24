import { recomputeAllCategoryPaths } from '../../modules/admin/catalog.routes';
import { runBillingSweep } from '../../modules/billing/billing.service';
import { sweepAlerts } from '../../modules/alerts/alert.service';
import { recomputeAllHealth } from '../../modules/health/storeHealth.service';

/** Result of one sweep: small numeric counters for logs and the cron response. */
export type SweepResult = Record<string, number>;
export type Sweep = () => Promise<SweepResult>;

/**
 * Registry of periodic sweeps that can be run on demand: `GET|POST /api/v1/internal/cron/:name`
 * (`all` runs every entry in insertion order). Used where the in-process scheduler is unavailable
 * (Vercel Cron, daily); locally the same work also runs on timers (`startAlertJobs`, `startHealthJobs`,
 * the category-path job).
 *
 * To add a job: add `name: async () => ({ ...counters })` here. Every sweep MUST be idempotent and
 * re-derive its work from the database (it may run late, twice, or concurrently with a timer), and
 * should finish well within the function's maxDuration (60 s on Vercel).
 *
 * Not listed on purpose: rider locations, notifications, sessions and tokens expire through Mongo
 * TTL indexes and need no sweep.
 */
export const SWEEPS = {
  'alerts.sweep': async () => ({ sent: await sweepAlerts() }),
  'storeHealth.recompute': async () => ({ stores: await recomputeAllHealth() }),
  'catalog.recomputeCategoryPaths': async () => recomputeAllCategoryPaths(),
  /** Daily billing: commission sync, renewal invoices, overdue → billing suspension (docs/api-billing.md §3). */
  'billing.daily': async () => runBillingSweep(),
} satisfies Record<string, Sweep>;

export type SweepName = keyof typeof SWEEPS;
export const SWEEP_NAMES = Object.keys(SWEEPS) as SweepName[];

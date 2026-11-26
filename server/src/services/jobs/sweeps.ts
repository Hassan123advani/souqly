import { recomputeAllCategoryPaths } from '../../modules/admin/catalog.routes';
import { releaseAffiliateCommissions } from '../../modules/affiliate/affiliate.service';
import { runBillingEnforcement, runBillingSweep } from '../../modules/billing/billing.service';
import { sweepAlerts } from '../../modules/alerts/alert.service';
import { sweepAiReview } from '../../modules/aiReview/aiReview.service';
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
  /** Billing enforcement first and on its own: overdue -> suspension, expired upgrades void (never starved by renewals). */
  'billing.enforce': async () => runBillingEnforcement(),
  'alerts.sweep': async () => ({ sent: await sweepAlerts() }),
  'storeHealth.recompute': async () => ({ stores: await recomputeAllHealth() }),
  'catalog.recomputeCategoryPaths': async () => recomputeAllCategoryPaths(),
  /** Daily billing: enforcement, commission sync, renewal invoices; time-boxed (~45 s), `more: 1` = call again. */
  'billing.daily': async () => runBillingSweep(),
  /** Affiliate commissions whose return window has passed are paid to the wallet (D-091). */
  'affiliate.release': async () => releaseAffiliateCommissions(),
  /** Retries automated store/product reviews that failed or never ran (D-092). */
  'aiReview.sweep': async () => sweepAiReview(),
} satisfies Record<string, Sweep>;

export type SweepName = keyof typeof SWEEPS;
export const SWEEP_NAMES = Object.keys(SWEEPS) as SweepName[];

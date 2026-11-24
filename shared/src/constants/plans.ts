import type { StoreLayout, StorePlan } from '../schemas/catalog';

/**
 * Seller plans (docs/api-billing.md). Monthly prices in paisa. Commission is the same flat
 * PLATFORM_COMMISSION_BPS for every plan (no plan discount).
 */
export type PlanFeature =
  | 'analyticsExport'
  /** 90-day analytics / dashboard range. */
  | 'advancedAnalytics'
  | 'pos'
  | 'bulkUpload'
  | 'flashDeals'
  /** Bundles and Buy-X-Get-Y promotions. */
  | 'bundles'
  | 'featuredProducts'
  /** Every store layout template (Free: classic only). */
  | 'layoutTemplates'
  | 'prioritySupport';

export const PLAN_FEATURES: PlanFeature[] = ['analyticsExport', 'advancedAnalytics', 'pos', 'bulkUpload', 'flashDeals', 'bundles', 'featuredProducts', 'layoutTemplates', 'prioritySupport'];

export interface PlanDefinition {
  id: StorePlan;
  name: string;
  /** Monthly fee in minor units (paisa). */
  priceMinor: number;
  interval: 'month';
  /** `products: null` = unlimited. `staff` = non-owner members incl. pending invites. `storeSections` = store page builder sections. */
  limits: { products: number | null; staff: number; storeSections: number };
  /** Store layout templates the plan may switch to. */
  layouts: StoreLayout[];
  features: Record<PlanFeature, boolean>;
}

const ALL_LAYOUTS: StoreLayout[] = ['classic', 'bold', 'boutique', 'minimal'];

export const PLANS: Record<StorePlan, PlanDefinition> = {
  free: {
    id: 'free',
    name: 'Free',
    priceMinor: 0,
    interval: 'month',
    limits: { products: 50, staff: 2, storeSections: 4 },
    layouts: ['classic'],
    features: { analyticsExport: false, advancedAnalytics: false, pos: false, bulkUpload: false, flashDeals: false, bundles: false, featuredProducts: false, layoutTemplates: false, prioritySupport: false },
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceMinor: 50_000,
    interval: 'month',
    limits: { products: 1000, staff: 10, storeSections: 12 },
    layouts: ALL_LAYOUTS,
    features: { analyticsExport: true, advancedAnalytics: true, pos: true, bulkUpload: true, flashDeals: true, bundles: true, featuredProducts: true, layoutTemplates: true, prioritySupport: false },
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    priceMinor: 100_000,
    interval: 'month',
    limits: { products: null, staff: 50, storeSections: 20 },
    layouts: ALL_LAYOUTS,
    features: { analyticsExport: true, advancedAnalytics: true, pos: true, bulkUpload: true, flashDeals: true, bundles: true, featuredProducts: true, layoutTemplates: true, prioritySupport: true },
  },
};

/** Plans ordered by price (used for upgrade/downgrade decisions). */
export const PLAN_ORDER: StorePlan[] = ['free', 'pro', 'premium'];
export const planRank = (plan: StorePlan): number => PLAN_ORDER.indexOf(plan);

/** Cheapest plan that includes `feature`. */
export function requiredPlanFor(feature: PlanFeature): StorePlan {
  return PLAN_ORDER.find((p) => PLANS[p].features[feature]) ?? 'premium';
}

/** Maps legacy plan ids (`business` → `premium`) and unknown values to a valid plan. */
export function normalizePlan(plan: string | null | undefined): StorePlan {
  if (plan === 'business') return 'premium';
  return plan === 'pro' || plan === 'premium' ? plan : 'free';
}

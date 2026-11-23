import type { StorePlan } from '../schemas/catalog';

export type PlanFeature = 'analyticsExport' | 'pos' | 'bulkUpload' | 'customDomain';

export interface PlanDefinition {
  id: StorePlan;
  name: string;
  /** `null` = unlimited. */
  limits: { products: number | null; staff: number };
  /** Discount on the resolved commission rate, in basis points of the order (e.g. 100 = 1 percentage point). */
  commissionDiscountBps: number;
  features: Record<PlanFeature, boolean>;
}

/** Seller plans (Phase 10). Upgrades are request → admin approval; there are no payments yet. */
export const PLANS: Record<StorePlan, PlanDefinition> = {
  free: {
    id: 'free',
    name: 'Free',
    limits: { products: 50, staff: 2 },
    commissionDiscountBps: 0,
    features: { analyticsExport: false, pos: false, bulkUpload: false, customDomain: false },
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    limits: { products: 1000, staff: 10 },
    commissionDiscountBps: 100,
    features: { analyticsExport: true, pos: true, bulkUpload: true, customDomain: false },
  },
  business: {
    id: 'business',
    name: 'Business',
    limits: { products: null, staff: 50 },
    commissionDiscountBps: 200,
    features: { analyticsExport: true, pos: true, bulkUpload: true, customDomain: true },
  },
};

/** Commission after the plan discount (never below 0). */
export function planCommissionBps(baseBps: number, plan: StorePlan | undefined): number {
  return Math.max(0, baseBps - (PLANS[plan ?? 'free']?.commissionDiscountBps ?? 0));
}

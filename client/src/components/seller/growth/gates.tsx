import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock, Sparkles } from 'lucide-react';
import { PERMISSIONS, requiredPlanFor, type PlanFeature, type Permission } from '@souqly/shared';
import { getErrorCode } from '@/api/client';
import { usePlan } from '@/api/growth';
import { Button, Card, EmptyState } from '@/components/ui';
import { useCan } from '../usePermissions';

/** Renders children only when the member holds `perm` in the active store (the API enforces the same). */
export function StorePermGate({ perm, children }: { perm: Permission; children: ReactNode }) {
  const { t } = useTranslation();
  const can = useCan();
  if (!can(perm)) {
    return (
      <Card>
        <EmptyState icon={<Lock />} title={t('growth.common.noAccessTitle')} description={t('growth.common.noAccessBody')} />
      </Card>
    );
  }
  return <>{children}</>;
}

/**
 * Whether the acting store's plan includes `feature`, as reported by `GET /seller/plan`
 * (`definition.features`; readable by every member, unlike `/seller/billing/plans` which needs
 * finance access). Plan names are never hard-coded. `undefined` while loading.
 * If the plan cannot be read, the UI stays open and the server's 403 PLAN_LIMIT decides.
 */
export function usePlanFeature(feature: PlanFeature): boolean | undefined {
  const plan = usePlan();
  if (plan.isLoading) return undefined;
  if (plan.error || !plan.data) return true;
  return plan.data.definition.features[feature] === true;
}

/** True when an API error says the plan does not include a feature. */
export const isPlanLimit = (err: unknown) => getErrorCode(err) === 'PLAN_LIMIT';

/** Shown in place of a plan-gated feature: links to the Billing > Plans page (upgrade creates an invoice). */
export function UpgradeCard({ feature, compact }: { feature: PlanFeature; compact?: boolean }) {
  const { t } = useTranslation();
  const plan = usePlan();
  const can = useCan();
  const required = requiredPlanFor(feature);
  const canBill = can(PERMISSIONS.STORE_FINANCE_VIEW);
  return (
    <Card>
      <EmptyState
        compact={compact}
        icon={<Sparkles />}
        title={t('growth.plan.lockedTitle', { feature: t(`growth.plan.features.${feature}`, { defaultValue: t(`billing.features.${feature}`) }) })}
        description={t(canBill ? 'billing.gate.body' : 'billing.gate.bodyAskOwner', { plan: t(`billing.planName.${plan.data?.plan ?? 'free'}`, { defaultValue: plan.data?.definition.name ?? '' }), required: t(`billing.planName.${required}`) })}
        action={
          canBill && (
            <Button to="/seller/billing/plans" size="sm">
              {t('billing.gate.cta')}
            </Button>
          )
        }
      />
    </Card>
  );
}

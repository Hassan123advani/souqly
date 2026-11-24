import { useTranslation } from 'react-i18next';
import type { StorePlan } from '@souqly/shared';
import { Badge, type BadgeTone } from '@/components/ui';

const TONES: Record<string, BadgeTone> = {
  active: 'success',
  suspended: 'danger',
  open: 'warning',
  overdue: 'danger',
  paid: 'success',
  waived: 'info',
  void: 'neutral',
  unpaid: 'warning',
  invoiced: 'info',
  deducted: 'success',
  credited: 'info',
  pending: 'warning',
  succeeded: 'success',
  rejected: 'danger',
  failed: 'danger',
  cancelled: 'neutral',
  requested: 'warning',
  approved: 'info',
};

/** Colour-coded, translated chip for invoice / payment / commission / payout / store billing statuses. */
export function BillingBadge({ status, className }: { status: string; className?: string }) {
  const { t } = useTranslation();
  return (
    <Badge tone={TONES[status] ?? 'neutral'} size="sm" className={className}>
      <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden />
      {t(`billing.status.${status}`, { defaultValue: status.replace(/_/g, ' ') })}
    </Badge>
  );
}

/** Translated plan name (falls back to the API name). */
export function usePlanName() {
  const { t } = useTranslation();
  return (plan: StorePlan | string, fallback?: string) => t(`billing.planName.${plan}`, { defaultValue: fallback ?? plan });
}

export function PlanBadge({ plan }: { plan: StorePlan | string }) {
  const name = usePlanName();
  return (
    <Badge tone={plan === 'premium' ? 'accent' : plan === 'pro' ? 'primary' : 'neutral'} size="sm">
      {name(plan)}
    </Badge>
  );
}

import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react';
import { planRank, type OnboardingInput, type StorePlan } from '@souqly/shared';
import { usePublicPlans } from '@/api/billing';
import { PlanCard } from '@/components/billing/PlanCard';
import { Alert, Button, ErrorState, Skeleton } from '@/components/ui';

/** Wizard step: choose Free / Pro / Premium (from `GET /plans`). Paid plans become an upgrade invoice after approval. */
export function StepPlan() {
  const { t } = useTranslation();
  const { watch, setValue } = useFormContext<OnboardingInput>();
  const q = usePublicPlans();
  const chosen: StorePlan = watch('plan') ?? 'free';

  if (q.error) return <ErrorState compact error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) {
    return (
      <div className="grid gap-3 md:grid-cols-3" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-96" />
        ))}
      </div>
    );
  }
  const plans = [...q.data.plans].sort((a, b) => planRank(a.id) - planRank(b.id));
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-3" role="radiogroup" aria-label={t('billing.onboarding.choose')}>
        {plans.map((p) => (
          <PlanCard
            key={p.id}
            plan={p}
            commissionBps={q.data.commissionBps}
            selected={chosen === p.id}
            action={
              <Button
                type="button"
                block
                role="radio"
                aria-checked={chosen === p.id}
                variant={chosen === p.id ? 'primary' : 'outline'}
                onClick={() => setValue('plan', p.id, { shouldDirty: true })}
              >
                {chosen === p.id ? t('billing.onboarding.selected') : t('billing.onboarding.select', { plan: t(`billing.planName.${p.id}`, { defaultValue: p.name }) })}
              </Button>
            }
          />
        ))}
      </div>
      <Alert tone="info" title={t('billing.onboarding.howTitle')}>
        <ul className="grid list-disc gap-1 ps-5">
          <li>{t('billing.onboarding.commission', { pct: q.data.commissionBps / 100 })}</li>
          <li>{chosen === 'free' ? t('billing.onboarding.freeNote') : t('billing.onboarding.paidNote')}</li>
          <li>{t('billing.onboarding.changeLater')}</li>
        </ul>
      </Alert>
      <p className="flex items-start gap-2 text-xs text-fg-muted">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        {t('billing.onboarding.monthly')}
      </p>
    </div>
  );
}

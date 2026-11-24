import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Minus } from 'lucide-react';
import { PLAN_FEATURES, type PlanDefinition } from '@souqly/shared';
import { Badge, Card } from '@/components/ui';
import { useLang } from '@/lib/catalog';
import { cn } from '@/lib/cn';
import { formatNumber, money } from '@/lib/format';
import { usePlanName } from './BillingBadge';

/** One plan in the comparison grid: price, limits, features and the flat commission (all from the API). */
export function PlanCard({
  plan,
  commissionBps,
  current,
  selected,
  badge,
  action,
}: {
  plan: PlanDefinition;
  commissionBps: number;
  current?: boolean;
  selected?: boolean;
  badge?: ReactNode;
  action?: ReactNode;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const name = usePlanName();
  const limit = (n: number | null) => (n === null ? t('billing.plans.unlimited') : formatNumber(n, lang));
  return (
    <Card
      className={cn(
        'relative flex flex-col p-5',
        (current || selected) && 'border-primary ring-2 ring-primary/30',
        plan.id === 'premium' && !current && !selected && 'border-accent/60',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-lg font-extrabold text-fg">{name(plan.id, plan.name)}</h3>
        {current ? <Badge tone="primary" size="sm">{t('billing.plans.current')}</Badge> : badge}
      </div>
      <p className="mt-2 flex items-baseline gap-1">
        <span className="text-3xl font-extrabold tracking-tight text-fg" dir="ltr">
          {money(plan.priceMinor)}
        </span>
        <span className="text-sm text-fg-muted">{t('billing.plans.perMonth')}</span>
      </p>
      <p className="mt-1 text-xs font-semibold text-sale">{t('billing.plans.commissionLine', { pct: commissionBps / 100 })}</p>

      <ul className="mt-4 grid gap-1.5 border-t border-border pt-4 text-sm">
        <li className="flex justify-between gap-2">
          <span className="text-fg-muted">{t('billing.limits.products')}</span>
          <span className="font-semibold text-fg">{limit(plan.limits.products)}</span>
        </li>
        <li className="flex justify-between gap-2">
          <span className="text-fg-muted">{t('billing.limits.staff')}</span>
          <span className="font-semibold text-fg">{limit(plan.limits.staff)}</span>
        </li>
        <li className="flex justify-between gap-2">
          <span className="text-fg-muted">{t('billing.limits.storeSections')}</span>
          <span className="font-semibold text-fg">{limit(plan.limits.storeSections)}</span>
        </li>
        <li className="flex justify-between gap-2">
          <span className="text-fg-muted">{t('billing.limits.layouts')}</span>
          <span className="font-semibold text-fg">{formatNumber(plan.layouts.length, lang)}</span>
        </li>
      </ul>

      <ul className="mt-4 grid flex-1 gap-1.5 text-sm">
        {PLAN_FEATURES.map((f) => {
          const on = plan.features[f];
          return (
            <li key={f} className={cn('flex items-center gap-2', on ? 'text-fg' : 'text-fg-subtle')}>
              {on ? <Check className="size-4 shrink-0 text-success" aria-hidden /> : <Minus className="size-4 shrink-0" aria-hidden />}
              <span className={cn(!on && 'line-through decoration-fg-subtle/50')}>{t(`billing.features.${f}`)}</span>
              <span className="sr-only">{on ? t('billing.plans.included') : t('billing.plans.notIncluded')}</span>
            </li>
          );
        })}
      </ul>
      {action && <div className="mt-5">{action}</div>}
    </Card>
  );
}

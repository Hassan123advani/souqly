import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Info } from 'lucide-react';
import { PERMISSIONS, PLAN_FEATURES, planRank, type PlanDefinition } from '@souqly/shared';
import { useBillingPlans, useBillingSummary, useCancelScheduledChange, useChangePlan, type PlanUsage } from '@/api/billing';
import { getErrorMessage } from '@/api/client';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { usePlanName } from '@/components/billing/BillingBadge';
import { PlanCard } from '@/components/billing/PlanCard';
import { useCan } from '@/components/seller/usePermissions';
import { Alert, Badge, Button, Card, CardBody, CardHeader, ErrorState, Skeleton } from '@/components/ui';
import { useLang } from '@/lib/catalog';
import { cn } from '@/lib/cn';
import { formatDate, formatNumber, money } from '@/lib/format';

type Pending = { plan: PlanDefinition; direction: 'up' | 'down' };

export default function BillingPlansPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const planName = usePlanName();
  const can = useCan();
  const manage = can(PERMISSIONS.STORE_FINANCE_MANAGE);
  const plansQ = useBillingPlans();
  const summaryQ = useBillingSummary();
  const change = useChangePlan();
  const cancel = useCancelScheduledChange();
  const [pending, setPending] = useState<Pending | null>(null);

  const error = plansQ.error ?? summaryQ.error;
  if (error) {
    return (
      <Card>
        <ErrorState error={error} onRetry={() => (void plansQ.refetch(), void summaryQ.refetch())} />
      </Card>
    );
  }
  if (!plansQ.data || !summaryQ.data) {
    return (
      <div className="grid gap-4 md:grid-cols-3" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[30rem]" />
        ))}
      </div>
    );
  }

  const { plans, usage, commissionBps } = plansQ.data;
  const current = plansQ.data.current;
  const sub = summaryQ.data.subscription;
  const graceDays = summaryQ.data.graceDays;
  const currentDef = plans.find((p) => p.id === current) ?? plans[0]!;
  const sorted = [...plans].sort((a, b) => planRank(a.id) - planRank(b.id));
  const fail = (e: unknown) => toast.error(getErrorMessage(e));

  function confirm() {
    if (!pending) return;
    change.mutate(
      { plan: pending.plan.id },
      {
        onSuccess: (r) => {
          setPending(null);
          if (r.effective === 'now') toast.success(t('billing.plans.activated', { plan: planName(pending.plan.id) }));
          else if (r.effective === 'period_end') toast.success(t('billing.plans.scheduledToast', { date: formatDate(r.subscription.currentPeriodEnd, lang) }));
          else if (r.invoice) {
            toast.success(t('billing.plans.invoiceCreated', { number: r.invoice.number }));
            navigate(`/seller/billing/invoices/${r.invoice.id}`);
          }
        },
        onError: fail,
      },
    );
  }
  const undo = () => cancel.mutate(undefined, { onSuccess: () => toast.success(t('billing.plans.changeCancelled')), onError: fail });

  function actionFor(p: PlanDefinition) {
    if (p.id === current) return null;
    if (sub.pendingUpgrade?.plan === p.id) {
      return (
        <div className="grid gap-2">
          <Button block to={`/seller/billing/invoices/${sub.pendingUpgrade.invoiceId}`}>
            {t('billing.invoice.payNow')}
          </Button>
          {manage && (
            <Button block variant="ghost" size="sm" loading={cancel.isPending} onClick={undo}>
              {t('billing.plans.cancelUpgrade')}
            </Button>
          )}
        </div>
      );
    }
    if (sub.scheduledChange?.plan === p.id) {
      return (
        <div className="grid gap-2">
          <p className="text-center text-xs font-semibold text-fg-muted">{t('billing.plans.startsOn', { date: formatDate(sub.scheduledChange.effectiveAt, lang) })}</p>
          {manage && (
            <Button block variant="outline" loading={cancel.isPending} onClick={undo}>
              {t('billing.plans.keepPlan')}
            </Button>
          )}
        </div>
      );
    }
    if (!manage) return null;
    const up = planRank(p.id) > planRank(current);
    return (
      <Button block variant={up ? 'primary' : 'outline'} leftIcon={up ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />} onClick={() => setPending({ plan: p, direction: up ? 'up' : 'down' })}>
        {up ? t('billing.plans.upgradeTo', { plan: planName(p.id, p.name) }) : p.id === 'free' ? t('billing.plans.cancelSubscription') : t('billing.plans.downgradeTo', { plan: planName(p.id, p.name) })}
      </Button>
    );
  }

  return (
    <div className="grid gap-5">
      {!manage && (
        <Alert tone="info" title={t('billing.plans.ownerOnly')}>
          {t('billing.plans.ownerOnlyBody')}
        </Alert>
      )}
      {sub.scheduledChange && (
        <Alert tone="info" title={t(`billing.plans.scheduled.${sub.scheduledChange.kind}`, { plan: planName(sub.scheduledChange.plan), date: formatDate(sub.scheduledChange.effectiveAt, lang) })}>
          {t('billing.plans.scheduledBody')}
        </Alert>
      )}
      <UsageCard usage={usage} plan={currentDef} />
      <div className="grid gap-4 md:grid-cols-3">
        {sorted.map((p) => (
          <PlanCard
            key={p.id}
            plan={p}
            commissionBps={commissionBps}
            current={p.id === current}
            badge={sub.scheduledChange?.plan === p.id || sub.pendingUpgrade?.plan === p.id ? <Badge tone="info" size="sm">{t('billing.plans.pending')}</Badge> : undefined}
            action={actionFor(p)}
          />
        ))}
      </div>
      <p className="flex items-start gap-2 text-xs text-fg-muted">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        {t('billing.plans.footnote', { pct: commissionBps / 100 })}
      </p>

      {pending && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setPending(null)}
          title={pending.direction === 'up' ? t('billing.plans.confirmUpTitle', { plan: planName(pending.plan.id, pending.plan.name) }) : pending.plan.id === 'free' ? t('billing.plans.confirmCancelTitle') : t('billing.plans.confirmDownTitle', { plan: planName(pending.plan.id, pending.plan.name) })}
          confirmLabel={pending.direction === 'up' ? t('billing.plans.createInvoice') : t('billing.plans.scheduleChange')}
          tone={pending.direction === 'up' ? 'primary' : 'danger'}
          loading={change.isPending}
          onConfirm={confirm}
        >
          <ul className="grid list-disc gap-2 ps-5 text-sm text-fg-muted">
            {pending.direction === 'up' ? (
              <>
                <li>{t('billing.plans.upInvoice', { price: money(pending.plan.priceMinor), days: graceDays })}</li>
                <li>{t('billing.plans.upCredit')}</li>
                <li>{t('billing.plans.upActivates')}</li>
              </>
            ) : (
              <>
                <li>{t('billing.plans.downWhen', { date: formatDate(sub.currentPeriodEnd, lang) })}</li>
                <li>{t('billing.plans.downNothingDeleted')}</li>
                <DowngradeLosses from={currentDef} to={pending.plan} usage={usage} />
              </>
            )}
            <li className="font-semibold text-fg">{t('billing.plans.duesCarried')}</li>
          </ul>
        </ConfirmDialog>
      )}
    </div>
  );
}

/** Features and limits the seller loses on a downgrade (computed from the two plan definitions). */
function DowngradeLosses({ from, to, usage }: { from: PlanDefinition; to: PlanDefinition; usage: PlanUsage }) {
  const { t } = useTranslation();
  const lost = PLAN_FEATURES.filter((f) => from.features[f] && !to.features[f]);
  const over: string[] = [];
  if (to.limits.products !== null && usage.products > to.limits.products) over.push(t('billing.plans.overProducts', { used: usage.products, max: to.limits.products }));
  if (usage.staff > to.limits.staff) over.push(t('billing.plans.overStaff', { used: usage.staff, max: to.limits.staff }));
  if (usage.sections > to.limits.storeSections) over.push(t('billing.plans.overSections', { used: usage.sections, max: to.limits.storeSections }));
  return (
    <>
      {lost.length > 0 && <li>{t('billing.plans.losesFeatures', { list: lost.map((f) => t(`billing.features.${f}`)).join(', ') })}</li>}
      {over.map((o) => (
        <li key={o} className="text-warning">
          {o}
        </li>
      ))}
    </>
  );
}

function UsageCard({ usage, plan }: { usage: PlanUsage; plan: PlanDefinition }) {
  const { t } = useTranslation();
  const lang = useLang();
  const rows: { key: string; used: number; max: number | null }[] = [
    { key: 'products', used: usage.products, max: plan.limits.products },
    { key: 'liveProducts', used: usage.liveProducts, max: plan.limits.products },
    { key: 'staff', used: usage.staff, max: plan.limits.staff },
    { key: 'storeSections', used: usage.sections, max: plan.limits.storeSections },
  ];
  return (
    <Card>
      <CardHeader title={t('billing.plans.usage')} description={t('billing.plans.usageHint')} />
      <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((r) => {
          const pct = r.max === null ? 0 : r.max === 0 ? 100 : Math.min(100, Math.round((r.used / r.max) * 100));
          const tone = r.max !== null && r.used >= r.max ? 'bg-danger' : pct >= 80 ? 'bg-warning' : 'bg-primary';
          return (
            <div key={r.key}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-semibold text-fg">{t(`billing.limits.${r.key}`)}</span>
                <span className="tabular text-fg-muted" dir="ltr">
                  {formatNumber(r.used, lang)} / {r.max === null ? '∞' : formatNumber(r.max, lang)}
                </span>
              </div>
              <div
                className="mt-1.5 h-2 overflow-hidden rounded-pill bg-surface-2"
                role="progressbar"
                aria-label={t(`billing.limits.${r.key}`)}
                aria-valuemin={0}
                aria-valuemax={r.max ?? undefined}
                aria-valuenow={r.used}
              >
                <div className={cn('h-full rounded-pill', tone)} style={{ width: `${r.max === null ? 4 : Math.max(pct, 2)}%` }} />
              </div>
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}

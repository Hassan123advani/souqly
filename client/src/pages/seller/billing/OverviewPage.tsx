import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Banknote, CalendarClock, Coins, HandCoins, PiggyBank, ReceiptText, ShoppingBag, Truck, Wallet } from 'lucide-react';
import { PERMISSIONS } from '@souqly/shared';
import { useBillingSummary, useCancelScheduledChange, type BillingSummary } from '@/api/billing';
import { getErrorMessage } from '@/api/client';
import { KpiCard } from '@/components/admin/KpiCard';
import { BillingBadge, PlanBadge, usePlanName } from '@/components/billing/BillingBadge';
import { useCan } from '@/components/seller/usePermissions';
import { Alert, Button, Card, CardHeader, ErrorState, Skeleton } from '@/components/ui';
import { useLang } from '@/lib/catalog';
import { formatDate, money } from '@/lib/format';

export default function BillingOverviewPage() {
  const { t } = useTranslation();
  const q = useBillingSummary();
  if (q.error) {
    return (
      <Card>
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      </Card>
    );
  }
  if (!q.data) return <OverviewSkeleton />;
  const s = q.data;
  const pct = s.commissionBps / 100;
  return (
    <div className="grid gap-5">
      <PlanChangeAlerts summary={s} />
      <div className="grid gap-4 lg:grid-cols-2">
        <SubscriptionCard summary={s} />
        <OutstandingCard summary={s} />
      </div>
      <section aria-labelledby="billing-totals">
        <h2 id="billing-totals" className="mb-3 text-base font-bold text-fg">
          {t('billing.overview.totals')}
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label={t('billing.overview.grossSales')} icon={<ShoppingBag />} value={money(s.totals.grossSales)} sub={t('billing.overview.deliveredOnly')} />
          <KpiCard label={t('billing.overview.codSales')} icon={<Truck />} value={money(s.totals.codSales)} />
          <KpiCard label={t('billing.overview.onlineSales')} icon={<Banknote />} value={money(s.totals.onlineSales)} />
          <KpiCard label={t('billing.overview.totalCommission', { pct })} icon={<Coins />} value={money(s.totals.totalCommission)} sub={t('billing.overview.onBase', { amount: money(s.totals.commissionBase) })} />
          <KpiCard label={t('billing.overview.paidCommission')} icon={<ReceiptText />} value={money(s.totals.paidCommission)} />
          <KpiCard label={t('billing.overview.unpaidCod')} icon={<HandCoins />} value={money(s.totals.unpaidCodCommission)} />
          <KpiCard label={t('billing.overview.available')} icon={<Wallet />} value={money(s.totals.availableBalance)} sub={t('billing.overview.onHold', { amount: money(s.totals.onHold) })} />
          <KpiCard label={t('billing.overview.pendingPayouts')} icon={<PiggyBank />} value={money(s.totals.pendingPayouts)} />
        </div>
      </section>
      <EstimateCard summary={s} />
    </div>
  );
}

function PlanChangeAlerts({ summary }: { summary: BillingSummary }) {
  const { t } = useTranslation();
  const lang = useLang();
  const planName = usePlanName();
  const can = useCan();
  const manage = can(PERMISSIONS.STORE_FINANCE_MANAGE);
  const cancel = useCancelScheduledChange();
  const { pendingUpgrade, scheduledChange } = summary.subscription;
  const undo = () => cancel.mutate(undefined, { onSuccess: () => toast.success(t('billing.plans.changeCancelled')), onError: (e) => toast.error(getErrorMessage(e)) });
  return (
    <>
      {pendingUpgrade && (
        <Alert
          tone="warning"
          title={t('billing.plans.pendingUpgradeTitle', { plan: planName(pendingUpgrade.plan) })}
          action={
            <Button to={`/seller/billing/invoices/${pendingUpgrade.invoiceId}`} size="sm" className="shrink-0 self-center">
              {t('billing.invoice.payNow')}
            </Button>
          }
        >
          {t('billing.plans.pendingUpgradeBody', { amount: money(pendingUpgrade.amountDue), date: formatDate(pendingUpgrade.dueDate, lang), number: pendingUpgrade.invoiceNumber })}
        </Alert>
      )}
      {scheduledChange && (
        <Alert
          tone="info"
          title={t(`billing.plans.scheduled.${scheduledChange.kind}`, { plan: planName(scheduledChange.plan), date: formatDate(scheduledChange.effectiveAt, lang) })}
          action={
            manage && (
              <Button size="sm" variant="outline" className="shrink-0 self-center" loading={cancel.isPending} onClick={undo}>
                {t('billing.plans.keepPlan')}
              </Button>
            )
          }
        >
          {t('billing.plans.scheduledBody')}
        </Alert>
      )}
    </>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 py-2 text-sm last:border-0">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="text-end font-semibold text-fg">{children}</dd>
    </div>
  );
}

function SubscriptionCard({ summary }: { summary: BillingSummary }) {
  const { t } = useTranslation();
  const lang = useLang();
  const sub = summary.subscription;
  return (
    <Card>
      <CardHeader
        title={t('billing.overview.subscription')}
        action={
          <Button to="/seller/billing/plans" size="sm" variant="outline">
            {t('billing.overview.changePlan')}
          </Button>
        }
      />
      <dl className="px-5 py-3 sm:px-6">
        <Fact label={t('billing.overview.currentPlan')}>
          <PlanBadge plan={sub.plan} /> <span className="ms-1 text-fg-muted" dir="ltr">{money(summary.plan.priceMinor)}</span>
        </Fact>
        <Fact label={t('billing.overview.storeStatus')}>
          <BillingBadge status={sub.billingStatus} />
        </Fact>
        <Fact label={t('billing.overview.period')}>{`${formatDate(sub.currentPeriodStart, lang)} – ${formatDate(sub.currentPeriodEnd, lang)}`}</Fact>
        <Fact label={sub.scheduledChange ? t('billing.overview.changesOn') : t('billing.overview.renews')}>{formatDate(sub.currentPeriodEnd, lang)}</Fact>
        <Fact label={t('billing.overview.commissionRate')}>{`${summary.commissionBps / 100}%`}</Fact>
      </dl>
    </Card>
  );
}

function OutstandingCard({ summary }: { summary: BillingSummary }) {
  const { t } = useTranslation();
  const lang = useLang();
  const o = summary.outstanding;
  return (
    <Card>
      <CardHeader
        title={t('billing.overview.outstanding')}
        description={t('billing.overview.graceDays', { n: summary.graceDays })}
        action={
          o.amountDue > 0 && (
            <Button to={o.overdue > 0 ? '/seller/billing/invoices?status=overdue' : '/seller/billing/invoices?status=open'} size="sm" variant={o.overdue > 0 ? 'danger' : 'primary'}>
              {t('billing.overview.payDues')}
            </Button>
          )
        }
      />
      <dl className="px-5 py-3 sm:px-6">
        <Fact label={t('billing.overview.amountDue')}>
          <span className="text-lg font-extrabold" dir="ltr">
            {money(o.amountDue)}
          </span>
        </Fact>
        <Fact label={t('billing.overview.overdue')}>
          <span className={o.overdue > 0 ? 'text-danger' : undefined} dir="ltr">
            {money(o.overdue)}
          </span>
        </Fact>
        <Fact label={t('billing.overview.openInvoices')}>{o.invoices}</Fact>
        <Fact label={t('billing.overview.nextDue')}>{o.nextDueDate ? formatDate(o.nextDueDate, lang) : '—'}</Fact>
      </dl>
    </Card>
  );
}

function EstimateCard({ summary }: { summary: BillingSummary }) {
  const { t } = useTranslation();
  const lang = useLang();
  const planName = usePlanName();
  const e = summary.nextInvoiceEstimate;
  return (
    <Card>
      <CardHeader
        title={t('billing.overview.estimate')}
        description={t('billing.overview.estimateHint', { date: formatDate(e.date, lang) })}
        action={<CalendarClock className="size-5 text-fg-muted" aria-hidden />}
      />
      <dl className="px-5 py-3 sm:px-6">
        <Fact label={t('billing.overview.estimateFee', { plan: planName(e.plan) })}>
          <span dir="ltr">{money(e.fee)}</span>
        </Fact>
        <Fact label={t('billing.overview.estimateCommission')}>
          <span dir="ltr">{money(e.commission)}</span>
        </Fact>
        {e.balanceRecovery > 0 && (
          <Fact label={t('billing.lineType.balance_recovery')}>
            <span dir="ltr">{money(e.balanceRecovery)}</span>
          </Fact>
        )}
        <Fact label={t('billing.overview.estimateTotal')}>
          <span className="text-lg font-extrabold" dir="ltr">
            {money(e.total)}
          </span>
        </Fact>
      </dl>
    </Card>
  );
}

function OverviewSkeleton() {
  return (
    <div className="grid gap-5" aria-busy="true">
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-60" />
        <Skeleton className="h-60" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-48" />
    </div>
  );
}

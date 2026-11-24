import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Ban, CalendarPlus, Coins, ExternalLink, FileText, HandCoins, Layers, PlayCircle, ShoppingBag, Truck, Wallet } from 'lucide-react';
import { PERMISSIONS } from '@souqly/shared';
import { useAdminGet } from '@/api/admin';
import type { AdminBillingStoreDetail, BillingAdjustment, Invoice } from '@/api/billing';
import { DataTable, type Column } from '@/components/admin/DataTable';
import { KpiCard } from '@/components/admin/KpiCard';
import { PageHeader } from '@/components/admin/PageHeader';
import { useAdminCan } from '@/components/admin/useAdminCan';
import { StoreBillingActionDialog, WaiveDialog, type StoreAction } from '@/components/billing/AdminBillingDialogs';
import { BillingBadge, PlanBadge, usePlanName } from '@/components/billing/BillingBadge';
import { CommissionTable, PaymentList } from '@/components/billing/InvoiceView';
import { Alert, Button, Card, CardHeader, ErrorState, Skeleton } from '@/components/ui';
import { useLang } from '@/lib/catalog';
import { formatDate, formatDateTime, money } from '@/lib/format';

export default function BillingStoreDetailPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const planName = usePlanName();
  const { storeId } = useParams();
  const can = useAdminCan();
  const manage = can(PERMISSIONS.ADMIN_BILLING_MANAGE);
  const q = useAdminGet<AdminBillingStoreDetail>(`billing/stores/${storeId}`);
  const [action, setAction] = useState<StoreAction | null>(null);
  const [waive, setWaive] = useState<Invoice | null>(null);
  const d = q.data;
  const crumbs = [{ label: t('admin.nav.finance') }, { label: t('billing.admin.nav.stores'), to: '/admin/billing/stores' }];

  if (q.error) {
    return (
      <>
        <PageHeader title={t('billing.admin.nav.stores')} crumbs={crumbs} />
        <Card>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </Card>
      </>
    );
  }
  if (!d) {
    return (
      <div className="grid gap-4" aria-busy="true">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-40" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    );
  }

  const sub = d.subscription;
  const invoiceColumns: Column<Invoice>[] = [
    {
      key: 'number',
      header: t('billing.invoice.number'),
      cell: (i) => (
        <Link to={`/admin/billing/invoices/${i.id}`} className="latin font-semibold text-primary-700 hover:underline">
          {i.number}
        </Link>
      ),
    },
    { key: 'kind', header: t('billing.invoice.kind'), cell: (i) => t(`billing.kind.${i.kind}`) },
    { key: 'issued', header: t('billing.invoice.issued'), cell: (i) => <span className="whitespace-nowrap text-fg-muted">{formatDate(i.issuedAt, lang)}</span> },
    { key: 'total', header: t('billing.invoice.total'), align: 'end', cell: (i) => <span className="tabular" dir="ltr">{money(i.total)}</span> },
    { key: 'due', header: t('billing.invoice.amountDue'), align: 'end', cell: (i) => <span className="tabular font-bold" dir="ltr">{money(i.amountDue)}</span> },
    { key: 'status', header: t('billing.invoice.status'), cell: (i) => <BillingBadge status={i.status} /> },
    {
      key: 'a',
      header: '',
      align: 'end',
      cell: (i) =>
        manage &&
        (i.status === 'open' || i.status === 'overdue') &&
        i.amountDue > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setWaive(i)}>
            {t('billing.admin.waive.confirm')}
          </Button>
        ),
    },
  ];
  const adjColumns: Column<BillingAdjustment>[] = [
    { key: 'date', header: t('billing.payments.date'), cell: (a) => <span className="whitespace-nowrap text-fg-muted">{formatDateTime(a.createdAt, lang)}</span> },
    { key: 'type', header: t('billing.admin.adjustments.type'), cell: (a) => t(`billing.adjustmentType.${a.type}`) },
    { key: 'amount', header: t('billing.invoice.amount'), align: 'end', cell: (a) => <span className="tabular" dir="ltr">{a.amount ? money(a.amount) : '—'}</span> },
    { key: 'reason', header: t('billing.admin.reason'), cell: (a) => <span className="text-fg-muted">{a.reason}</span> },
  ];

  return (
    <>
      <PageHeader
        title={d.store.name}
        description={<span className="latin">/{d.store.slug}</span>}
        crumbs={crumbs}
        actions={
          <Button to={`/admin/stores/${d.store.id}`} size="sm" variant="outline" rightIcon={<ExternalLink className="size-4" />}>
            {t('billing.admin.stores.storeProfile')}
          </Button>
        }
      />
      {sub.billingStatus === 'suspended' && sub.suspension && (
        <Alert tone="danger" className="mb-4" title={t('billing.admin.stores.suspendedTitle', { reason: t(`billing.suspensionReason.${sub.suspension.reason}`) })}>
          {formatDateTime(sub.suspension.at, lang)}
          {sub.suspension.note ? ` · ${sub.suspension.note}` : ''}
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
        <Card>
          <CardHeader title={t('billing.overview.subscription')} />
          <dl className="grid gap-x-6 px-5 py-3 text-sm sm:grid-cols-2">
            <Fact label={t('billing.overview.currentPlan')}>
              <PlanBadge plan={sub.plan} />
            </Fact>
            <Fact label={t('billing.overview.storeStatus')}>
              <BillingBadge status={sub.billingStatus} />
            </Fact>
            <Fact label={t('billing.overview.period')}>{`${formatDate(sub.currentPeriodStart, lang)} – ${formatDate(sub.currentPeriodEnd, lang)}`}</Fact>
            <Fact label={t('billing.overview.outstanding')}>
              <span dir="ltr">{money(d.outstanding.amountDue)}</span> <span className="text-fg-muted">({d.outstanding.invoices})</span>
            </Fact>
            {sub.scheduledChange && <Fact label={t('billing.admin.stores.scheduledChange')}>{t(`billing.plans.scheduled.${sub.scheduledChange.kind}`, { plan: planName(sub.scheduledChange.plan), date: formatDate(sub.scheduledChange.effectiveAt, lang) })}</Fact>}
            {sub.pendingUpgrade && (
              <Fact label={t('billing.admin.stores.pendingUpgrade')}>
                <Link to={`/admin/billing/invoices/${sub.pendingUpgrade.invoiceId}`} className="text-primary-700 hover:underline">
                  {planName(sub.pendingUpgrade.plan)} · {money(sub.pendingUpgrade.amountDue)}
                </Link>
              </Fact>
            )}
          </dl>
        </Card>
        {manage && (
          <Card className="flex flex-col gap-2 p-4 lg:w-60">
            <p className="text-xs font-bold uppercase tracking-wide text-fg-muted">{t('billing.admin.actions.title')}</p>
            <Button variant="outline" size="sm" leftIcon={<Layers className="size-4" />} onClick={() => setAction('plan')}>
              {t('billing.admin.actions.plan')}
            </Button>
            <Button variant="outline" size="sm" leftIcon={<CalendarPlus className="size-4" />} onClick={() => setAction('extend')}>
              {t('billing.admin.actions.extend')}
            </Button>
            {sub.billingStatus === 'suspended' ? (
              <Button size="sm" leftIcon={<PlayCircle className="size-4" />} onClick={() => setAction('reactivate')}>
                {t('billing.admin.actions.reactivate')}
              </Button>
            ) : (
              <Button variant="danger" size="sm" leftIcon={<Ban className="size-4" />} onClick={() => setAction('suspend')}>
                {t('billing.admin.actions.suspend')}
              </Button>
            )}
          </Card>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label={t('billing.overview.grossSales')} icon={<ShoppingBag />} value={money(d.totals.grossSales)} />
        <KpiCard label={t('billing.overview.codSales')} icon={<Truck />} value={money(d.totals.codSales)} sub={t('billing.admin.stores.onlineSub', { amount: money(d.totals.onlineSales) })} />
        <KpiCard label={t('billing.admin.overview.commissionTotal')} icon={<Coins />} value={money(d.totals.totalCommission)} sub={t('billing.admin.stores.reversedSub', { amount: money(d.totals.reversed) })} />
        <KpiCard label={t('billing.overview.unpaidCod')} icon={<HandCoins />} value={money(d.totals.unpaidCodCommission)} sub={t('billing.admin.stores.paidSub', { amount: money(d.totals.paidCommission) })} />
        <KpiCard label={t('billing.overview.available')} icon={<Wallet />} value={money(d.totals.availableBalance)} sub={t('billing.overview.onHold', { amount: money(d.totals.onHold) })} />
        <KpiCard label={t('billing.overview.pendingPayouts')} icon={<Wallet />} value={money(d.totals.pendingPayouts)} sub={t('billing.admin.stores.paidOutSub', { amount: money(d.totals.paidOut) })} />
      </div>

      <Section title={t('billing.tabs.invoices')} more={`/admin/billing/invoices?storeId=${d.store.id}`}>
        <DataTable rows={d.invoices} columns={invoiceColumns} rowKey={(i) => i.id} empty={{ title: t('billing.invoices.empty'), icon: <FileText /> }} />
      </Section>
      <Section title={t('billing.tabs.payments')} more={`/admin/billing/payments?storeId=${d.store.id}&status=all`}>
        <PaymentList payments={d.payments} title={t('billing.admin.stores.latestPayments')} />
      </Section>
      <Section title={t('billing.tabs.commissions')} more={`/admin/billing/adjustments?tab=reversals&storeId=${d.store.id}`}>
        <CommissionTable entries={d.commissions} title={t('billing.admin.stores.latestCommissions')} orderHref={(e) => `/admin/orders/${e.orderId}`} invoiceHref={(e) => `/admin/billing/invoices/${e.invoiceId}`} />
      </Section>
      <Section title={t('billing.admin.nav.adjustments')} more={`/admin/billing/adjustments?tab=adjustments&storeId=${d.store.id}`}>
        <DataTable rows={d.adjustments} columns={adjColumns} rowKey={(a) => a.id} empty={{ title: t('billing.admin.adjustments.empty') }} />
      </Section>

      {action && <StoreBillingActionDialog storeId={d.store.id} action={action} currentPlan={sub.plan} onClose={() => setAction(null)} />}
      {waive && <WaiveDialog invoice={waive} onClose={() => setWaive(null)} />}
    </>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 py-2">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="text-end font-semibold text-fg">{children}</dd>
    </div>
  );
}

function Section({ title, more, children }: { title: string; more: string; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-fg">{title}</h2>
        <Link to={more} className="text-sm font-semibold text-primary-700 hover:underline">
          {t('billing.admin.stores.viewAll')}
        </Link>
      </div>
      {children}
    </section>
  );
}

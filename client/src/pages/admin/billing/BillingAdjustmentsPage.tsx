import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Receipt, ScrollText, X } from 'lucide-react';
import { BILLING_ADJUSTMENT_TYPES, COMMISSION_CHANNELS } from '@souqly/shared';
import { useAdminList } from '@/api/admin';
import type { BillingAdjustment, CommissionEntry } from '@/api/billing';
import { DataTable, FilterSelect, type Column } from '@/components/admin/DataTable';
import { FilterBar } from '@/components/admin/FilterBar';
import { PageHeader } from '@/components/admin/PageHeader';
import { StatusTabs } from '@/components/admin/StatusTabs';
import { useUrlFilters } from '@/components/admin/useUrlFilters';
import { BillingBadge } from '@/components/billing/BillingBadge';
import { Button } from '@/components/ui';
import { useLang } from '@/lib/catalog';
import { formatDate, formatDateTime, money } from '@/lib/format';

const storeLink = (id: string, label: string) => (
  <Link to={`/admin/billing/stores/${id}`} className="font-semibold text-fg hover:text-primary-700">
    {label}
  </Link>
);

/** Refund commission reversals (seller-borne refunds) and every audited billing adjustment. */
export default function BillingAdjustmentsPage() {
  const { t } = useTranslation();
  const [f, setF] = useUrlFilters(['tab', 'storeId', 'type', 'channel'] as const);
  const tab = f.tab === 'adjustments' ? 'adjustments' : 'reversals';
  return (
    <>
      <PageHeader title={t('billing.admin.nav.adjustments')} description={t('billing.admin.adjustments.subtitle')} crumbs={[{ label: t('admin.nav.finance') }, { label: t('billing.admin.nav.overview'), to: '/admin/billing' }]} />
      <StatusTabs
        value={tab}
        onChange={(v) => setF({ tab: v === 'reversals' ? '' : v, type: '', channel: '' })}
        tabs={[
          { value: 'reversals', label: t('billing.admin.adjustments.reversals') },
          { value: 'adjustments', label: t('billing.admin.adjustments.adjustments') },
        ]}
      />
      <FilterBar>
        {tab === 'reversals' ? (
          <FilterSelect label={t('billing.commissions.channel')} value={f.channel} onChange={(v) => setF({ channel: v })} allLabel={t('billing.commissions.allChannels')} options={COMMISSION_CHANNELS.map((c) => ({ value: c, label: t(`billing.channel.${c}`) }))} />
        ) : (
          <FilterSelect label={t('billing.admin.adjustments.type')} value={f.type} onChange={(v) => setF({ type: v })} allLabel={t('billing.admin.adjustments.allTypes')} options={BILLING_ADJUSTMENT_TYPES.map((a) => ({ value: a, label: t(`billing.adjustmentType.${a}`) }))} />
        )}
        {f.storeId && (
          <Button size="sm" variant="ghost" rightIcon={<X className="size-4" />} onClick={() => setF({ storeId: '' })}>
            {t('billing.admin.clearStore')}
          </Button>
        )}
      </FilterBar>
      {tab === 'reversals' ? <Reversals storeId={f.storeId} channel={f.channel} /> : <Adjustments storeId={f.storeId} type={f.type} />}
    </>
  );
}

function Reversals({ storeId, channel }: { storeId: string; channel: string }) {
  const { t } = useTranslation();
  const lang = useLang();
  const list = useAdminList<CommissionEntry>('billing/commissions', { kind: 'reversal', storeId, channel });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  const columns: Column<CommissionEntry>[] = [
    { key: 'date', header: t('billing.commissions.date'), cell: (e) => <span className="whitespace-nowrap text-fg-muted">{formatDate(e.at, lang)}</span> },
    { key: 'store', header: t('admin.stores.store'), cell: (e) => (e.storeId ? storeLink(e.storeId, t('billing.admin.storeN', { id: e.storeId.slice(-6) })) : '—') },
    {
      key: 'order',
      header: t('billing.commissions.order'),
      cell: (e) => (
        <div>
          <Link to={`/admin/orders/${e.orderId}`} className="latin font-semibold text-primary-700 hover:underline">
            {e.orderNumber}
          </Link>
          <p className="text-xs text-fg-muted">{t(`billing.reason.${e.reason}`)}</p>
        </div>
      ),
    },
    { key: 'channel', header: t('billing.commissions.channel'), cell: (e) => t(`billing.channel.${e.channel}`) },
    { key: 'amount', header: t('billing.commissions.amount'), align: 'end', cell: (e) => <span className="tabular font-bold text-success" dir="ltr">{money(e.amount)}</span> },
    { key: 'status', header: t('billing.commissions.status'), cell: (e) => <BillingBadge status={e.status} /> },
    {
      key: 'invoice',
      header: t('billing.commissions.invoice'),
      cell: (e) =>
        e.invoiceId ? (
          <Link to={`/admin/billing/invoices/${e.invoiceId}`} className="latin text-xs font-semibold text-primary-700 hover:underline">
            {e.invoiceNumber ?? e.invoiceId.slice(-6)}
          </Link>
        ) : (
          '—'
        ),
    },
  ];
  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(e) => e.id}
      isLoading={list.isLoading}
      error={list.error}
      onRetry={() => void list.refetch()}
      hasMore={list.hasNextPage}
      loadingMore={list.isFetchingNextPage}
      onLoadMore={() => void list.fetchNextPage()}
      empty={{ title: t('billing.admin.adjustments.noReversals'), icon: <Receipt /> }}
    />
  );
}

function Adjustments({ storeId, type }: { storeId: string; type: string }) {
  const { t } = useTranslation();
  const lang = useLang();
  const list = useAdminList<BillingAdjustment>('billing/adjustments', { storeId, type });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  const columns: Column<BillingAdjustment>[] = [
    { key: 'date', header: t('billing.payments.date'), cell: (a) => <span className="whitespace-nowrap text-fg-muted">{formatDateTime(a.createdAt, lang)}</span> },
    { key: 'store', header: t('admin.stores.store'), cell: (a) => storeLink(a.storeId, t('billing.admin.storeN', { id: a.storeId.slice(-6) })) },
    { key: 'type', header: t('billing.admin.adjustments.type'), cell: (a) => t(`billing.adjustmentType.${a.type}`) },
    { key: 'amount', header: t('billing.invoice.amount'), align: 'end', cell: (a) => <span className="tabular" dir="ltr">{a.amount ? money(a.amount) : '—'}</span> },
    {
      key: 'invoice',
      header: t('billing.commissions.invoice'),
      cell: (a) =>
        a.invoiceId ? (
          <Link to={`/admin/billing/invoices/${a.invoiceId}`} className="text-xs font-semibold text-primary-700 hover:underline">
            {typeof a.meta.number === 'string' ? a.meta.number : a.invoiceId.slice(-6)}
          </Link>
        ) : (
          '—'
        ),
    },
    { key: 'reason', header: t('billing.admin.reason'), cell: (a) => <span className="text-fg-muted">{a.reason}</span> },
  ];
  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(a) => a.id}
      isLoading={list.isLoading}
      error={list.error}
      onRetry={() => void list.refetch()}
      hasMore={list.hasNextPage}
      loadingMore={list.isFetchingNextPage}
      onLoadMore={() => void list.fetchNextPage()}
      empty={{ title: t('billing.admin.adjustments.empty'), icon: <ScrollText /> }}
    />
  );
}

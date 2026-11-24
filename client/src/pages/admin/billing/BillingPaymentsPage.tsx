import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, ShieldCheck, X } from 'lucide-react';
import { BILLING_PAYMENT_METHODS, BILLING_PAYMENT_STATUSES, PERMISSIONS } from '@souqly/shared';
import { useAdminList } from '@/api/admin';
import type { InvoicePayment } from '@/api/billing';
import { DataTable, FilterSelect, type Column } from '@/components/admin/DataTable';
import { FilterBar } from '@/components/admin/FilterBar';
import { PageHeader } from '@/components/admin/PageHeader';
import { StatusTabs } from '@/components/admin/StatusTabs';
import { useAdminCan } from '@/components/admin/useAdminCan';
import { useUrlFilters } from '@/components/admin/useUrlFilters';
import { ReviewPaymentDialog } from '@/components/billing/AdminBillingDialogs';
import { BillingBadge } from '@/components/billing/BillingBadge';
import { Button } from '@/components/ui';
import { useLang } from '@/lib/catalog';
import { formatDateTime, money } from '@/lib/format';

/** Manual payment verification queue (and the full invoice payment history with other filters). */
export default function BillingPaymentsPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const can = useAdminCan();
  const manage = can(PERMISSIONS.ADMIN_BILLING_MANAGE);
  const [f, setF] = useUrlFilters(['status', 'method', 'storeId'] as const);
  const statusTab = f.status || 'pending';
  const status = statusTab === 'all' ? undefined : statusTab;
  const list = useAdminList<InvoicePayment>('billing/payments', { status, method: f.method, storeId: f.storeId });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  const [review, setReview] = useState<{ payment: InvoicePayment; kind: 'approve' | 'reject' } | null>(null);

  const columns: Column<InvoicePayment>[] = [
    {
      key: 'store',
      header: t('admin.stores.store'),
      cell: (p) =>
        p.store ? (
          <Link to={`/admin/billing/stores/${p.store.id}`} className="font-semibold text-fg hover:text-primary-700">
            {p.store.name || p.store.id.slice(-6)}
          </Link>
        ) : (
          '—'
        ),
    },
    {
      key: 'invoice',
      header: t('billing.commissions.invoice'),
      cell: (p) => (
        <Link to={`/admin/billing/invoices/${p.invoiceId}`} className="latin font-semibold text-primary-700 hover:underline">
          {p.invoiceNumber}
        </Link>
      ),
    },
    {
      key: 'method',
      header: t('billing.payments.method'),
      cell: (p) => (
        <span>
          {t(`billing.method.${p.method}`)}
          {p.channel && <span className="text-fg-muted"> · {t(`billing.channel.${p.channel}`)}</span>}
        </span>
      ),
    },
    {
      key: 'ref',
      header: t('billing.pay.reference'),
      cell: (p) => (
        <div>
          <span className="latin font-mono text-xs">{p.reference ?? p.gateway?.transactionId ?? '—'}</span>
          {p.proofUrl && (
            <a href={p.proofUrl} target="_blank" rel="noopener noreferrer" className="block text-xs font-semibold text-primary-700 hover:underline">
              {t('billing.payments.viewProof')}
            </a>
          )}
        </div>
      ),
    },
    { key: 'amount', header: t('billing.invoice.amount'), align: 'end', cell: (p) => <span className="tabular font-bold" dir="ltr">{money(p.amount)}</span> },
    { key: 'date', header: t('billing.payments.date'), cell: (p) => <span className="whitespace-nowrap text-fg-muted">{formatDateTime(p.createdAt, lang)}</span> },
    {
      key: 'status',
      header: t('billing.invoice.status'),
      cell: (p) => (
        <div>
          <BillingBadge status={p.status} />
          {(p.reviewNote ?? p.gateway?.failure) && <p className="mt-0.5 max-w-[14rem] text-xs text-fg-muted">{p.reviewNote ?? p.gateway?.failure}</p>}
        </div>
      ),
    },
    {
      key: 'a',
      header: '',
      align: 'end',
      cell: (p) =>
        manage &&
        p.method === 'manual' &&
        p.status === 'pending' && (
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="outline" leftIcon={<Check className="size-4" />} onClick={() => setReview({ payment: p, kind: 'approve' })}>
              {t('billing.admin.review.approve')}
            </Button>
            <Button size="sm" variant="ghost" leftIcon={<X className="size-4" />} onClick={() => setReview({ payment: p, kind: 'reject' })}>
              {t('billing.admin.review.reject')}
            </Button>
          </div>
        ),
    },
  ];

  return (
    <>
      <PageHeader title={t('billing.admin.nav.payments')} description={t('billing.admin.payments.subtitle')} crumbs={[{ label: t('admin.nav.finance') }, { label: t('billing.admin.nav.overview'), to: '/admin/billing' }]} />
      <StatusTabs
        value={statusTab}
        onChange={(v) => setF({ status: v === 'pending' ? '' : v })}
        tabs={[...BILLING_PAYMENT_STATUSES.map((s) => ({ value: s, label: t(`billing.status.${s}`) })), { value: 'all', label: t('billing.common.all') }]}
      />
      <FilterBar>
        <FilterSelect label={t('billing.payments.method')} value={f.method} onChange={(v) => setF({ method: v })} allLabel={t('billing.admin.payments.allMethods')} options={BILLING_PAYMENT_METHODS.map((m) => ({ value: m, label: t(`billing.method.${m}`) }))} />
        {f.storeId && (
          <Button size="sm" variant="ghost" rightIcon={<X className="size-4" />} onClick={() => setF({ storeId: '' })}>
            {t('billing.admin.clearStore')}
          </Button>
        )}
      </FilterBar>
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(p) => p.id}
        isLoading={list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        hasMore={list.hasNextPage}
        loadingMore={list.isFetchingNextPage}
        onLoadMore={() => void list.fetchNextPage()}
        empty={{ title: statusTab === 'pending' ? t('billing.admin.payments.queueEmpty') : t('billing.payments.empty'), icon: <ShieldCheck /> }}
      />
      {review && <ReviewPaymentDialog payment={review.payment} kind={review.kind} onClose={() => setReview(null)} />}
    </>
  );
}

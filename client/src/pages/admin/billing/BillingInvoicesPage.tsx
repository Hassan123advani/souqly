import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileText, X } from 'lucide-react';
import { INVOICE_KINDS, INVOICE_STATUSES } from '@souqly/shared';
import { useAdminList } from '@/api/admin';
import type { Invoice } from '@/api/billing';
import { CsvButton } from '@/components/admin/CsvButton';
import { DataTable, FilterSelect, type Column } from '@/components/admin/DataTable';
import { FilterBar } from '@/components/admin/FilterBar';
import { PageHeader } from '@/components/admin/PageHeader';
import { StatusTabs } from '@/components/admin/StatusTabs';
import { useUrlFilters } from '@/components/admin/useUrlFilters';
import { BillingBadge, PlanBadge } from '@/components/billing/BillingBadge';
import { Button } from '@/components/ui';
import { useLang } from '@/lib/catalog';
import { formatDate, money } from '@/lib/format';

export default function BillingInvoicesPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const [f, setF] = useUrlFilters(['status', 'kind', 'storeId'] as const);
  const params = { status: f.status, kind: f.kind, storeId: f.storeId };
  const list = useAdminList<Invoice>('billing/invoices', params);
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];

  const columns: Column<Invoice>[] = [
    {
      key: 'number',
      header: t('billing.invoice.number'),
      cell: (i) => (
        <Link to={`/admin/billing/invoices/${i.id}`} className="latin font-semibold text-primary-700 hover:underline" onClick={(e) => e.stopPropagation()}>
          {i.number}
        </Link>
      ),
    },
    {
      key: 'store',
      header: t('admin.stores.store'),
      cell: (i) =>
        i.store ? (
          <Link to={`/admin/billing/stores/${i.store.id}`} className="font-semibold text-fg hover:text-primary-700" onClick={(e) => e.stopPropagation()}>
            {i.store.name}
          </Link>
        ) : (
          '—'
        ),
    },
    { key: 'kind', header: t('billing.invoice.kind'), cell: (i) => <span className="text-fg-muted">{t(`billing.kind.${i.kind}`)}</span> },
    { key: 'plan', header: t('billing.invoice.plan'), cell: (i) => <PlanBadge plan={i.plan} /> },
    { key: 'issued', header: t('billing.invoice.issued'), cell: (i) => <span className="whitespace-nowrap text-fg-muted">{formatDate(i.issuedAt, lang)}</span> },
    { key: 'dueDate', header: t('billing.invoice.due'), cell: (i) => <span className="whitespace-nowrap text-fg-muted">{formatDate(i.dueDate, lang)}</span> },
    { key: 'total', header: t('billing.invoice.total'), align: 'end', cell: (i) => <span className="tabular" dir="ltr">{money(i.total)}</span> },
    { key: 'due', header: t('billing.invoice.amountDue'), align: 'end', cell: (i) => <span className="tabular font-bold" dir="ltr">{money(i.amountDue)}</span> },
    {
      key: 'status',
      header: t('billing.invoice.status'),
      cell: (i) => (
        <div className="flex flex-wrap gap-1">
          <BillingBadge status={i.status} />
          {i.pendingPayment && <BillingBadge status="pending" />}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t('billing.admin.nav.invoices')}
        description={t('billing.admin.invoices.subtitle')}
        crumbs={[{ label: t('admin.nav.finance') }, { label: t('billing.admin.nav.overview'), to: '/admin/billing' }]}
        actions={<CsvButton path="billing/invoices" params={params} filename="billing-invoices.csv" />}
      />
      <StatusTabs value={f.status} onChange={(v) => setF({ status: v })} tabs={[{ value: '', label: t('billing.common.all') }, ...INVOICE_STATUSES.map((s) => ({ value: s, label: t(`billing.status.${s}`) }))]} />
      <FilterBar>
        <FilterSelect label={t('billing.invoice.kind')} value={f.kind} onChange={(v) => setF({ kind: v })} allLabel={t('billing.admin.invoices.allKinds')} options={INVOICE_KINDS.map((k) => ({ value: k, label: t(`billing.kind.${k}`) }))} />
        {f.storeId && (
          <Button size="sm" variant="ghost" rightIcon={<X className="size-4" />} onClick={() => setF({ storeId: '' })}>
            {t('billing.admin.clearStore')}
          </Button>
        )}
      </FilterBar>
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(i) => i.id}
        isLoading={list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        hasMore={list.hasNextPage}
        loadingMore={list.isFetchingNextPage}
        onLoadMore={() => void list.fetchNextPage()}
        onRowClick={(i) => navigate(`/admin/billing/invoices/${i.id}`)}
        empty={{ title: t('billing.invoices.empty'), icon: <FileText /> }}
      />
    </>
  );
}

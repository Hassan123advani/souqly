import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileText } from 'lucide-react';
import { INVOICE_STATUSES, type InvoiceStatus } from '@souqly/shared';
import { useInvoices, type Invoice } from '@/api/billing';
import { DataTable, type Column } from '@/components/admin/DataTable';
import { StatusTabs } from '@/components/admin/StatusTabs';
import { BillingBadge, usePlanName } from '@/components/billing/BillingBadge';
import { useLang } from '@/lib/catalog';
import { formatDate, money } from '@/lib/format';

export default function BillingInvoicesPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const planName = usePlanName();
  const [sp, setSp] = useSearchParams();
  const raw = sp.get('status') ?? '';
  const status = (INVOICE_STATUSES as readonly string[]).includes(raw) ? (raw as InvoiceStatus) : undefined;
  const list = useInvoices({ status });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];

  const columns: Column<Invoice>[] = [
    { key: 'number', header: t('billing.invoice.number'), cell: (i) => (
        <Link to={`/seller/billing/invoices/${i.id}`} className="latin font-semibold text-primary-700 hover:underline" onClick={(e) => e.stopPropagation()}>
          {i.number}
        </Link>
      ),
    },
    { key: 'kind', header: t('billing.invoice.kind'), cell: (i) => <span className="text-fg-muted">{t(`billing.kind.${i.kind}`)}</span> },
    { key: 'plan', header: t('billing.invoice.plan'), cell: (i) => planName(i.plan) },
    { key: 'period', header: t('billing.invoice.period'), cell: (i) => <span className="whitespace-nowrap text-xs text-fg-muted">{`${formatDate(i.periodStart, lang)} – ${formatDate(i.periodEnd, lang)}`}</span> },
    { key: 'total', header: t('billing.invoice.total'), align: 'end', cell: (i) => <span className="tabular" dir="ltr">{money(i.total)}</span> },
    { key: 'due', header: t('billing.invoice.amountDue'), align: 'end', cell: (i) => <span className="tabular font-bold" dir="ltr">{money(i.amountDue)}</span> },
    { key: 'dueDate', header: t('billing.invoice.due'), cell: (i) => <span className="whitespace-nowrap text-fg-muted">{formatDate(i.dueDate, lang)}</span> },
    {
      key: 'status',
      header: t('billing.invoice.status'),
      cell: (i) => (
        <div className="flex flex-wrap items-center gap-1">
          <BillingBadge status={i.status} />
          {i.pendingPayment && <BillingBadge status="pending" />}
        </div>
      ),
    },
  ];

  return (
    <>
      <StatusTabs
        value={status ?? ''}
        onChange={(v) => setSp(v ? { status: v } : {}, { replace: true })}
        tabs={[{ value: '', label: t('billing.common.all') }, ...INVOICE_STATUSES.map((s) => ({ value: s, label: t(`billing.status.${s}`) }))]}
      />
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
        onRowClick={(i) => navigate(`/seller/billing/invoices/${i.id}`)}
        empty={{ title: t('billing.invoices.empty'), description: t('billing.invoices.emptyBody'), icon: <FileText /> }}
      />
    </>
  );
}

import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CreditCard } from 'lucide-react';
import { BILLING_PAYMENT_STATUSES, type BillingPaymentStatus } from '@souqly/shared';
import { useBillingPayments, type InvoicePayment } from '@/api/billing';
import { DataTable, type Column } from '@/components/admin/DataTable';
import { StatusTabs } from '@/components/admin/StatusTabs';
import { BillingBadge } from '@/components/billing/BillingBadge';
import { useLang } from '@/lib/catalog';
import { formatDateTime, money } from '@/lib/format';

/** Subscription / invoice payment history. */
export default function BillingPaymentsPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const [sp, setSp] = useSearchParams();
  const raw = sp.get('status') ?? '';
  const status = (BILLING_PAYMENT_STATUSES as readonly string[]).includes(raw) ? (raw as BillingPaymentStatus) : undefined;
  const list = useBillingPayments({ status });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];

  const columns: Column<InvoicePayment>[] = [
    { key: 'date', header: t('billing.payments.date'), cell: (p) => <span className="whitespace-nowrap text-fg-muted">{formatDateTime(p.createdAt, lang)}</span> },
    {
      key: 'invoice',
      header: t('billing.commissions.invoice'),
      cell: (p) => (
        <Link to={`/seller/billing/invoices/${p.invoiceId}`} className="latin font-semibold text-primary-700 hover:underline">
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
    { key: 'ref', header: t('billing.pay.reference'), cell: (p) => <span className="latin font-mono text-xs">{p.reference ?? '—'}</span> },
    { key: 'amount', header: t('billing.invoice.amount'), align: 'end', cell: (p) => <span className="tabular font-bold" dir="ltr">{money(p.amount)}</span> },
    {
      key: 'status',
      header: t('billing.invoice.status'),
      cell: (p) => (
        <div>
          <BillingBadge status={p.status} />
          {p.reviewNote && <p className="mt-1 max-w-[16rem] text-xs text-fg-muted">{p.reviewNote}</p>}
        </div>
      ),
    },
  ];

  return (
    <>
      <StatusTabs
        value={status ?? ''}
        onChange={(v) => setSp(v ? { status: v } : {}, { replace: true })}
        tabs={[{ value: '', label: t('billing.common.all') }, ...BILLING_PAYMENT_STATUSES.map((s) => ({ value: s, label: t(`billing.status.${s}`) }))]}
      />
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
        empty={{ title: t('billing.payments.empty'), icon: <CreditCard /> }}
      />
    </>
  );
}

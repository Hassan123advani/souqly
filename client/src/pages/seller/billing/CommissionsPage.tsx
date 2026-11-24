import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Receipt } from 'lucide-react';
import { COMMISSION_CHANNELS, COMMISSION_STATUSES, type CommissionChannel, type CommissionStatus } from '@souqly/shared';
import { useCommissions, type CommissionEntry } from '@/api/billing';
import { DataTable, FilterSelect, type Column } from '@/components/admin/DataTable';
import { BillingBadge } from '@/components/billing/BillingBadge';
import { useLang } from '@/lib/catalog';
import { formatDate, money } from '@/lib/format';

const KINDS = ['charge', 'reversal'] as const;
const pick = <T extends string>(v: string | null, list: readonly T[]) => (v && (list as readonly string[]).includes(v) ? (v as T) : undefined);

/** Commission ledger: one charge per delivered sub-order, reversals for seller-borne refunds. */
export default function BillingCommissionsPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const [sp, setSp] = useSearchParams();
  const channel = pick<CommissionChannel>(sp.get('channel'), COMMISSION_CHANNELS);
  const status = pick<CommissionStatus>(sp.get('status'), COMMISSION_STATUSES);
  const kind = pick(sp.get('kind'), KINDS);
  const list = useCommissions({ channel, status, kind });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  const set = (k: string, v: string) =>
    setSp(
      (prev) => {
        const n = new URLSearchParams(prev);
        if (v) n.set(k, v);
        else n.delete(k);
        return n;
      },
      { replace: true },
    );

  const columns: Column<CommissionEntry>[] = [
    { key: 'date', header: t('billing.commissions.date'), cell: (e) => <span className="whitespace-nowrap text-fg-muted">{formatDate(e.at, lang)}</span> },
    {
      key: 'order',
      header: t('billing.commissions.order'),
      cell: (e) => (
        <div>
          <Link to={`/seller/orders/${e.orderId}`} className="latin font-semibold text-primary-700 hover:underline">
            {e.orderNumber}
          </Link>
          <p className="text-xs text-fg-muted">
            {t(`billing.entryKind.${e.kind}`)} · {t(`billing.reason.${e.reason}`)}
          </p>
        </div>
      ),
    },
    { key: 'channel', header: t('billing.commissions.channel'), cell: (e) => t(`billing.channel.${e.channel}`) },
    { key: 'total', header: t('billing.commissions.orderTotal'), align: 'end', cell: (e) => <span className="tabular" dir="ltr">{money(e.orderTotal)}</span> },
    { key: 'base', header: t('billing.commissions.base'), align: 'end', cell: (e) => <span className="tabular" dir="ltr">{money(e.base)}</span> },
    { key: 'amount', header: t('billing.commissions.amount'), align: 'end', cell: (e) => <span className={`tabular font-bold ${e.amount < 0 ? 'text-success' : ''}`} dir="ltr">{money(e.amount)}</span> },
    { key: 'status', header: t('billing.commissions.status'), cell: (e) => <BillingBadge status={e.status} /> },
    {
      key: 'invoice',
      header: t('billing.commissions.invoice'),
      cell: (e) =>
        e.invoiceId ? (
          <Link to={`/seller/billing/invoices/${e.invoiceId}`} className="latin text-xs font-semibold text-primary-700 hover:underline">
            {e.invoiceNumber ?? e.invoiceId.slice(-6)}
          </Link>
        ) : (
          <span className="text-fg-subtle">—</span>
        ),
    },
  ];

  return (
    <>
      <p className="mb-3 text-sm text-fg-muted">{t('billing.commissions.basis')}</p>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FilterSelect label={t('billing.commissions.channel')} value={channel ?? ''} onChange={(v) => set('channel', v)} allLabel={t('billing.commissions.allChannels')} options={COMMISSION_CHANNELS.map((c) => ({ value: c, label: t(`billing.channel.${c}`) }))} />
        <FilterSelect label={t('billing.commissions.status')} value={status ?? ''} onChange={(v) => set('status', v)} allLabel={t('billing.commissions.allStatuses')} options={COMMISSION_STATUSES.map((s) => ({ value: s, label: t(`billing.status.${s}`) }))} />
        <FilterSelect label={t('billing.commissions.kind')} value={kind ?? ''} onChange={(v) => set('kind', v)} allLabel={t('billing.commissions.allKinds')} options={KINDS.map((k) => ({ value: k, label: t(`billing.entryKind.${k}`) }))} />
      </div>
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
        empty={{ title: t('billing.commissions.empty'), description: t('billing.commissions.emptyBody'), icon: <Receipt /> }}
      />
    </>
  );
}

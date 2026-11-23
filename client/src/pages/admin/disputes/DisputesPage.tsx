import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Gavel, Undo2 } from 'lucide-react';
import { RETURN_STATUSES } from '@souqly/shared';
import { useAdminList, type AdminDisputeRow, type AdminReturnRow } from '@/api/admin';
import { DataTable, FilterSelect, type Column } from '@/components/admin/DataTable';
import { FilterBar } from '@/components/admin/FilterBar';
import { PageHeader } from '@/components/admin/PageHeader';
import { StatusPill } from '@/components/admin/StatusPill';
import { StatusTabs } from '@/components/admin/StatusTabs';
import { useUrlFilters } from '@/components/admin/useUrlFilters';
import { useLang } from '@/lib/catalog';
import { formatDateTime, formatRelative, money } from '@/lib/format';

export default function DisputesPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const nav = useNavigate();
  const [f, setF] = useUrlFilters(['tab', 'status'] as const);
  const returnsTab = f.tab === 'returns';
  const disputes = useAdminList<AdminDisputeRow>('disputes', { status: returnsTab || f.status === 'all' ? undefined : f.status || 'open' }, { enabled: !returnsTab });
  const returns = useAdminList<AdminReturnRow>('returns', { status: f.status }, { enabled: returnsTab });
  const list = returnsTab ? returns : disputes;

  const dCols: Column<AdminDisputeRow>[] = [
    { key: 'id', header: t('admin.disputes.case'), cell: (d) => <span className="latin font-mono text-xs font-bold">#{d.id.slice(-6).toUpperCase()}</span> },
    { key: 'status', header: t('admin.common.status'), cell: (d) => <StatusPill status={d.status} /> },
    { key: 'msgs', header: t('admin.disputes.messages'), align: 'end', cell: (d) => <span className="tabular">{d.messageCount}</span> },
    { key: 'last', header: t('admin.disputes.lastActivity'), cell: (d) => <span className="text-fg-muted">{d.lastMessageAt ? formatRelative(d.lastMessageAt, lang) : '—'}</span> },
    { key: 'res', header: t('admin.disputes.resolution'), cell: (d) => <span className="line-clamp-1 max-w-xs text-fg-muted">{d.resolution ?? '—'}</span> },
    { key: 'created', header: t('admin.disputes.opened'), cell: (d) => <span className="whitespace-nowrap text-fg-muted">{formatDateTime(d.createdAt, lang)}</span> },
  ];
  const rCols: Column<AdminReturnRow>[] = [
    { key: 'order', header: t('admin.orders.number'), cell: (r) => <span className="font-bold" dir="ltr">{r.orderNumber}</span> },
    { key: 'status', header: t('admin.common.status'), cell: (r) => <StatusPill status={r.status} /> },
    { key: 'reason', header: t('admin.common.reason'), cell: (r) => <span className="text-fg-muted">{t(`returns.reasons.${r.reason}`, { defaultValue: r.reason })}</span> },
    { key: 'items', header: t('admin.orders.items'), cell: (r) => <span className="line-clamp-1 max-w-xs">{r.items.map((i) => `${i.title} ×${i.qty}`).join(', ')}</span> },
    { key: 'refund', header: t('admin.disputes.refund'), align: 'end', cell: (r) => <span dir="ltr">{money(r.refund.amount)}</span> },
    { key: 'created', header: t('admin.disputes.opened'), cell: (r) => <span className="whitespace-nowrap text-fg-muted">{formatDateTime(r.createdAt, lang)}</span> },
  ];

  const common = {
    isLoading: list.isLoading,
    error: list.error,
    onRetry: () => void list.refetch(),
    hasMore: list.hasNextPage,
    loadingMore: list.isFetchingNextPage,
    onLoadMore: () => void list.fetchNextPage(),
  };

  return (
    <>
      <PageHeader title={t('admin.nav.disputes')} description={t('admin.disputes.subtitle')} />
      <StatusTabs
        value={returnsTab ? 'returns' : 'disputes'}
        onChange={(v) => setF({ tab: v === 'returns' ? 'returns' : '', status: '' })}
        tabs={[
          { value: 'disputes', label: t('admin.disputes.disputes') },
          { value: 'returns', label: t('admin.disputes.returns') },
        ]}
      />
      <FilterBar>
        {returnsTab ? (
          <FilterSelect value={f.status} onChange={(status) => setF({ status })} allLabel={t('admin.common.allStatuses')} options={RETURN_STATUSES.map((s) => ({ value: s, label: t(`admin.status.${s}`) }))} />
        ) : (
          <FilterSelect
            value={f.status === 'all' ? '' : f.status || 'open'}
            onChange={(status) => setF({ status: status === 'open' ? '' : status || 'all' })}
            allLabel={t('admin.common.allStatuses')}
            options={(['open', 'resolved'] as const).map((s) => ({ value: s, label: t(`admin.status.${s}`) }))}
          />
        )}
      </FilterBar>
      {returnsTab ? (
        <DataTable
          {...common}
          rows={returns.data?.pages.flatMap((p) => p.data) ?? []}
          columns={rCols}
          rowKey={(r) => r.id}
          onRowClick={(r) => nav(r.disputeId ? `/admin/disputes/${r.disputeId}` : `/admin/orders/${r.orderId}`)}
          empty={{ title: t('admin.disputes.noReturns'), icon: <Undo2 /> }}
        />
      ) : (
        <DataTable
          {...common}
          rows={disputes.data?.pages.flatMap((p) => p.data) ?? []}
          columns={dCols}
          rowKey={(d) => d.id}
          onRowClick={(d) => nav(`/admin/disputes/${d.id}`)}
          empty={{ title: t('admin.disputes.empty'), icon: <Gavel /> }}
        />
      )}
    </>
  );
}

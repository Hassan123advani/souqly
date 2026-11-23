import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LifeBuoy } from 'lucide-react';
import { useAdminList, type TicketSummary } from '@/api/admin';
import { DataTable, FilterSelect, type Column } from '@/components/admin/DataTable';
import { FilterBar } from '@/components/admin/FilterBar';
import { PageHeader } from '@/components/admin/PageHeader';
import { StatusPill } from '@/components/admin/StatusPill';
import { StatusTabs } from '@/components/admin/StatusTabs';
import { useUrlFilters } from '@/components/admin/useUrlFilters';
import { Badge } from '@/components/ui';
import { useLang } from '@/lib/catalog';
import { formatRelative } from '@/lib/format';

export default function TicketsPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const nav = useNavigate();
  const [f, setF] = useUrlFilters(['status', 'assigneeId', 'priority'] as const);
  const status = f.status === 'all' ? undefined : f.status || 'open';
  const list = useAdminList<TicketSummary>('tickets', { status, assigneeId: f.assigneeId, priority: f.priority });

  const columns: Column<TicketSummary>[] = [
    {
      key: 'subject',
      header: t('support.subject'),
      cell: (tk) => (
        <div className="min-w-0 max-w-md">
          <p className="flex items-center gap-2 truncate font-semibold text-fg">
            {tk.lastSide === 'user' && tk.status !== 'closed' && <span className="size-2 shrink-0 rounded-full bg-accent" aria-label={t('admin.support.awaitingReply')} />}
            {tk.subject}
          </p>
          <p className="text-xs text-fg-muted">{t(`support.categories.${tk.category}`, { defaultValue: tk.category })} · {t('admin.support.messages', { count: tk.messageCount })}</p>
        </div>
      ),
    },
    { key: 'status', header: t('admin.common.status'), cell: (tk) => <StatusPill status={tk.status} /> },
    { key: 'priority', header: t('admin.support.priority'), cell: (tk) => (tk.priority === 'normal' ? <span className="text-fg-muted">{t('admin.support.priorities.normal')}</span> : <StatusPill status={tk.priority} />) },
    { key: 'assignee', header: t('admin.support.assignee'), cell: (tk) => (tk.assigneeId ? <Badge size="sm">#{tk.assigneeId.slice(-5)}</Badge> : <span className="text-fg-subtle">{t('admin.support.unassigned')}</span>) },
    { key: 'last', header: t('admin.disputes.lastActivity'), cell: (tk) => <span className="text-fg-muted">{tk.lastMessageAt ? formatRelative(tk.lastMessageAt, lang) : '—'}</span> },
  ];

  return (
    <>
      <PageHeader title={t('admin.nav.support')} description={t('admin.support.subtitle')} />
      <StatusTabs
        value={f.status || 'open'}
        onChange={(v) => setF({ status: v === 'open' ? '' : v })}
        tabs={[...(['open', 'pending', 'resolved', 'closed'] as const).map((s) => ({ value: s, label: t(`admin.status.${s}`) })), { value: 'all', label: t('admin.common.all') }]}
      />
      <FilterBar>
        <FilterSelect
          value={f.assigneeId}
          onChange={(assigneeId) => setF({ assigneeId })}
          allLabel={t('admin.support.anyAssignee')}
          options={[
            { value: 'me', label: t('admin.support.mine') },
            { value: 'none', label: t('admin.support.unassigned') },
          ]}
        />
        <FilterSelect value={f.priority} onChange={(priority) => setF({ priority })} allLabel={t('admin.support.anyPriority')} options={(['urgent', 'high', 'normal', 'low'] as const).map((p) => ({ value: p, label: t(`admin.support.priorities.${p}`) }))} />
      </FilterBar>
      <DataTable
        rows={list.data?.pages.flatMap((p) => p.data) ?? []}
        columns={columns}
        rowKey={(tk) => tk.id}
        isLoading={list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        hasMore={list.hasNextPage}
        loadingMore={list.isFetchingNextPage}
        onLoadMore={() => void list.fetchNextPage()}
        onRowClick={(tk) => nav(`/admin/support/${tk.id}`)}
        empty={{ title: t('admin.support.empty'), icon: <LifeBuoy /> }}
      />
    </>
  );
}

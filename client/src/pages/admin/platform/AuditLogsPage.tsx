import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ScrollText } from 'lucide-react';
import { useAdminList, type AuditRow } from '@/api/admin';
import { CsvButton } from '@/components/admin/CsvButton';
import { DataTable, type Column } from '@/components/admin/DataTable';
import { FilterBar } from '@/components/admin/FilterBar';
import { PageHeader } from '@/components/admin/PageHeader';
import { useUrlFilters } from '@/components/admin/useUrlFilters';
import { Badge, Button, Input, Modal } from '@/components/ui';
import { useDebounced } from '@/hooks/useDebounced';
import { useLang } from '@/lib/catalog';
import { formatDateTime } from '@/lib/format';

const LINKS: Record<string, string> = { User: '/admin/users/', Store: '/admin/stores/', Order: '/admin/orders/', Dispute: '/admin/disputes/' };

export default function AuditLogsPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const [f, setF] = useUrlFilters(['actorId', 'targetType', 'targetId', 'from', 'to'] as const);
  const [action, setAction] = useState('');
  const da = useDebounced(action.trim(), 350);
  const [open, setOpen] = useState<AuditRow | null>(null);
  const params = {
    action: da,
    actorId: f.actorId,
    targetType: f.targetType,
    targetId: f.targetId,
    from: f.from ? new Date(`${f.from}T00:00:00`).toISOString() : undefined,
    to: f.to ? new Date(`${f.to}T23:59:59`).toISOString() : undefined,
  };
  const list = useAdminList<AuditRow>('audit-logs', params, { limit: 50 });

  const columns: Column<AuditRow>[] = [
    { key: 'at', header: t('admin.audit.when'), cell: (a) => <span className="whitespace-nowrap text-xs text-fg-muted">{formatDateTime(a.createdAt, lang)}</span> },
    { key: 'action', header: t('admin.audit.action'), cell: (a) => <code className="latin rounded bg-surface-2 px-1.5 py-0.5 text-xs font-semibold">{a.action}</code> },
    {
      key: 'actor',
      header: t('admin.audit.actor'),
      cell: (a) =>
        a.actorId ? (
          <button type="button" className="text-start text-xs" onClick={(e) => (e.stopPropagation(), setF({ actorId: a.actorId ?? '' }))}>
            <span className="latin font-mono text-primary-700 hover:underline">#{a.actorId.slice(-6)}</span> {a.actorRole && <Badge size="sm">{a.actorRole}</Badge>}
          </button>
        ) : (
          <span className="text-fg-subtle">{t('admin.audit.system')}</span>
        ),
    },
    {
      key: 'target',
      header: t('admin.audit.target'),
      cell: (a) =>
        a.targetType ? (
          <span className="text-xs">
            {a.targetType}{' '}
            {a.targetId &&
              (LINKS[a.targetType] ? (
                <Link to={`${LINKS[a.targetType]}${a.targetId}`} onClick={(e) => e.stopPropagation()} className="latin font-mono text-primary-700 hover:underline">
                  #{a.targetId.slice(-6)}
                </Link>
              ) : (
                <span className="latin font-mono text-fg-muted">{a.targetId.slice(-12)}</span>
              ))}
          </span>
        ) : (
          '—'
        ),
    },
    { key: 'ip', header: 'IP', cell: (a) => <span className="latin font-mono text-xs text-fg-muted">{a.ip ?? '—'}</span> },
    { key: 'meta', header: t('admin.audit.meta'), cell: (a) => <span className="latin line-clamp-1 max-w-[280px] font-mono text-[11px] text-fg-muted">{Object.keys(a.meta).length ? JSON.stringify(a.meta) : '—'}</span> },
  ];

  return (
    <>
      <PageHeader title={t('admin.nav.audit')} description={t('admin.audit.subtitle')} crumbs={[{ label: t('admin.nav.platform') }]} actions={<CsvButton path="audit-logs" params={params} />} />
      <FilterBar q={action} onQ={setAction} placeholder={t('admin.audit.searchAction')}>
        <Input value={f.targetType} onChange={(e) => setF({ targetType: e.target.value })} placeholder={t('admin.audit.targetType')} aria-label={t('admin.audit.targetType')} className="w-36" />
        <Input dir="ltr" value={f.targetId} onChange={(e) => setF({ targetId: e.target.value.trim() })} placeholder={t('admin.audit.targetId')} aria-label={t('admin.audit.targetId')} className="w-44" />
        <Input type="date" value={f.from} onChange={(e) => setF({ from: e.target.value })} className="w-40" aria-label={t('admin.common.from')} />
        <Input type="date" value={f.to} onChange={(e) => setF({ to: e.target.value })} className="w-40" aria-label={t('admin.common.to')} />
        {(f.actorId || f.targetType || f.targetId || f.from || f.to) && (
          <Button variant="ghost" size="sm" onClick={() => setF({ actorId: '', targetType: '', targetId: '', from: '', to: '' })}>
            {t('admin.common.clear')} {f.actorId && <Badge size="sm">#{f.actorId.slice(-6)}</Badge>}
          </Button>
        )}
      </FilterBar>
      <DataTable
        rows={list.data?.pages.flatMap((p) => p.data) ?? []}
        columns={columns}
        rowKey={(a) => a.id}
        isLoading={list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        hasMore={list.hasNextPage}
        loadingMore={list.isFetchingNextPage}
        onLoadMore={() => void list.fetchNextPage()}
        onRowClick={setOpen}
        empty={{ title: t('admin.audit.empty'), icon: <ScrollText /> }}
      />
      {open && (
        <Modal open onOpenChange={(o) => !o && setOpen(null)} title={open.action} description={formatDateTime(open.createdAt, lang)} size="lg">
          <pre className="latin max-h-[60vh] overflow-auto rounded-md bg-surface-2 p-4 text-xs" dir="ltr">
            {JSON.stringify(open, null, 2)}
          </pre>
        </Modal>
      )}
    </>
  );
}

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Eye, EyeOff, Flag, MessageSquareWarning, ShieldAlert, Star, Trash2 } from 'lucide-react';
import { useAdminList, useAdminMutation, type AdminReport, type AdminReview, type FraudSignal } from '@/api/admin';
import { getErrorMessage } from '@/api/client';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { CsvButton } from '@/components/admin/CsvButton';
import { DataTable, FilterSelect, type Column } from '@/components/admin/DataTable';
import { FilterBar } from '@/components/admin/FilterBar';
import { PageHeader } from '@/components/admin/PageHeader';
import { StatusPill } from '@/components/admin/StatusPill';
import { StatusTabs } from '@/components/admin/StatusTabs';
import { useUrlFilters } from '@/components/admin/useUrlFilters';
import { Badge, Button, Card, EmptyState, ErrorState, FormField, LoadMore, Select, Skeleton } from '@/components/ui';
import { useLang } from '@/lib/catalog';
import { formatRelative } from '@/lib/format';

export default function ModerationPage() {
  const { t } = useTranslation();
  const [f, setF] = useUrlFilters(['tab', 'status'] as const);
  const tab = f.tab || 'reviews';
  return (
    <>
      <PageHeader title={t('admin.nav.moderation')} description={t('admin.moderation.subtitle')} actions={tab === 'reviews' && <CsvButton path="reviews" params={{ status: f.status }} />} />
      <StatusTabs
        value={tab}
        onChange={(v) => setF({ tab: v === 'reviews' ? '' : v, status: '' })}
        tabs={[
          { value: 'reviews', label: t('admin.moderation.reviews') },
          { value: 'reports', label: t('admin.moderation.reports') },
          { value: 'fraud', label: t('admin.moderation.fraud') },
        ]}
      />
      {tab === 'reviews' && <Reviews status={f.status} setStatus={(status) => setF({ status })} />}
      {tab === 'reports' && <Reports status={f.status} setStatus={(status) => setF({ status })} />}
      {tab === 'fraud' && <Fraud />}
    </>
  );
}

function Reviews({ status, setStatus }: { status: string; setStatus: (s: string) => void }) {
  const { t } = useTranslation();
  const lang = useLang();
  const list = useAdminList<AdminReview>('reviews', { status });
  const post = useAdminMutation('post', ['reviews']);
  const del = useAdminMutation('delete', ['reviews']);
  const [remove, setRemove] = useState<AdminReview | null>(null);
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  const fail = (e: unknown) => toast.error(getErrorMessage(e));
  return (
    <>
      <FilterBar>
        <FilterSelect value={status} onChange={setStatus} allLabel={t('admin.common.allStatuses')} options={(['published', 'pending', 'hidden'] as const).map((s) => ({ value: s, label: t(`admin.status.${s}`) }))} />
      </FilterBar>
      {list.error ? (
        <Card>
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        </Card>
      ) : list.isLoading ? (
        <div className="grid gap-3">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : !rows.length ? (
        <Card>
          <EmptyState icon={<MessageSquareWarning />} title={t('admin.moderation.noReviews')} />
        </Card>
      ) : (
        <div className="grid gap-3">
          {rows.map((r) => (
            <Card key={r.id} className="flex flex-col gap-3 p-4 sm:flex-row">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-0.5" aria-label={t('admin.moderation.rating', { n: r.rating })}>
                    {Array.from({ length: 5 }, (_, i) => (
                      <Star key={i} className={i < r.rating ? 'size-3.5 fill-accent text-accent' : 'size-3.5 text-border-strong'} />
                    ))}
                  </span>
                  <StatusPill status={r.status} />
                  {r.verified && <Badge size="sm" tone="success">{t('admin.moderation.verified')}</Badge>}
                  {r.reportCount > 0 && (
                    <Badge size="sm" tone="danger">
                      <Flag className="size-3" />
                      {r.reportCount}
                    </Badge>
                  )}
                  {r.flags.map((fl) => (
                    <Badge key={fl} size="sm" tone="warning">
                      {fl}
                    </Badge>
                  ))}
                  <span className="text-xs text-fg-subtle">{formatRelative(r.createdAt, lang)}</span>
                </div>
                {r.title && <p className="mt-2 font-semibold text-fg">{r.title}</p>}
                {r.body && <p className="mt-1 whitespace-pre-line text-sm text-fg-muted">{r.body}</p>}
                {r.media.length > 0 && (
                  <div className="mt-2 flex gap-1.5">
                    {r.media.slice(0, 6).map((m) => (
                      <a key={m.url} href={m.url} target="_blank" rel="noopener noreferrer" className="size-14 overflow-hidden rounded-md bg-surface-2">
                        {m.type === 'image' ? <img src={m.url} alt="" className="size-full object-cover" /> : <span className="grid size-full place-items-center text-xs">▶</span>}
                      </a>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-start gap-1.5">
                {r.status === 'hidden' ? (
                  <Button size="sm" variant="outline" leftIcon={<Eye className="size-4" />} onClick={() => post.mutate({ path: `reviews/${r.id}/restore` }, { onSuccess: () => toast.success(t('admin.moderation.restored')), onError: fail })}>
                    {t('admin.moderation.restore')}
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" leftIcon={<EyeOff className="size-4" />} onClick={() => post.mutate({ path: `reviews/${r.id}/hide` }, { onSuccess: () => toast.success(t('admin.moderation.hidden')), onError: fail })}>
                    {t('admin.moderation.hide')}
                  </Button>
                )}
                <Button size="sm" variant="ghost" leftIcon={<Trash2 className="size-4" />} onClick={() => setRemove(r)}>
                  {t('common.delete')}
                </Button>
              </div>
            </Card>
          ))}
          <LoadMore hasMore={!!list.hasNextPage} loading={list.isFetchingNextPage} onLoadMore={() => void list.fetchNextPage()} />
        </div>
      )}
      {remove && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setRemove(null)}
          title={t('admin.moderation.deleteReview')}
          description={t('admin.moderation.deleteReviewDesc')}
          confirmLabel={t('common.delete')}
          tone="danger"
          loading={del.isPending}
          onConfirm={() => del.mutate({ path: `reviews/${remove.id}` }, { onSuccess: () => (toast.success(t('admin.common.deleted')), setRemove(null)), onError: fail })}
        />
      )}
    </>
  );
}

function Reports({ status, setStatus }: { status: string; setStatus: (s: string) => void }) {
  const { t } = useTranslation();
  const lang = useLang();
  const list = useAdminList<AdminReport>('reports', { status });
  const post = useAdminMutation('post', ['reports', 'reviews']);
  const [resolve, setResolve] = useState<AdminReport | null>(null);
  const [action, setAction] = useState<'dismiss' | 'hide_target' | 'resolved'>('resolved');
  const columns: Column<AdminReport>[] = [
    { key: 'target', header: t('admin.moderation.target'), cell: (r) => <span><Badge size="sm">{r.targetType}</Badge> <span className="latin font-mono text-xs text-fg-muted">#{r.targetId.slice(-6)}</span></span> },
    { key: 'reason', header: t('admin.common.reason'), cell: (r) => <div className="max-w-sm"><p className="font-semibold">{t(`admin.moderation.reasons.${r.reason}`, { defaultValue: r.reason })}</p>{r.details && <p className="line-clamp-2 text-xs text-fg-muted">{r.details}</p>}</div> },
    { key: 'status', header: t('admin.common.status'), cell: (r) => <StatusPill status={r.status} /> },
    { key: 'when', header: t('admin.moderation.reported'), cell: (r) => <span className="text-fg-muted">{formatRelative(r.createdAt, lang)}</span> },
    {
      key: 'a',
      header: '',
      align: 'end',
      cell: (r) =>
        (r.status === 'open' || r.status === 'reviewing') && (
          <Button size="sm" variant="outline" onClick={() => (setAction('resolved'), setResolve(r))}>
            {t('admin.moderation.resolve')}
          </Button>
        ),
    },
  ];
  return (
    <>
      <FilterBar>
        <FilterSelect value={status} onChange={setStatus} allLabel={t('admin.common.allStatuses')} options={(['open', 'reviewing', 'resolved', 'dismissed'] as const).map((s) => ({ value: s, label: t(`admin.status.${s}`) }))} />
      </FilterBar>
      <DataTable
        rows={list.data?.pages.flatMap((p) => p.data) ?? []}
        columns={columns}
        rowKey={(r) => r.id}
        isLoading={list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        hasMore={list.hasNextPage}
        loadingMore={list.isFetchingNextPage}
        onLoadMore={() => void list.fetchNextPage()}
        empty={{ title: t('admin.moderation.noReports'), icon: <Flag /> }}
      />
      {resolve && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setResolve(null)}
          title={t('admin.moderation.resolveTitle')}
          confirmLabel={t('admin.moderation.resolve')}
          tone={action === 'hide_target' ? 'danger' : 'primary'}
          reasonLabel={t('admin.moderation.noteOptional')}
          loading={post.isPending}
          onConfirm={(note) =>
            post.mutate(
              { path: `reports/${resolve.id}/resolve`, body: { action, ...(note ? { note } : {}) } },
              { onSuccess: () => (toast.success(t('admin.moderation.resolvedToast')), setResolve(null)), onError: (e) => toast.error(getErrorMessage(e)) },
            )
          }
        >
          <FormField label={t('admin.moderation.action')}>
            <Select value={action} onValueChange={(v) => setAction(v as typeof action)} options={(['resolved', 'hide_target', 'dismiss'] as const).map((a) => ({ value: a, label: t(`admin.moderation.actions.${a}`) }))} />
          </FormField>
        </ConfirmDialog>
      )}
    </>
  );
}

function Fraud() {
  const { t } = useTranslation();
  const lang = useLang();
  const list = useAdminList<FraudSignal>('fraud-signals');
  const post = useAdminMutation('post', ['fraud-signals']);
  const columns: Column<FraudSignal>[] = [
    { key: 'type', header: t('admin.moderation.signal'), cell: (s) => <span className="font-semibold">{t(`admin.moderation.signals.${s.type}`, { defaultValue: s.type.replace(/_/g, ' ') })}</span> },
    { key: 'ref', header: t('admin.moderation.target'), cell: (s) => <span><Badge size="sm">{s.refType}</Badge> <span className="latin font-mono text-xs text-fg-muted">#{s.refId.slice(-6)}</span></span> },
    {
      key: 'score',
      header: t('admin.moderation.score'),
      cell: (s) => (
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-20 overflow-hidden rounded-pill bg-surface-2">
            <div className={s.score >= 70 ? 'h-full bg-danger' : s.score >= 40 ? 'h-full bg-warning' : 'h-full bg-success'} style={{ width: `${Math.min(100, s.score)}%` }} />
          </div>
          <span className="tabular text-xs font-bold">{s.score}</span>
        </div>
      ),
    },
    { key: 'details', header: t('admin.moderation.details'), cell: (s) => <span className="latin line-clamp-1 max-w-xs font-mono text-[11px] text-fg-muted">{JSON.stringify(s.details)}</span> },
    { key: 'when', header: t('admin.moderation.detected'), cell: (s) => <span className="text-fg-muted">{formatRelative(s.createdAt, lang)}</span> },
    {
      key: 'a',
      header: '',
      align: 'end',
      cell: (s) =>
        s.status === 'open' && (
          <Button size="sm" variant="ghost" onClick={() => post.mutate({ path: `fraud-signals/${s.id}/dismiss` }, { onSuccess: () => toast.success(t('admin.moderation.dismissed')), onError: (e) => toast.error(getErrorMessage(e)) })}>
            {t('admin.moderation.dismiss')}
          </Button>
        ),
    },
  ];
  return (
    <DataTable
      rows={list.data?.pages.flatMap((p) => p.data) ?? []}
      columns={columns}
      rowKey={(s) => s.id}
      isLoading={list.isLoading}
      error={list.error}
      onRetry={() => void list.refetch()}
      hasMore={list.hasNextPage}
      loadingMore={list.isFetchingNextPage}
      onLoadMore={() => void list.fetchNextPage()}
      empty={{ title: t('admin.moderation.noFraud'), icon: <ShieldAlert /> }}
    />
  );
}

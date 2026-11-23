import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Check, EyeOff, PackageCheck, Sparkles, X } from 'lucide-react';
import { useAdminList, useAdminMutation, type AdminProductRow } from '@/api/admin';
import { getErrorMessage } from '@/api/client';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { CsvButton } from '@/components/admin/CsvButton';
import { FilterBar } from '@/components/admin/FilterBar';
import { PageHeader } from '@/components/admin/PageHeader';
import { StatusPill } from '@/components/admin/StatusPill';
import { StatusTabs } from '@/components/admin/StatusTabs';
import { useUrlFilters } from '@/components/admin/useUrlFilters';
import { Button, Card, Checkbox, EmptyState, ErrorState, LoadMore, Skeleton } from '@/components/ui';
import { useDebounced } from '@/hooks/useDebounced';
import { useLang } from '@/lib/catalog';
import { cn } from '@/lib/cn';
import { formatRelative, money } from '@/lib/format';

type Pending = { kind: 'reject' | 'hide' | 'bulkReject' | 'bulkApprove'; product?: AdminProductRow };

export default function ModerationQueuePage() {
  const { t } = useTranslation();
  const lang = useLang();
  const [f, setF] = useUrlFilters(['status'] as const);
  const status = f.status || 'pending_review';
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 350);
  const params = { status, q: dq };
  const list = useAdminList<AdminProductRow>('products', params, { limit: 24 });
  const post = useAdminMutation('post', ['products']);
  const patch = useAdminMutation('patch', ['products']);
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  const isQueue = status === 'pending_review';
  const fail = (e: unknown) => toast.error(getErrorMessage(e));

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const approve = (p: AdminProductRow) =>
    post.mutate(
      { path: `products/${p.id}/approve` },
      { onSuccess: () => (toast.success(t('admin.products.approved', { title: p.title })), setSelected((s) => s.filter((x) => x !== p.id))), onError: fail },
    );

  function confirm(note: string) {
    if (!pending) return;
    const close = () => (setPending(null), setSelected([]));
    const one = pending.product;
    if (pending.kind === 'reject' && one) post.mutate({ path: `products/${one.id}/reject`, body: { note } }, { onSuccess: () => (toast.success(t('admin.products.rejected')), close()), onError: fail });
    if (pending.kind === 'hide' && one) post.mutate({ path: `products/${one.id}/hide`, body: { note } }, { onSuccess: () => (toast.success(t('admin.products.hidden')), close()), onError: fail });
    if (pending.kind === 'bulkApprove' || pending.kind === 'bulkReject') {
      const action = pending.kind === 'bulkApprove' ? 'approve' : 'reject';
      post.mutate(
        { path: 'products/bulk', body: { ids: selected, action, ...(action === 'reject' ? { note } : {}) } },
        {
          onSuccess: (r) => {
            const res = r as { ok: string[]; failed: unknown[] };
            toast.success(t('admin.products.bulkDone', { count: res.ok.length }));
            if (res.failed.length) toast.error(t('admin.products.bulkFailed', { count: res.failed.length }));
            close();
          },
          onError: fail,
        },
      );
    }
  }

  return (
    <>
      <PageHeader title={t('admin.nav.products')} description={t('admin.products.subtitle')} actions={<CsvButton path="products" params={params} />} />
      <StatusTabs
        value={status}
        onChange={(v) => (setF({ status: v === 'pending_review' ? '' : v }), setSelected([]))}
        tabs={(['pending_review', 'published', 'rejected'] as const).map((s) => ({ value: s, label: t(`admin.status.${s}`) }))}
      />
      <FilterBar q={q} onQ={setQ} placeholder={t('admin.products.search')}>
        {isQueue && rows.length > 0 && (
          <Checkbox checked={rows.every((r) => selected.includes(r.id))} onChange={(e) => setSelected(e.target.checked ? rows.map((r) => r.id) : [])} label={t('admin.common.selectAll')} />
        )}
      </FilterBar>

      {selected.length > 0 && (
        <div className="sticky top-20 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary-100 bg-primary-50 px-3 py-2 text-sm shadow-card">
          <span className="font-semibold text-primary-800">{t('admin.common.selected', { count: selected.length })}</span>
          <Button size="sm" leftIcon={<Check className="size-4" />} onClick={() => setPending({ kind: 'bulkApprove' })}>
            {t('admin.products.approveAll')}
          </Button>
          <Button size="sm" variant="danger" leftIcon={<X className="size-4" />} onClick={() => setPending({ kind: 'bulkReject' })}>
            {t('admin.products.rejectAll')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
            {t('admin.common.clear')}
          </Button>
        </div>
      )}

      {list.error ? (
        <Card>
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        </Card>
      ) : list.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-80" />
          ))}
        </div>
      ) : !rows.length ? (
        <Card>
          <EmptyState icon={<PackageCheck />} title={isQueue ? t('admin.products.queueEmpty') : t('admin.common.empty')} description={isQueue ? t('admin.products.queueEmptyBody') : undefined} />
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {rows.map((p) => (
              <Card key={p.id} className={cn('flex flex-col overflow-hidden transition-shadow', selected.includes(p.id) && 'ring-2 ring-primary')}>
                <div className="relative aspect-[4/3] bg-surface-2">
                  {p.image && <img src={p.image} alt="" className="size-full object-cover" loading="lazy" />}
                  {isQueue && (
                    <div className="absolute start-2 top-2 rounded-md bg-surface/90 p-1 backdrop-blur">
                      <Checkbox checked={selected.includes(p.id)} onChange={() => toggle(p.id)} aria-label={p.title} />
                    </div>
                  )}
                  <div className="absolute end-2 top-2">
                    <StatusPill status={p.status} />
                  </div>
                  {p.isFeatured && (
                    <span className="absolute bottom-2 start-2 inline-flex items-center gap-1 rounded-pill bg-accent px-2 py-0.5 text-[11px] font-bold text-ink-900">
                      <Sparkles className="size-3" />
                      {t('admin.products.featured')}
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-3">
                  <a href={`/p/${p.slug}`} target="_blank" rel="noopener noreferrer" className="line-clamp-2 text-sm font-semibold text-fg hover:text-primary-700">
                    {p.title}
                  </a>
                  <p className="mt-0.5 truncate text-xs text-fg-muted">{p.storeName ?? '—'}</p>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="font-bold text-fg" dir="ltr">
                      {money(p.priceMin)}
                      {p.priceMax > p.priceMin && <span className="font-normal text-fg-muted"> – {money(p.priceMax)}</span>}
                    </span>
                    <span className="text-xs text-fg-muted">{t('admin.products.stock', { count: p.totalStock })}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-fg-subtle">{formatRelative(p.updatedAt, lang)}</p>
                  {p.moderationNote && <p className="mt-2 rounded-md bg-warning-soft px-2 py-1.5 text-xs text-fg">{p.moderationNote}</p>}
                  <div className="mt-auto flex items-center gap-1.5 pt-3">
                    {isQueue ? (
                      <>
                        <Button size="sm" className="flex-1" leftIcon={<Check className="size-4" />} onClick={() => approve(p)} disabled={post.isPending}>
                          {t('admin.products.approve')}
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1" leftIcon={<X className="size-4" />} onClick={() => setPending({ kind: 'reject', product: p })}>
                          {t('admin.products.reject')}
                        </Button>
                      </>
                    ) : p.status === 'published' ? (
                      <>
                        <Button
                          size="sm"
                          variant={p.isFeatured ? 'accent' : 'outline'}
                          className="flex-1"
                          leftIcon={<Sparkles className="size-4" />}
                          onClick={() => patch.mutate({ path: `products/${p.id}/feature`, body: { isFeatured: !p.isFeatured } }, { onSuccess: () => toast.success(t('admin.common.saved')), onError: fail })}
                        >
                          {p.isFeatured ? t('admin.products.unfeature') : t('admin.products.feature')}
                        </Button>
                        <Button size="sm" variant="ghost" leftIcon={<EyeOff className="size-4" />} onClick={() => setPending({ kind: 'hide', product: p })}>
                          {t('admin.products.hide')}
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              </Card>
            ))}
          </div>
          <LoadMore hasMore={!!list.hasNextPage} loading={list.isFetchingNextPage} onLoadMore={() => void list.fetchNextPage()} />
        </>
      )}

      {pending && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setPending(null)}
          title={t(`admin.products.dlg.${pending.kind}`, { count: selected.length, title: pending.product?.title ?? '' })}
          description={pending.kind === 'bulkApprove' ? undefined : t('admin.products.noteHelp')}
          confirmLabel={pending.kind === 'bulkApprove' ? t('admin.products.approveAll') : pending.kind === 'hide' ? t('admin.products.hide') : t('admin.products.reject')}
          tone={pending.kind === 'bulkApprove' ? 'primary' : 'danger'}
          reasonLabel={pending.kind === 'bulkApprove' ? undefined : t('admin.products.note')}
          reasonRequired={pending.kind !== 'bulkApprove'}
          loading={post.isPending}
          onConfirm={confirm}
        />
      )}
    </>
  );
}

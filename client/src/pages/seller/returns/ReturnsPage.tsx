import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Undo2 } from 'lucide-react';
import { RETURN_STATUSES, type ReturnStatus } from '@souqly/shared';
import { useSellerReturns } from '@/api/returns';
import { Seo } from '@/components/layout/Seo';
import { Card, EmptyState, ErrorState, LoadMore, SectionHeader, Skeleton } from '@/components/ui';
import { ReturnStatusBadge } from '@/components/returns/ReturnBits';
import { useLang } from '@/lib/catalog';
import { cn } from '@/lib/cn';
import { formatDateTime, money } from '@/lib/format';

export default function SellerReturnsPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const [params, setParams] = useSearchParams();
  const raw = params.get('status') as ReturnStatus | null;
  const status = raw && (RETURN_STATUSES as readonly string[]).includes(raw) ? raw : undefined;
  const list = useSellerReturns(status);
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  const counts = list.data?.pages[0]?.meta?.counts;

  return (
    <>
      <Seo title={t('returns.seller.title')} noindex />
      <SectionHeader as="h1" title={t('returns.seller.title')} description={t('returns.seller.subtitle')} />
      <div className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex w-max gap-1 border-b border-border" role="tablist" aria-label={t('returns.seller.title')}>
          {[undefined, ...RETURN_STATUSES].map((s) => (
            <button
              key={s ?? 'all'}
              type="button"
              role="tab"
              aria-selected={status === s}
              onClick={() => setParams(s ? { status: s } : {}, { replace: true })}
              className={cn(
                '-mb-px flex h-10 items-center gap-1.5 border-b-2 px-3 text-sm font-semibold',
                status === s ? 'border-primary text-primary-800' : 'border-transparent text-fg-muted hover:text-fg',
              )}
            >
              {s ? t(`returns.status.${s}`) : t('returns.seller.all')}
              {!!counts?.[s ?? 'all'] && (
                <span className={cn('rounded-pill px-1.5 text-[11px]', s === 'requested' ? 'bg-accent text-ink-900' : 'bg-surface-2')}>{counts[s ?? 'all']}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {list.isPending ? (
        <Card className="space-y-3 p-4" aria-busy>
          {[0, 1, 2, 3].map((k) => (
            <Skeleton key={k} className="h-14 w-full" />
          ))}
        </Card>
      ) : list.isError ? (
        <Card>
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        </Card>
      ) : !rows.length ? (
        <Card>
          <EmptyState icon={<Undo2 />} title={t('returns.seller.empty')} description={t('returns.seller.emptyBody')} />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id}>
                <Link to={`/seller/returns/${r.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
                  <div className="hidden size-12 shrink-0 overflow-hidden rounded-md bg-surface-2 sm:block">
                    {r.items[0]?.image && <img src={r.items[0].image} alt="" className="size-full object-cover" loading="lazy" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-fg" dir="ltr">
                        {r.order.number}
                      </span>
                      <ReturnStatusBadge status={r.status} />
                    </p>
                    <p className="mt-0.5 truncate text-xs text-fg-muted">
                      {r.buyer?.name ?? '—'} · {t('returns.itemsCount', { count: r.items.reduce((n, i) => n + i.qty, 0) })} · {t(`returns.reasons.${r.reason}`)} ·{' '}
                      {formatDateTime(r.createdAt, lang)}
                    </p>
                  </div>
                  <span className="text-end text-sm font-bold text-fg" dir="ltr">
                    {money(r.refund.amount)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <LoadMore hasMore={!!list.hasNextPage} loading={list.isFetchingNextPage} onLoadMore={() => void list.fetchNextPage()} />
        </Card>
      )}
    </>
  );
}

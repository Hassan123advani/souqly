import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, MessageSquareText, Star } from 'lucide-react';
import { flatPages, useProductReviews, useReviewSummary, type ReviewFilters, type ReviewSort } from '@/api/social';
import { EmptyState, ErrorState, LoadMore, Rating, SectionHeader, Select, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { compactNumber } from '@/lib/catalog';
import { ReviewCard } from './ReviewCard';

const SORTS: ReviewSort[] = ['recent', 'helpful', 'rating_high', 'rating_low'];

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-pill border px-3.5 text-sm font-semibold transition-colors',
        active ? 'border-primary bg-primary text-primary-fg' : 'border-border bg-surface text-fg hover:border-border-strong',
      )}
    >
      {children}
    </button>
  );
}

/** PDP reviews: summary with clickable star bars, filters, sort and a paginated list. */
export function ProductReviews({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const [f, setF] = useState<ReviewFilters>({ sort: 'recent' });
  const summary = useReviewSummary(slug);
  const list = useProductReviews(slug, f);
  const reviews = flatPages(list.data);
  const s = summary.data;

  const setRating = (n?: number) => setF((x) => ({ ...x, rating: x.rating === n ? undefined : n }));

  return (
    <section className="mt-10 scroll-mt-24" id="reviews" aria-labelledby="reviews-title">
      <SectionHeader title={<span id="reviews-title">{t('reviews.title')}</span>} />
      <div className="mt-4 grid gap-6 rounded-lg border border-border bg-surface p-4 sm:p-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-10">
        <div className="lg:sticky lg:top-24 lg:self-start">
          {summary.isPending ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-24" />
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-3 w-full" />
              ))}
            </div>
          ) : summary.isError ? (
            <ErrorState error={summary.error} onRetry={() => void summary.refetch()} compact />
          ) : s ? (
            <>
              <div className="flex items-end gap-3">
                <span className="latin text-5xl font-extrabold leading-none text-fg tabular">{s.count ? s.avg.toFixed(1) : '—'}</span>
                <div className="pb-1">
                  <Rating value={s.avg} size="md" />
                  <p className="mt-1 text-xs text-fg-muted">{t('reviews.basedOn', { n: compactNumber(s.count) })}</p>
                </div>
              </div>
              <ul className="mt-5 space-y-1.5">
                {[5, 4, 3, 2, 1].map((n) => {
                  const c = s.breakdown[String(n) as '1'] ?? 0;
                  const pct = s.count ? Math.round((c / s.count) * 100) : 0;
                  const active = f.rating === n;
                  return (
                    <li key={n}>
                      <button
                        type="button"
                        disabled={!c && !active}
                        onClick={() => setRating(n)}
                        aria-pressed={active}
                        aria-label={t('reviews.filterStars', { n, c })}
                        className={cn(
                          'grid w-full grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] items-center gap-2 rounded-sm px-1 py-1 text-xs transition-colors',
                          active ? 'bg-primary-50 ring-1 ring-primary-100' : 'hover:bg-surface-2 disabled:hover:bg-transparent',
                        )}
                      >
                        <span className="latin inline-flex items-center gap-0.5 font-semibold text-fg tabular">
                          {n}
                          <Star className="size-3 fill-accent text-accent" aria-hidden />
                        </span>
                        <span className="h-2 overflow-hidden rounded-pill bg-surface-2">
                          <span className="block h-full rounded-pill bg-accent" style={{ width: `${pct}%` }} />
                        </span>
                        <span className="latin text-end text-fg-muted tabular">{compactNumber(c)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Chip active={!f.rating && !f.withMedia} onClick={() => setF((x) => ({ sort: x.sort }))}>
              {t('reviews.all')}
            </Chip>
            <Chip active={!!f.withMedia} onClick={() => setF((x) => ({ ...x, withMedia: !x.withMedia }))}>
              <Camera className="size-4" aria-hidden />
              {t('reviews.withMedia')}
              {s?.withMedia ? <span className="latin tabular opacity-80">({compactNumber(s.withMedia)})</span> : null}
            </Chip>
            {f.rating && (
              <Chip active onClick={() => setRating(undefined)}>
                {t('reviews.starsN', { n: f.rating })} ×
              </Chip>
            )}
            <div className="ms-auto w-44">
              <Select
                value={f.sort}
                onValueChange={(v) => setF((x) => ({ ...x, sort: v as ReviewSort }))}
                options={SORTS.map((v) => ({ value: v, label: t(`reviews.sort.${v}`) }))}
              />
            </div>
          </div>

          <div className="mt-2 divide-y divide-border">
            {list.isPending ? (
              [0, 1, 2].map((i) => (
                <div key={i} className="space-y-2 py-5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              ))
            ) : list.isError ? (
              <ErrorState error={list.error} onRetry={() => void list.refetch()} compact className="my-6" />
            ) : reviews.length === 0 ? (
              <EmptyState
                compact
                className="my-6"
                icon={<MessageSquareText className="size-6" />}
                title={f.rating || f.withMedia ? t('reviews.noMatch') : t('reviews.none')}
                description={f.rating || f.withMedia ? undefined : t('reviews.noneHint')}
              />
            ) : (
              reviews.map((r) => <ReviewCard key={r.id} r={r} slug={slug} />)
            )}
          </div>
          <LoadMore hasMore={!!list.hasNextPage} loading={list.isFetchingNextPage} onLoadMore={() => void list.fetchNextPage()} className="mt-2" />
        </div>
      </div>
    </section>
  );
}

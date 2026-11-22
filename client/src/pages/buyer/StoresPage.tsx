import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BadgeCheck, Search, Store } from 'lucide-react';
import { STORE_SORTS, type StoreSort } from '@souqly/shared';
import { useStores } from '@/api/catalog';
import { Seo } from '@/components/layout/Seo';
import { Button, Container, EmptyState, ErrorState, Input, Select } from '@/components/ui';
import { LoadMore } from '@/components/product/ProductGrid';
import { StoreCard, StoreCardSkeleton } from '@/components/product/StoreCard';
import { useDebounced } from '@/hooks/useDebounced';
import { withParam } from '@/lib/listingParams';

/** `/stores` directory and `/mall` (verified Mall stores only). */
export default function StoresPage({ mall }: { mall?: boolean }) {
  const { t } = useTranslation();
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const debounced = useDebounced(q, 300);
  const sortParam = sp.get('sort');
  const sort: StoreSort = sortParam && (STORE_SORTS as readonly string[]).includes(sortParam) ? (sortParam as StoreSort) : 'followers';

  useEffect(() => {
    const cur = sp.get('q') ?? '';
    if (debounced.trim() !== cur) setSp(withParam(sp, 'q', debounced.trim() || null), { replace: true });
  }, [debounced, sp, setSp]);

  const stores = useStores({ q: sp.get('q') ?? undefined, mall, sort });
  const list = stores.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <Container className="pb-8 pt-4 sm:pt-6">
      <Seo
        title={mall ? t('stores.mallTitle') : t('stores.title')}
        description={mall ? t('stores.mallMeta') : t('stores.meta')}
        canonical={mall ? '/mall' : '/stores'}
      />
      {mall ? (
        <header className="dark relative overflow-hidden rounded-xl bg-[#0B2826] p-6 text-fg shadow-pop sm:p-10">
          <div className="absolute inset-0 bg-[radial-gradient(60%_90%_at_90%_0%,rgba(242,169,59,.28),transparent_60%)]" />
          <div className="souq-pattern absolute inset-0 opacity-50 [mask-image:linear-gradient(90deg,transparent_30%,#000)]" />
          <div className="relative max-w-2xl">
            <p className="inline-flex items-center gap-2 rounded-pill bg-white/5 px-3 py-1 text-xs font-bold text-accent ring-1 ring-white/10">
              <BadgeCheck className="size-4" aria-hidden />
              {t('stores.mallEyebrow')}
            </p>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-ink-950 sm:text-4xl">{t('stores.mallTitle')}</h1>
            <p className="mt-2 text-fg-muted">{t('stores.mallBody')}</p>
          </div>
        </header>
      ) : (
        <header>
          <h1 className="text-2xl font-extrabold tracking-tight text-fg sm:text-3xl">{t('stores.title')}</h1>
          <p className="mt-1 text-sm text-fg-muted">{t('stores.body')}</p>
        </header>
      )}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1 sm:max-w-md">
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('stores.searchPlaceholder')}
            aria-label={t('stores.searchPlaceholder')}
            startIcon={<Search className="size-4" />}
            maxLength={60}
          />
        </div>
        <Select
          aria-label={t('listing.sortBy')}
          value={sort}
          onValueChange={(v) => setSp(withParam(sp, 'sort', v === 'followers' ? null : v), { replace: true })}
          options={STORE_SORTS.map((s) => ({ value: s, label: t(`stores.sort.${s}`) }))}
          className="sm:w-56"
        />
      </div>

      <div className="mt-6">
        {stores.error && !list.length ? (
          <ErrorState error={stores.error} onRetry={() => stores.refetch()} className="rounded-lg border border-border bg-surface" />
        ) : stores.isPending ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy>
            {Array.from({ length: 8 }).map((_, i) => (
              <StoreCardSkeleton key={i} />
            ))}
          </div>
        ) : !list.length ? (
          <EmptyState
            icon={<Store />}
            title={t('stores.emptyTitle')}
            description={sp.get('q') ? t('stores.emptySearch') : t('stores.emptyBody')}
            action={
              sp.get('q') ? (
                <Button variant="outline" onClick={() => setQ('')}>
                  {t('search.clear')}
                </Button>
              ) : undefined
            }
            className="rounded-lg border border-dashed border-border-strong bg-surface"
          />
        ) : (
          <>
            <ul className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ${stores.isPlaceholderData ? 'opacity-60' : ''}`}>
              {list.map((s) => (
                <li key={s.id} className="flex">
                  <StoreCard store={s} />
                </li>
              ))}
            </ul>
            <LoadMore hasMore={!!stores.hasNextPage} loading={stores.isFetchingNextPage} onLoadMore={() => void stores.fetchNextPage()} shown={list.length} />
          </>
        )}
      </div>
    </Container>
  );
}

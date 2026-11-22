import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Lightbulb, Package, SearchX, Sparkles, Store, TrendingUp } from 'lucide-react';
import type { ProductListMeta } from '@souqly/shared';
import { useCategoryTree, useJustForYou, useProductList, useStores, useTrendingSearches } from '@/api/catalog';
import { Seo } from '@/components/layout/Seo';
import { Button, Container, EmptyState, ErrorState, SectionHeader, Skeleton } from '@/components/ui';
import { ProductListing } from '@/components/catalog/ProductListing';
import { CategoryTile } from '@/components/catalog/CategoryIcon';
import { ProductRail } from '@/components/product/Rail';
import { LoadMore } from '@/components/product/ProductGrid';
import { StoreCard, StoreCardSkeleton } from '@/components/product/StoreCard';
import { cn } from '@/lib/cn';
import { useLocalized } from '@/lib/catalog';
import { pushRecentSearch } from '@/lib/recentSearches';
import { toApiParams } from '@/lib/listingParams';

function TrendingChips({ title }: { title?: string }) {
  const { t } = useTranslation();
  const { data } = useTrendingSearches();
  if (!data?.length) return null;
  return (
    <section className="mt-8">
      <h2 className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-fg">
        <TrendingUp className="size-4 text-accent-700" aria-hidden />
        {title ?? t('search.trending')}
      </h2>
      <ul className="flex flex-wrap gap-2">
        {data.map((q) => (
          <li key={q}>
            <Link
              to={`/search?q=${encodeURIComponent(q)}`}
              onClick={() => pushRecentSearch(q)}
              className="inline-flex h-9 items-center rounded-pill border border-border bg-surface px-4 text-sm text-fg transition hover:border-primary-500 hover:text-primary-800"
            >
              {q}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PopularCategories() {
  const { t } = useTranslation();
  const localized = useLocalized();
  const { data, isLoading } = useCategoryTree();
  return (
    <section className="mt-10">
      <SectionHeader title={t('search.popularCategories')} />
      <ul className="grid grid-cols-4 gap-x-3 gap-y-5 sm:grid-cols-6 lg:grid-cols-8">
        {isLoading || !data
          ? Array.from({ length: 8 }).map((_, i) => (
              <li key={i}>
                <Skeleton className="mx-auto aspect-[5/6] w-full max-w-[88px] rounded-t-[999px]" />
              </li>
            ))
          : data.slice(0, 16).map((c) => (
              <li key={c.id}>
                <CategoryTile to={`/c/${c.slug}`} name={localized(c.name)} icon={c.icon} color={c.color} />
              </li>
            ))}
      </ul>
    </section>
  );
}

function Recommended() {
  const { t } = useTranslation();
  const feed = useJustForYou();
  return (
    <ProductRail
      title={t('search.recommended')}
      eyebrow={t('home.forYou.eyebrow')}
      products={feed.data?.pages[0]?.data}
      loading={feed.isPending}
      error={feed.error}
      onRetry={() => feed.refetch()}
    />
  );
}

function NoResults({ q, meta, hasFilters, clear }: { q: string; meta?: ProductListMeta; hasFilters: boolean; clear: () => void }) {
  const { t } = useTranslation();
  const tips = [t('search.tip1'), t('search.tip2'), t('search.tip3')];
  return (
    <div>
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="grid gap-6 p-6 sm:p-8 md:grid-cols-[1fr_1fr]">
          <div>
            <span className="grid size-14 place-items-center rounded-t-[1.75rem] rounded-b-lg bg-primary-50 text-primary-700 ring-1 ring-primary-100">
              <SearchX className="size-6" aria-hidden />
            </span>
            <h2 className="mt-4 text-xl font-extrabold tracking-tight text-fg">{t('search.noResultsTitle', { q })}</h2>
            <p className="mt-1.5 text-sm text-fg-muted">{hasFilters ? t('search.noResultsFiltered') : t('search.noResultsBody')}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {meta?.didYouMean && (
                <Button to={`/search?q=${encodeURIComponent(meta.didYouMean)}`}>{t('search.tryInstead', { q: meta.didYouMean })}</Button>
              )}
              {hasFilters && (
                <Button variant="outline" onClick={clear}>
                  {t('listing.clearAll')}
                </Button>
              )}
              <Button to="/categories" variant="outline">
                {t('catalog.browseCategories')}
              </Button>
            </div>
          </div>
          <div className="rounded-lg bg-surface-2/60 p-5">
            <h3 className="inline-flex items-center gap-2 text-sm font-bold text-fg">
              <Lightbulb className="size-4 text-accent-700" aria-hidden />
              {t('search.tipsTitle')}
            </h3>
            <ul className="mt-3 space-y-2 text-sm text-fg-muted">
              {tips.map((tip) => (
                <li key={tip} className="flex gap-2">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <TrendingChips title={t('search.trySearching')} />
      <PopularCategories />
      <Recommended />
    </div>
  );
}

function StoresTab({ q }: { q: string }) {
  const { t } = useTranslation();
  const stores = useStores({ q }, !!q);
  const list = stores.data?.pages.flatMap((p) => p.data) ?? [];
  if (stores.error && !list.length)
    return <ErrorState error={stores.error} onRetry={() => stores.refetch()} className="rounded-lg border border-border bg-surface" />;
  if (stores.isPending)
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy>
        {Array.from({ length: 8 }).map((_, i) => (
          <StoreCardSkeleton key={i} />
        ))}
      </div>
    );
  if (!list.length)
    return (
      <EmptyState
        icon={<Store />}
        title={t('search.noStoresTitle', { q })}
        description={t('search.noStoresBody')}
        action={<Button to="/stores">{t('stores.browseAll')}</Button>}
        className="rounded-lg border border-dashed border-border-strong bg-surface"
      />
    );
  return (
    <>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {list.map((s) => (
          <li key={s.id} className="flex">
            <StoreCard store={s} />
          </li>
        ))}
      </ul>
      <LoadMore hasMore={!!stores.hasNextPage} loading={stores.isFetchingNextPage} onLoadMore={() => void stores.fetchNextPage()} shown={list.length} />
    </>
  );
}

export default function SearchPage() {
  const { t } = useTranslation();
  const [sp, setSp] = useSearchParams();
  const q = (sp.get('q') ?? '').trim();
  const tab = sp.get('tab') === 'stores' ? 'stores' : 'products';

  // Same params/key as ProductListing, so this shares its cache (no extra request).
  const params = useMemo(() => toApiParams(sp), [sp]);
  const products = useProductList(params, { enabled: !!q && tab === 'products' });
  const meta = products.data?.pages[0]?.meta;
  const hasResults = (products.data?.pages[0]?.data.length ?? 0) > 0;

  // No query but a sort/filter (e.g. "View all" from home rails): browse the whole catalogue.
  if (!q && [...sp.keys()].some((k) => k !== 'tab')) {
    return (
      <Container className="pb-8 pt-4 sm:pt-6">
        <Seo title={t('search.allProducts')} noindex />
        <h1 className="mb-5 text-2xl font-extrabold tracking-tight text-fg sm:text-3xl">{t('search.allProducts')}</h1>
        <ProductListing />
      </Container>
    );
  }

  if (!q) {
    return (
      <Container className="pb-8 pt-6">
        <Seo title={t('header.search')} noindex />
        <SectionHeader as="h1" title={t('search.landingTitle')} description={t('search.landingBody')} />
        <TrendingChips />
        <PopularCategories />
        <Recommended />
      </Container>
    );
  }

  const setTab = (next: 'products' | 'stores') => {
    const n = new URLSearchParams();
    n.set('q', q);
    if (next === 'stores') n.set('tab', 'stores');
    setSp(n);
  };

  return (
    <Container className="pb-8 pt-4 sm:pt-6">
      <Seo title={t('search.title', { q })} description={t('search.metaDescription', { q })} noindex />
      <h1 className="text-xl font-extrabold tracking-tight text-fg sm:text-2xl">
        {t('search.resultsFor')} <span className="text-primary-700">“{q}”</span>
      </h1>

      {meta?.didYouMean && hasResults && (
        <p className="mt-2 inline-flex flex-wrap items-center gap-1.5 rounded-md bg-accent-50 px-3 py-2 text-sm text-fg ring-1 ring-accent-100">
          <Sparkles className="size-4 text-accent-700" aria-hidden />
          {t('search.showingFor')}{' '}
          <Link to={`/search?q=${encodeURIComponent(meta.didYouMean)}`} className="font-bold text-primary-700 underline-offset-4 hover:underline">
            {t('search.didYouMeanQ', { q: meta.didYouMean })}
          </Link>
        </p>
      )}

      <div role="tablist" aria-label={t('search.resultTabs')} className="mt-5 flex gap-1 border-b border-border">
        {(
          [
            ['products', Package, t('search.products')],
            ['stores', Store, t('search.stores')],
          ] as const
        ).map(([key, Icon, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`tab-${key}`}
            aria-selected={tab === key}
            aria-controls={`panel-${key}`}
            onClick={() => setTab(key)}
            className={cn(
              '-mb-px inline-flex h-11 items-center gap-2 border-b-2 px-4 text-sm font-semibold transition-colors',
              tab === key ? 'border-primary text-primary-800' : 'border-transparent text-fg-muted hover:text-fg',
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
            {key === 'products' && meta?.total !== undefined && (
              <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-[11px] tabular">{meta.total.toLocaleString('en')}</span>
            )}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="mt-5">
        {tab === 'products' ? (
          <ProductListing renderEmpty={(m, hasFilters, clear) => <NoResults q={q} meta={m} hasFilters={hasFilters} clear={clear} />} />
        ) : (
          <StoresTab q={q} />
        )}
      </div>
    </Container>
  );
}

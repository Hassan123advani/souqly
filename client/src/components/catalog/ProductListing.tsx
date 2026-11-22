import { useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutGrid, List, PackageSearch, SlidersHorizontal, X } from 'lucide-react';
import type { AttributeDef, ProductListMeta, ProductSort } from '@souqly/shared';
import { Button, EmptyState, ErrorState, Select, Sheet } from '@/components/ui';
import { useProductList } from '@/api/catalog';
import { LoadMore, ProductGrid, ProductGridSkeleton, type GridDensity } from '@/components/product/ProductGrid';
import { cn } from '@/lib/cn';
import { money } from '@/lib/format';
import { useLocalized } from '@/lib/catalog';
import {
  BOOL_FILTERS,
  attrKeysIn,
  attrParam,
  clearFilters,
  countActiveFilters,
  readCsv,
  readSort,
  toApiParams,
  toggleCsvValue,
  withParam,
} from '@/lib/listingParams';
import { useListingPrefs } from '@/stores/listing';
import { FilterPanel, type Facets, type HiddenFilter } from './FilterPanel';

const SORTS: ProductSort[] = ['relevance', 'best_selling', 'newest', 'top_rated', 'price_asc', 'price_desc', 'discount'];

type Chip = { key: string; label: string; next: URLSearchParams };

function useChips(sp: URLSearchParams, facets: Facets | undefined, attributes: AttributeDef[]): Chip[] {
  const { t } = useTranslation();
  const localized = useLocalized();
  return useMemo(() => {
    const chips: Chip[] = [];
    const brandName = (slug: string) => facets?.brands.find((b) => b.slug === slug)?.name ?? slug;
    for (const b of readCsv(sp, 'brand')) chips.push({ key: `brand-${b}`, label: brandName(b), next: toggleCsvValue(sp, 'brand', b) });
    const lo = sp.get('priceMin');
    const hi = sp.get('priceMax');
    if (lo || hi) {
      const fmt = (v: string) => money(Number(v) * 100);
      const label = lo && hi ? `${fmt(lo)} – ${fmt(hi)}` : lo ? t('listing.priceFrom', { p: fmt(lo) }) : t('listing.priceTo', { p: fmt(hi!) });
      chips.push({ key: 'price', label, next: withParam(withParam(sp, 'priceMin', null), 'priceMax', null) });
    }
    if (sp.get('rating')) chips.push({ key: 'rating', label: t('listing.ratingChip', { n: sp.get('rating') }), next: withParam(sp, 'rating', null) });
    if (sp.get('discount')) chips.push({ key: 'discount', label: t('listing.discountMin', { n: sp.get('discount') }), next: withParam(sp, 'discount', null) });
    if (sp.get('city')) chips.push({ key: 'city', label: sp.get('city')!, next: withParam(sp, 'city', null) });
    const boolLabels: Record<(typeof BOOL_FILTERS)[number], string> = {
      freeShipping: t('product.freeShipping'),
      cod: t('product.cod'),
      inStock: t('listing.inStock'),
      mall: t('listing.mallOnly'),
    };
    for (const k of BOOL_FILTERS) if (sp.get(k) === '1') chips.push({ key: k, label: boolLabels[k], next: withParam(sp, k, null) });
    for (const c of readCsv(sp, 'color')) chips.push({ key: `color-${c}`, label: c, next: toggleCsvValue(sp, 'color', c) });
    for (const s of readCsv(sp, 'size')) chips.push({ key: `size-${s}`, label: `${t('listing.size')}: ${s}`, next: toggleCsvValue(sp, 'size', s) });
    for (const key of attrKeysIn(sp)) {
      const def = attributes.find((a) => a.key === key);
      for (const v of readCsv(sp, attrParam(key)))
        chips.push({ key: `a-${key}-${v}`, label: def ? `${localized(def.label)}: ${v}` : v, next: toggleCsvValue(sp, attrParam(key), v) });
    }
    return chips;
  }, [sp, facets, attributes, t, localized]);
}

/**
 * Product listing with URL-driven filters, sort, grid/list view, active chips and infinite scroll.
 * Shared by category, search, brand, mall and store "All products" pages.
 */
export function ProductListing({
  path,
  extraParams,
  attributes = [],
  hidden,
  defaultSort = 'relevance',
  sorts = SORTS,
  density = 'default',
  toolbarStart,
  renderEmpty,
  enabled = true,
}: {
  path?: string;
  extraParams?: Record<string, string | undefined>;
  attributes?: AttributeDef[];
  hidden?: HiddenFilter[];
  defaultSort?: ProductSort;
  sorts?: ProductSort[];
  density?: GridDensity;
  toolbarStart?: ReactNode;
  /** Custom empty state; receives the first-page meta (e.g. didYouMean). */
  renderEmpty?: (meta: ProductListMeta | undefined, hasFilters: boolean, clear: () => void) => ReactNode;
  enabled?: boolean;
}) {
  const { t } = useTranslation();
  const [sp, setSp] = useSearchParams();
  const view = useListingPrefs((s) => s.view);
  const setView = useListingPrefs((s) => s.setView);
  const [sheet, setSheet] = useState(false);

  const params = useMemo(() => toApiParams(sp, extraParams), [sp, extraParams]);
  const list = useProductList(params, { path, enabled });
  const firstMeta = list.data?.pages[0]?.meta;
  const products = useMemo(() => list.data?.pages.flatMap((p) => p.data) ?? [], [list.data]);
  const total = firstMeta?.total;
  const facets = firstMeta?.facets;
  const active = countActiveFilters(sp);
  const chips = useChips(sp, facets, attributes);
  const sort = readSort(sp, defaultSort);

  const update = (next: URLSearchParams) => setSp(next, { preventScrollReset: true });
  const clearAll = () => update(clearFilters(sp));

  const panel = <FilterPanel sp={sp} setSp={update} facets={facets} attributes={attributes} hidden={hidden} />;
  const loadingFirst = list.isPending || (list.isPlaceholderData && !products.length);

  return (
    <div className="lg:grid lg:grid-cols-[260px_1fr] lg:gap-8">
      <aside className="hidden lg:block" aria-label={t('listing.filters')}>
        <div className="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto rounded-lg border border-border bg-surface px-4 py-1">
          <div className="flex items-center justify-between border-b border-border py-3">
            <h2 className="inline-flex items-center gap-2 text-sm font-extrabold text-fg">
              <SlidersHorizontal className="size-4" aria-hidden />
              {t('listing.filters')}
            </h2>
            {active > 0 && (
              <button type="button" onClick={clearAll} className="text-xs font-semibold text-primary-700 hover:underline">
                {t('listing.clearAll')}
              </button>
            )}
          </div>
          {panel}
        </div>
      </aside>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {toolbarStart}
          <p className="me-auto text-sm text-fg-muted" aria-live="polite">
            {total !== undefined ? t('listing.results', { n: total.toLocaleString('en') }) : loadingFirst ? t('common.loading') : null}
          </p>
          <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setSheet(true)} leftIcon={<SlidersHorizontal className="size-4" />}>
            {t('listing.filters')}
            {active > 0 && <span className="grid size-5 place-items-center rounded-full bg-primary text-[10px] text-primary-fg tabular">{active}</span>}
          </Button>
          <Select
            aria-label={t('listing.sortBy')}
            value={sort}
            onValueChange={(v) => update(withParam(sp, 'sort', v === defaultSort ? null : v))}
            options={sorts.map((s) => ({ value: s, label: t(`listing.sort.${s}`) }))}
            className="h-9 w-auto min-w-[10.5rem] rounded-pill"
          />
          <div className="hidden items-center rounded-pill border border-border bg-surface p-0.5 sm:flex" role="group" aria-label={t('listing.view')}>
            {(
              [
                ['grid', LayoutGrid],
                ['list', List],
              ] as const
            ).map(([v, Icon]) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                aria-label={t(`listing.view_${v}`)}
                title={t(`listing.view_${v}`)}
                className={cn(
                  'grid size-8 place-items-center rounded-full transition-colors',
                  view === v ? 'bg-primary text-primary-fg' : 'text-fg-muted hover:text-fg',
                )}
              >
                <Icon className="size-4" />
              </button>
            ))}
          </div>
        </div>

        {chips.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {chips.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => update(c.next)}
                className="inline-flex items-center gap-1.5 rounded-pill border border-primary-200 bg-primary-50 py-1 pe-2 ps-3 text-xs font-semibold text-primary-800 transition-colors hover:border-primary-400"
                aria-label={t('listing.removeFilter', { name: c.label })}
              >
                <span dir="auto">{c.label}</span>
                <X className="size-3.5" aria-hidden />
              </button>
            ))}
            <button type="button" onClick={clearAll} className="px-1 text-xs font-semibold text-fg-muted underline-offset-4 hover:text-fg hover:underline">
              {t('listing.clearAll')}
            </button>
          </div>
        )}

        <div className={cn('mt-4 transition-opacity', list.isPlaceholderData && products.length > 0 && 'pointer-events-none opacity-60')} aria-busy={list.isFetching}>
          {list.error && !products.length ? (
            <ErrorState error={list.error} onRetry={() => list.refetch()} className="rounded-lg border border-border bg-surface" />
          ) : loadingFirst ? (
            <ProductGridSkeleton count={view === 'list' ? 6 : 10} variant={view} density={density} />
          ) : products.length === 0 ? (
            (renderEmpty?.(firstMeta, active > 0, clearAll) ?? (
              <EmptyState
                icon={<PackageSearch />}
                title={t('listing.emptyTitle')}
                description={active > 0 ? t('listing.emptyFiltered') : t('listing.emptyBody')}
                action={active > 0 ? <Button onClick={clearAll}>{t('listing.clearAll')}</Button> : undefined}
                className="rounded-lg border border-dashed border-border-strong bg-surface"
              />
            ))
          ) : (
            <>
              <ProductGrid products={products} variant={view} density={density} />
              <LoadMore
                hasMore={!!list.hasNextPage}
                loading={list.isFetchingNextPage}
                onLoadMore={() => void list.fetchNextPage()}
                shown={products.length}
                total={total}
              />
              {list.error && <ErrorState compact error={list.error} onRetry={() => list.fetchNextPage()} />}
            </>
          )}
        </div>
      </div>

      <Sheet open={sheet} onOpenChange={setSheet} side="bottom" title={t('listing.filters')}>
        <div className="px-4 pb-24">{panel}</div>
        <div className="safe-bottom sticky bottom-0 flex gap-2 border-t border-border bg-surface p-3">
          <Button variant="outline" className="flex-1" onClick={clearAll} disabled={!active}>
            {t('listing.clearAll')}
          </Button>
          <Button className="flex-[2]" onClick={() => setSheet(false)} loading={list.isFetching && !list.isFetchingNextPage}>
            {total !== undefined ? t('listing.showResults', { n: total.toLocaleString('en') }) : t('listing.apply')}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

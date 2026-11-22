import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BrandDTO,
  CampaignDTO,
  CategoryDetail,
  CategoryNode,
  FlashSaleDTO,
  HomePayload,
  ProductCard,
  ProductDetail,
  ProductListMeta,
  SearchSuggest,
  StoreCard,
  StorePublic,
  StoreSort,
} from '@souqly/shared';
import { api, del, get, getErrorStatus } from './client';
import { useMe } from './auth';
import type { CursorMeta, StoreCategoryCount } from './types';
import { readRecentlyViewed } from '@/lib/recentlyViewed';

/** Page size for product grids and feeds. */
export const PAGE_SIZE = 24;

type Page<T, M> = { data: T[]; meta: M };

async function getPage<T, M>(url: string, params: Record<string, string | number | undefined>): Promise<Page<T, M>> {
  const clean: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') clean[k] = v;
  const res = await api.get<Page<T, M>>(url, { params: clean });
  return { data: res.data.data ?? [], meta: res.data.meta };
}

/** 404s are final; retry other failures once. */
const retryUnless404 = (count: number, err: unknown) => getErrorStatus(err) !== 404 && count < 1;

export const catalogKeys = {
  home: ['home'] as const,
  categories: ['catalog', 'categories'] as const,
  category: (slug: string) => ['catalog', 'category', slug] as const,
  brands: (featured: boolean) => ['catalog', 'brands', featured] as const,
  brand: (slug: string) => ['catalog', 'brand', slug] as const,
  products: (path: string, params: Record<string, string>) => ['products', path, params] as const,
  product: (slug: string) => ['product', slug] as const,
  productRail: (slug: string, kind: string) => ['product', slug, kind] as const,
  feed: ['products', 'feed'] as const,
  suggest: (q: string) => ['search', 'suggest', q] as const,
  trending: ['search', 'trending'] as const,
  history: ['search', 'history'] as const,
  stores: (params: Record<string, string>) => ['stores', params] as const,
  store: (slug: string) => ['store', slug] as const,
  storeCategories: (slug: string) => ['store', slug, 'categories'] as const,
  flash: ['flash-sale', 'current'] as const,
  campaign: (slug: string) => ['campaign', slug] as const,
  recentlyViewed: ['recently-viewed'] as const,
};

// ---- Home & catalog -----------------------------------------------------------------------

export function useHome() {
  return useQuery({ queryKey: catalogKeys.home, queryFn: () => get<HomePayload>('/home'), staleTime: 30_000 });
}

export function useCategoryTree() {
  return useQuery({
    queryKey: catalogKeys.categories,
    queryFn: () => get<CategoryNode[]>('/catalog/categories'),
    staleTime: 5 * 60_000,
  });
}

export function useCategory(slug: string | undefined) {
  return useQuery({
    queryKey: catalogKeys.category(slug ?? ''),
    queryFn: () => get<CategoryDetail>(`/catalog/categories/${encodeURIComponent(slug!)}`),
    enabled: !!slug,
    staleTime: 60_000,
    retry: retryUnless404,
  });
}

export function useBrand(slug: string | undefined) {
  return useQuery({
    queryKey: catalogKeys.brand(slug ?? ''),
    queryFn: () => get<BrandDTO>(`/catalog/brands/${encodeURIComponent(slug!)}`),
    enabled: !!slug,
    staleTime: 5 * 60_000,
    retry: retryUnless404,
  });
}

export function useBrands(featured = false) {
  return useQuery({
    queryKey: catalogKeys.brands(featured),
    queryFn: () => get<BrandDTO[]>('/catalog/brands', { params: featured ? { featured: 1 } : {} }),
    staleTime: 5 * 60_000,
  });
}

// ---- Products -------------------------------------------------------------------------------

/**
 * Infinite product listing. `path` is `/products` or `/stores/:slug/products`; params come from
 * `toApiParams()`. Facets and total are requested on the first page only.
 */
export function useProductList(params: Record<string, string>, opts: { path?: string; enabled?: boolean; facets?: boolean } = {}) {
  const path = opts.path ?? '/products';
  return useInfiniteQuery({
    queryKey: catalogKeys.products(path, params),
    queryFn: ({ pageParam }) =>
      getPage<ProductCard, ProductListMeta>(path, {
        ...params,
        limit: PAGE_SIZE,
        cursor: pageParam,
        facets: !pageParam && opts.facets !== false ? 1 : undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
    enabled: opts.enabled ?? true,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

/** A short, non-infinite product list for rails and store sections. */
export function useProductsPreview(path: string, params: Record<string, string>, enabled = true) {
  return useQuery({
    queryKey: ['products', 'preview', path, params],
    queryFn: () => getPage<ProductCard, ProductListMeta>(path, params).then((p) => p.data),
    enabled,
    staleTime: 60_000,
  });
}

export function useProduct(slug: string | undefined) {
  return useQuery({
    queryKey: catalogKeys.product(slug ?? ''),
    queryFn: () => get<ProductDetail>(`/products/${encodeURIComponent(slug!)}`),
    enabled: !!slug,
    staleTime: 30_000,
    retry: retryUnless404,
  });
}

function useProductRail(slug: string | undefined, kind: 'related' | 'more-from-store' | 'bought-together') {
  return useQuery({
    queryKey: catalogKeys.productRail(slug ?? '', kind),
    queryFn: () => get<ProductCard[]>(`/products/${encodeURIComponent(slug!)}/${kind}`),
    enabled: !!slug,
    staleTime: 60_000,
  });
}
export const useRelatedProducts = (slug?: string) => useProductRail(slug, 'related');
export const useMoreFromStore = (slug?: string) => useProductRail(slug, 'more-from-store');
export const useBoughtTogether = (slug?: string) => useProductRail(slug, 'bought-together');

export function useJustForYou() {
  return useInfiniteQuery({
    queryKey: catalogKeys.feed,
    queryFn: ({ pageParam }) => getPage<ProductCard, CursorMeta>('/products/feed/just-for-you', { cursor: pageParam, limit: PAGE_SIZE }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
    staleTime: 60_000,
  });
}

// ---- Search ---------------------------------------------------------------------------------

/** Pass an already-debounced term (see `useDebounced`, 200 ms). */
export function useSearchSuggest(q: string) {
  const term = q.trim();
  return useQuery({
    queryKey: catalogKeys.suggest(term.toLowerCase()),
    queryFn: ({ signal }) => get<SearchSuggest>('/search/suggest', { params: { q: term }, signal }),
    enabled: term.length >= 1,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function useTrendingSearches() {
  return useQuery({ queryKey: catalogKeys.trending, queryFn: () => get<string[]>('/search/trending'), staleTime: 5 * 60_000 });
}

export function useSearchHistory() {
  const { data: me } = useMe();
  return useQuery({
    queryKey: catalogKeys.history,
    queryFn: () => get<string[]>('/search/history'),
    enabled: !!me,
    staleTime: 60_000,
  });
}

export function useClearSearchHistory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => del('/search/history'),
    onSuccess: () => qc.setQueryData(catalogKeys.history, []),
  });
}

// ---- Stores ---------------------------------------------------------------------------------

export function useStores(params: { q?: string; mall?: boolean; sort?: StoreSort }, enabled = true) {
  const p: Record<string, string> = {};
  if (params.q?.trim()) p.q = params.q.trim();
  if (params.mall) p.mall = '1';
  if (params.sort) p.sort = params.sort;
  return useInfiniteQuery({
    queryKey: catalogKeys.stores(p),
    queryFn: ({ pageParam }) => getPage<StoreCard, CursorMeta>('/stores', { ...p, cursor: pageParam, limit: PAGE_SIZE }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
    enabled,
    staleTime: 60_000,
  });
}

export function useStore(slug: string | undefined) {
  return useQuery({
    queryKey: catalogKeys.store(slug ?? ''),
    queryFn: () => get<StorePublic>(`/stores/${encodeURIComponent(slug!)}`),
    enabled: !!slug,
    staleTime: 60_000,
    retry: retryUnless404,
  });
}

export function useStoreCategories(slug: string | undefined) {
  return useQuery({
    queryKey: catalogKeys.storeCategories(slug ?? ''),
    queryFn: () => get<StoreCategoryCount[]>(`/stores/${encodeURIComponent(slug!)}/categories`),
    enabled: !!slug,
    staleTime: 60_000,
  });
}

// ---- Marketing ------------------------------------------------------------------------------

export function useFlashSale() {
  return useQuery({ queryKey: catalogKeys.flash, queryFn: () => get<FlashSaleDTO | null>('/flash-sales/current'), staleTime: 30_000 });
}

export function useCampaign(slug: string | undefined) {
  return useQuery({
    queryKey: catalogKeys.campaign(slug ?? ''),
    queryFn: () => get<CampaignDTO>(`/campaigns/${encodeURIComponent(slug!)}`),
    enabled: !!slug,
    staleTime: 60_000,
    retry: retryUnless404,
  });
}

// ---- Recently viewed ------------------------------------------------------------------------

/** Server list when signed in (local list if the server has none yet); localStorage for guests. */
export function useRecentlyViewed() {
  const { data: me, isLoading: meLoading } = useMe();
  return useQuery({
    queryKey: [...catalogKeys.recentlyViewed, me?.id ?? 'guest'],
    queryFn: async () => {
      if (!me) return readRecentlyViewed();
      const server = await get<ProductCard[]>('/recently-viewed');
      return server.length ? server : readRecentlyViewed();
    },
    enabled: !meLoading,
    staleTime: 30_000,
  });
}

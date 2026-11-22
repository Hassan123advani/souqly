import {
  brandListQuerySchema,
  feedQuerySchema,
  productListQuerySchema,
  searchSuggestQuerySchema,
  storeListQuerySchema,
  type ProductListQuery,
  type StoreListQuery,
} from '@souqly/shared';
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler';
import { optionalAuth, requireAuth } from '../../middleware/auth';
import { rateLimits } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import { findApprovedStore, getStorePublic, listStores, storeCategories } from '../stores/stores.service';
import { getBrand, getCategoryDetail, getCategoryTree, listBrands } from './catalog.service';
import { getCampaign, getCurrentFlashSale, getHome, suggest } from './home.service';
import {
  boughtTogether,
  getProductDetail,
  justForYou,
  listProducts,
  listRecentlyViewed,
  moreFromStore,
  relatedProducts,
} from './product.service';
import { clearSearchHistory, searchHistory, trendingSearches } from './search.service';

/** Public marketplace API (docs/api-catalog.md). Mounted at /api/v1. */
export const marketplaceRouter = Router();

const slugParams = z.object({ slug: z.string().trim().toLowerCase().min(1).max(120).regex(/^[a-z0-9-]+$/, 'Invalid slug') });

/** Short public caching for anonymous GETs (the API default is no-store). */
const publicCache = (seconds: number) => (req: { cookies?: Record<string, string> }, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
  if (!req.cookies?.sq_at) res.setHeader('Cache-Control', `public, max-age=${seconds}`);
  next();
};

// ---- catalog ----
marketplaceRouter.get(
  '/catalog/categories',
  publicCache(60),
  asyncHandler(async (_req, res) => {
    res.json({ data: await getCategoryTree() });
  }),
);

marketplaceRouter.get(
  '/catalog/categories/:slug',
  validate({ params: slugParams }),
  asyncHandler(async (req, res) => {
    res.json({ data: await getCategoryDetail(req.params.slug!) });
  }),
);

marketplaceRouter.get(
  '/catalog/brands',
  validate({ query: brandListQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as z.infer<typeof brandListQuerySchema>;
    res.json({ data: await listBrands(q.featured) });
  }),
);

marketplaceRouter.get(
  '/catalog/brands/:slug',
  validate({ params: slugParams }),
  asyncHandler(async (req, res) => {
    res.json({ data: await getBrand(req.params.slug!) });
  }),
);

// ---- products ----
marketplaceRouter.get(
  '/products',
  optionalAuth,
  validate({ query: productListQuerySchema }),
  asyncHandler(async (req, res) => {
    const { cards, meta } = await listProducts(req.query as unknown as ProductListQuery, { userId: req.user?.id });
    res.json({ data: cards, meta });
  }),
);

marketplaceRouter.get(
  '/products/feed/just-for-you',
  optionalAuth,
  validate({ query: feedQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof feedQuerySchema>;
    const { cards, meta } = await justForYou(req.user?.id, q.cursor, q.limit);
    res.json({ data: cards, meta });
  }),
);

marketplaceRouter.get(
  '/products/:slug',
  optionalAuth,
  validate({ params: slugParams }),
  asyncHandler(async (req, res) => {
    const viewerKey = req.user?.sessionId ?? `ip:${req.ip ?? 'unknown'}`;
    res.json({ data: await getProductDetail(req.params.slug!, { userId: req.user?.id, viewerKey }) });
  }),
);

marketplaceRouter.get(
  '/products/:slug/related',
  validate({ params: slugParams }),
  asyncHandler(async (req, res) => {
    res.json({ data: await relatedProducts(req.params.slug!) });
  }),
);

marketplaceRouter.get(
  '/products/:slug/more-from-store',
  validate({ params: slugParams }),
  asyncHandler(async (req, res) => {
    res.json({ data: await moreFromStore(req.params.slug!) });
  }),
);

marketplaceRouter.get(
  '/products/:slug/bought-together',
  validate({ params: slugParams }),
  asyncHandler(async (req, res) => {
    res.json({ data: await boughtTogether(req.params.slug!) });
  }),
);

// ---- home / marketing ----
marketplaceRouter.get(
  '/home',
  publicCache(30),
  asyncHandler(async (_req, res) => {
    res.json({ data: await getHome() });
  }),
);

marketplaceRouter.get(
  '/flash-sales/current',
  asyncHandler(async (_req, res) => {
    res.json({ data: await getCurrentFlashSale() });
  }),
);

marketplaceRouter.get(
  '/campaigns/:slug',
  validate({ params: slugParams }),
  asyncHandler(async (req, res) => {
    res.json({ data: await getCampaign(req.params.slug!) });
  }),
);

marketplaceRouter.get(
  '/recently-viewed',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ data: await listRecentlyViewed(req.user!.id) });
  }),
);

// ---- search ----
marketplaceRouter.get(
  '/search/suggest',
  rateLimits.search,
  validate({ query: searchSuggestQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await suggest(String(req.query.q)) });
  }),
);

marketplaceRouter.get(
  '/search/trending',
  asyncHandler(async (_req, res) => {
    res.json({ data: await trendingSearches() });
  }),
);

marketplaceRouter.get(
  '/search/history',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ data: await searchHistory(req.user!.id) });
  }),
);

marketplaceRouter.delete(
  '/search/history',
  requireAuth,
  asyncHandler(async (req, res) => {
    await clearSearchHistory(req.user!.id);
    res.status(204).end();
  }),
);

// ---- stores (public) ----
marketplaceRouter.get(
  '/stores',
  validate({ query: storeListQuerySchema }),
  asyncHandler(async (req, res) => {
    const { items, nextCursor } = await listStores(req.query as unknown as StoreListQuery);
    res.json({ data: items, meta: { nextCursor } });
  }),
);

marketplaceRouter.get(
  '/stores/:slug',
  validate({ params: slugParams }),
  asyncHandler(async (req, res) => {
    res.json({ data: await getStorePublic(req.params.slug!) });
  }),
);

marketplaceRouter.get(
  '/stores/:slug/products',
  optionalAuth,
  validate({ params: slugParams, query: productListQuerySchema }),
  asyncHandler(async (req, res) => {
    const store = await findApprovedStore(req.params.slug!);
    const query = { ...(req.query as unknown as ProductListQuery), store: undefined };
    const { cards, meta } = await listProducts(query, { storeId: store._id, userId: req.user?.id });
    res.json({ data: cards, meta });
  }),
);

marketplaceRouter.get(
  '/stores/:slug/categories',
  validate({ params: slugParams }),
  asyncHandler(async (req, res) => {
    res.json({ data: await storeCategories(req.params.slug!) });
  }),
);

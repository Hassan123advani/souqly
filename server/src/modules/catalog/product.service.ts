import type { ProductCard, ProductDetail, ProductListMeta, ProductListQuery, ProductSort } from '@souqly/shared';
import type { PipelineStage } from 'mongoose';
import { Types } from 'mongoose';
import { notFound } from '../../lib/AppError';
import { logger } from '../../lib/logger';
import { cursorFilter, cursorSort, paginate } from '../../lib/pagination';
import { fuzzyTokenPattern, normalizeText, tokenize } from '../../lib/text';
import { Store } from '../stores/store.model';
import { recordStoreVisit } from '../stores/storeVisit.service';
import { Brand } from './brand.model';
import {
  CARD_FIELDS,
  breadcrumbsOf,
  findCategoryBySlug,
  getCategoryMap,
  getCurrentFlash,
  getPublicStoreIndex,
  publicProductFilter,
  toProductCards,
  type CardSource,
} from './catalog.service';
import { RecentlyViewed } from './marketing.models';
import { Product, type ProductLean } from './product.model';
import { didYouMean, logSearch } from './search.service';

/** Sort → (field, direction). `relevance` uses a computed `_rel` score (see below). */
const SORTS: Record<ProductSort, { field: string; dir: 1 | -1 }> = {
  relevance: { field: '_rel', dir: -1 },
  newest: { field: 'publishedAt', dir: -1 },
  price_asc: { field: 'priceMin', dir: 1 },
  price_desc: { field: 'priceMin', dir: -1 },
  best_selling: { field: 'soldCount', dir: -1 },
  top_rated: { field: 'ratingAvg', dir: -1 },
  discount: { field: 'discountPct', dir: -1 },
};

const CARD_PROJECTION: Record<string, 1> = Object.fromEntries(CARD_FIELDS.split(' ').map((f) => [f, 1]));

/** Popularity part of the relevance score; text matches add MongoDB's textScore on top. */
const POPULARITY = { $add: [{ $multiply: [{ $ln: { $add: ['$soldCount', 1] } }, 0.15] }, { $multiply: ['$ratingAvg', 0.1] }] };

export type ListOptions = {
  /** Scope to one store (store page). */
  storeId?: Types.ObjectId;
  /** Extra match (feeds, campaigns). Must not contain user input. */
  extraMatch?: Record<string, unknown>;
  userId?: string;
  /** Do not write a SearchLog entry (suggest endpoint). */
  skipLog?: boolean;
};

type SearchMode = { kind: 'none' } | { kind: 'text'; q: string } | { kind: 'fuzzy'; tokens: string[] };

const EMPTY = { cards: [] as ProductCard[], meta: { nextCursor: null } as ProductListMeta };

/** Builds the non-text part of the filter. Returns null when a referenced slug does not exist. */
async function buildMatch(q: ProductListQuery, opts: ListOptions): Promise<Record<string, unknown> | null> {
  const base = await publicProductFilter();
  const match: Record<string, unknown> = { ...base, ...(opts.extraMatch ?? {}) };
  const and: Record<string, unknown>[] = [];

  // Store scope (store slug / mall / city / forced store) → narrowed list of approved store ids.
  if (q.store || q.mall || q.city || opts.storeId) {
    const index = await getPublicStoreIndex();
    let stores = [...index.values()];
    if (opts.storeId) stores = stores.filter((s) => s.id.equals(opts.storeId!));
    if (q.store) stores = stores.filter((s) => s.slug === q.store);
    if (q.mall) stores = stores.filter((s) => s.isMall);
    if (q.city) stores = stores.filter((s) => s.city?.toLowerCase() === q.city!.toLowerCase());
    if (!stores.length) return null;
    match.storeId = { $in: stores.map((s) => s.id) };
  }
  if (q.category) {
    const cat = await findCategoryBySlug(q.category);
    if (!cat) return null;
    match.categoryPath = cat._id;
  }
  if (q.brand?.length) {
    const brands = await Brand.find({ slug: { $in: q.brand } }).select('_id').lean();
    if (!brands.length) return null;
    match.brandId = { $in: brands.map((b) => b._id) };
  }
  if (q.priceMin !== undefined || q.priceMax !== undefined) {
    match.priceMin = { ...(q.priceMin !== undefined ? { $gte: q.priceMin } : {}), ...(q.priceMax !== undefined ? { $lte: q.priceMax } : {}) };
  }
  if (q.rating !== undefined) match.ratingAvg = { $gte: q.rating };
  if (q.freeShipping) match.freeShipping = true;
  if (q.cod) match.cod = true;
  if (q.discount) match.discountPct = { $gte: q.discount };
  if (q.inStock) match.totalStock = { $gt: 0 };
  if (q.color?.length) match['variants.options.color'] = { $in: q.color };
  if (q.size?.length) match['variants.options.size'] = { $in: q.size };
  if (q.attrs) {
    // Keys are validated by attributeKeySchema (lowercase word chars only), values are plain strings.
    for (const [key, raw] of Object.entries(q.attrs)) {
      const values = raw.split(',').map((v) => v.trim()).filter(Boolean).slice(0, 20);
      if (values.length) and.push({ [`attributes.${key}`]: { $in: values } });
    }
  }
  if (and.length) match.$and = and;
  return match;
}

function fuzzyMatch(tokens: string[]): Record<string, unknown> {
  return { $and: tokens.map((t) => ({ searchText: { $regex: fuzzyTokenPattern(t) } })) };
}

async function resolveSearch(raw: string, match: Record<string, unknown>): Promise<SearchMode | null> {
  const q = normalizeText(raw);
  if (!q) return { kind: 'none' };
  if (await Product.exists({ ...match, $text: { $search: q } })) return { kind: 'text', q };
  const tokens = tokenize(q, 2).slice(0, 5);
  if (tokens.length && (await Product.exists({ ...match, ...fuzzyMatch(tokens) }))) return { kind: 'fuzzy', tokens };
  return null;
}

/**
 * Public product listing: filters, 7 sorts, cursor pagination (sort value + _id), optional facets
 * and the D-008 search cascade (text → fuzzy regex → did-you-mean).
 */
export async function listProducts(query: ProductListQuery, opts: ListOptions = {}): Promise<{ cards: ProductCard[]; meta: ProductListMeta }> {
  const match = await buildMatch(query, opts);
  if (!match) return EMPTY;

  let mode: SearchMode = { kind: 'none' };
  let suggestion: string | undefined;
  if (query.q) {
    const resolved = await resolveSearch(query.q, match);
    if (resolved) mode = resolved;
    else {
      suggestion = await didYouMean(query.q);
      const retry = suggestion ? await resolveSearch(suggestion, match) : null;
      if (!retry) {
        if (!query.cursor && !opts.skipLog) logSearch(query.q, 0, opts.userId);
        return { cards: [], meta: { nextCursor: null, ...(query.cursor ? {} : { total: 0 }), ...(suggestion ? { didYouMean: suggestion } : {}) } };
      }
      mode = retry;
    }
  }

  const finalMatch: Record<string, unknown> =
    mode.kind === 'text'
      ? { ...match, $text: { $search: mode.q } }
      : mode.kind === 'fuzzy'
        ? { ...match, $and: [...((match.$and as unknown[]) ?? []), ...(fuzzyMatch(mode.tokens).$and as unknown[])] }
        : match;

  const { field, dir } = SORTS[query.sort];
  const pipeline: PipelineStage[] = [{ $match: finalMatch }];
  if (field === '_rel') {
    pipeline.push({
      $addFields: { _rel: mode.kind === 'text' ? { $add: [{ $meta: 'textScore' }, POPULARITY] } : POPULARITY },
    });
  }
  const after = cursorFilter(field, dir, query.cursor);
  if (Object.keys(after).length) pipeline.push({ $match: after });
  pipeline.push(
    { $sort: cursorSort(field, dir) },
    { $limit: query.limit + 1 },
    { $project: { ...CARD_PROJECTION, ...(field !== '_id' ? { [field]: 1 } : {}) } },
  );

  const [items, total, facets] = await Promise.all([
    Product.aggregate<CardSource & Record<string, unknown>>(pipeline),
    query.cursor ? Promise.resolve(undefined) : Product.countDocuments(finalMatch),
    query.facets && !query.cursor ? computeFacets(finalMatch) : Promise.resolve(undefined),
  ]);
  const page = paginate(items, query.limit, field);
  const cards = await toProductCards(page.items);
  if (query.q && !query.cursor && !opts.skipLog) logSearch(query.q, total ?? cards.length, opts.userId);

  return {
    cards,
    meta: {
      nextCursor: page.nextCursor,
      ...(total !== undefined ? { total } : {}),
      ...(suggestion ? { didYouMean: suggestion } : {}),
      ...(facets ? { facets } : {}),
    },
  };
}

/** Filters that have their own facet. Each facet is computed with every filter EXCEPT its own (multi-select UX). */
const FACET_FILTER_KEYS = { brands: 'brandId', price: 'priceMin', ratings: 'ratingAvg', colors: 'variants.options.color', sizes: 'variants.options.size' } as const;

async function computeFacets(match: Record<string, unknown>): Promise<NonNullable<ProductListMeta['facets']>> {
  const common: Record<string, unknown> = { ...match };
  const own: Record<string, unknown> = {};
  for (const key of Object.values(FACET_FILTER_KEYS)) {
    if (key in common) {
      own[key] = common[key];
      delete common[key];
    }
  }
  /** $match with all facetable filters except `exclude`. */
  const others = (exclude: string): PipelineStage.FacetPipelineStage[] => {
    const m = Object.fromEntries(Object.entries(own).filter(([k]) => k !== exclude));
    return Object.keys(m).length ? [{ $match: m }] : [];
  };
  const optionFacet = (key: string): PipelineStage.FacetPipelineStage[] => [
    ...others(`variants.options.${key}`),
    { $unwind: '$variants' },
    { $match: { [`variants.options.${key}`]: { $exists: true } } },
    { $group: { _id: { p: '$_id', v: `$variants.options.${key}` } } },
    { $group: { _id: '$_id.v', count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
    { $limit: 30 },
  ];
  const ratingFacet = (min: number): PipelineStage.FacetPipelineStage[] => [...others(FACET_FILTER_KEYS.ratings), { $match: { ratingAvg: { $gte: min } } }, { $count: 'n' }];
  const [row] = await Product.aggregate<{
    brands: { _id: Types.ObjectId; count: number }[];
    price: { min: number; max: number }[];
    r4: { n: number }[];
    r3: { n: number }[];
    r2: { n: number }[];
    colors: { _id: string; count: number }[];
    sizes: { _id: string; count: number }[];
  }>([
    { $match: common },
    {
      $facet: {
        brands: [...others(FACET_FILTER_KEYS.brands), { $match: { brandId: { $exists: true } } }, { $group: { _id: '$brandId', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 30 }],
        price: [...others(FACET_FILTER_KEYS.price), { $group: { _id: null, min: { $min: '$priceMin' }, max: { $max: '$priceMax' } } }],
        r4: ratingFacet(4),
        r3: ratingFacet(3),
        r2: ratingFacet(2),
        colors: optionFacet('color'),
        sizes: optionFacet('size'),
      },
    },
  ]);
  const brandDocs = await Brand.find({ _id: { $in: (row?.brands ?? []).map((b) => b._id) } }).select('name slug').lean();
  const byId = new Map(brandDocs.map((b) => [String(b._id), b]));
  return {
    brands: (row?.brands ?? []).flatMap((b) => {
      const doc = byId.get(String(b._id));
      return doc ? [{ slug: doc.slug, name: doc.name, count: b.count }] : [];
    }),
    priceRange: { min: row?.price[0]?.min ?? 0, max: row?.price[0]?.max ?? 0 },
    ratings: [
      { min: 4, count: row?.r4[0]?.n ?? 0 },
      { min: 3, count: row?.r3[0]?.n ?? 0 },
      { min: 2, count: row?.r2[0]?.n ?? 0 },
    ],
    colors: (row?.colors ?? []).map((c) => ({ value: c._id, count: c.count })),
    sizes: (row?.sizes ?? []).map((c) => ({ value: c._id, count: c.count })),
  };
}

// ---------------------------------------------------------------------------------------------
// Product detail
// ---------------------------------------------------------------------------------------------

/** viewer+product → expiry; one view counted per viewer per product every 30 minutes. */
const recentViews = new Map<string, number>();
const VIEW_WINDOW_MS = 30 * 60_000;

function shouldCountView(viewerKey: string, productId: string): boolean {
  const key = `${viewerKey}|${productId}`;
  const now = Date.now();
  const until = recentViews.get(key);
  if (until && until > now) return false;
  if (recentViews.size > 50_000) {
    for (const [k, v] of recentViews) if (v <= now) recentViews.delete(k);
    if (recentViews.size > 50_000) recentViews.clear();
  }
  recentViews.set(key, now + VIEW_WINDOW_MS);
  return true;
}

async function loadPublicProduct(slug: string): Promise<ProductLean> {
  const base = await publicProductFilter();
  const p = (await Product.findOne({ ...base, slug }).lean()) as ProductLean | null;
  if (!p) throw notFound('Product');
  return p;
}

export async function getProductDetail(slug: string, viewer: { userId?: string; viewerKey: string }): Promise<ProductDetail> {
  const p = await loadPublicProduct(slug);
  const [store, cats, flash, stores, brand] = await Promise.all([
    Store.findById(p.storeId).select('slug name logo ratingAvg followerCount responseRate isMall createdAt productCount address.city').lean(),
    getCategoryMap(),
    getCurrentFlash(),
    getPublicStoreIndex(),
    p.brandId ? Brand.findById(p.brandId).select('name slug').lean() : Promise.resolve(null),
  ]);
  if (!store) throw notFound('Product');
  const storeInfo = stores.get(String(p.storeId));
  const cat = cats.get(String(p.categoryId));
  const f = flash?.byProduct.get(String(p._id));

  if (shouldCountView(viewer.viewerKey, String(p._id))) {
    Product.updateOne({ _id: p._id }, { $inc: { viewCount: 1 } }).catch((err) => logger.warn({ err }, 'viewCount update failed'));
    recordStoreVisit(p.storeId, viewer.viewerKey);
  }
  if (viewer.userId) recordRecentlyViewed(viewer.userId, p._id).catch((err) => logger.warn({ err }, 'recently viewed failed'));

  return {
    id: String(p._id),
    slug: p.slug,
    title: p.title,
    description: p.description,
    highlights: p.highlights ?? [],
    category: cat ? { id: String(cat._id), slug: cat.slug, name: cat.name } : null,
    ...(brand ? { brand: { id: String(brand._id), name: brand.name, slug: brand.slug } } : p.brandName ? { brand: { name: p.brandName } } : {}),
    images: p.images.map((i) => ({ url: i.url, ...(i.alt ? { alt: i.alt } : {}) })),
    ...(p.video?.url ? { video: { url: p.video.url } } : {}),
    attributes: p.attributes ?? {},
    options: p.options ?? [],
    variants: p.variants
      .filter((v) => v.isActive)
      .map((v) => ({
        id: String(v._id),
        sku: v.sku,
        options: v.options ?? {},
        price: v.price,
        ...(v.compareAtPrice ? { compareAtPrice: v.compareAtPrice } : {}),
        stock: Math.max(0, v.stock - (v.reserved ?? 0)),
        ...(v.images?.length ? { images: v.images } : {}),
        isActive: v.isActive,
      })),
    priceMin: p.priceMin,
    priceMax: p.priceMax,
    ...(p.compareAtMax ? { compareAtMax: p.compareAtMax } : {}),
    discountPct: p.discountPct,
    totalStock: p.totalStock,
    tags: p.tags ?? [],
    cod: p.cod,
    freeShipping: p.freeShipping,
    shipping: {
      weightGrams: p.shipping?.weightGrams ?? 0,
      ...(p.shipping?.dimensionsCm ? { dimensionsCm: p.shipping.dimensionsCm } : {}),
      processingDays: p.shipping?.processingDays ?? 2,
    },
    ...(p.warranty ? { warranty: { type: p.warranty.type, period: p.warranty.period } } : {}),
    ...(p.returnPolicy ? { returnPolicy: { days: p.returnPolicy.days, ...(p.returnPolicy.note ? { note: p.returnPolicy.note } : {}) } } : {}),
    ...(p.sizeGuide ? { sizeGuide: p.sizeGuide } : {}),
    specs: p.specs ?? [],
    ...(p.wholesaleTiers?.length ? { wholesaleTiers: p.wholesaleTiers } : {}),
    ...(p.preOrder?.enabled ? { preOrder: { enabled: true, ...(p.preOrder.shipsOn ? { shipsOn: p.preOrder.shipsOn.toISOString() } : {}) } } : {}),
    ratingAvg: p.ratingAvg,
    ratingCount: p.ratingCount,
    soldCount: p.soldCount,
    wishlistCount: p.wishlistCount,
    ...(p.publishedAt ? { publishedAt: p.publishedAt.toISOString() } : {}),
    ...(f && flash ? { flash: { price: f.price, endsAt: flash.endsAt.toISOString(), ...(f.variantId ? { variantId: f.variantId } : {}) } } : {}),
    ...(storeInfo?.onHoliday ? { unavailable: true, ...(storeInfo.holidayMessage ? { holidayMessage: storeInfo.holidayMessage } : {}) } : {}),
    store: {
      id: String(store._id),
      slug: store.slug,
      name: store.name,
      ...(store.logo?.url ? { logo: store.logo.url } : {}),
      ratingAvg: store.ratingAvg ?? 0,
      followerCount: store.followerCount ?? 0,
      responseRate: store.responseRate ?? 0,
      isMall: !!store.isMall,
      joinedAt: store.createdAt.toISOString(),
      productCount: store.productCount ?? 0,
      ...(store.address?.city ? { city: store.address.city } : {}),
    },
    breadcrumbs: cat ? breadcrumbsOf(cat) : [],
    shareImage: `/api/v1/products/${encodeURIComponent(p.slug)}/share-image.svg`,
  };
}

const RECENT_CAP = 50;

export async function recordRecentlyViewed(userId: string, productId: Types.ObjectId): Promise<void> {
  const uid = new Types.ObjectId(userId);
  await RecentlyViewed.updateOne({ userId: uid, productId }, { $set: { viewedAt: new Date() } }, { upsert: true });
  const overflow = await RecentlyViewed.find({ userId: uid }).sort({ viewedAt: -1 }).skip(RECENT_CAP).select('_id').lean();
  if (overflow.length) await RecentlyViewed.deleteMany({ _id: { $in: overflow.map((o) => o._id) } });
}

export async function listRecentlyViewed(userId: string): Promise<ProductCard[]> {
  const rows = await RecentlyViewed.find({ userId: new Types.ObjectId(userId) }).sort({ viewedAt: -1 }).limit(RECENT_CAP).lean();
  const base = await publicProductFilter();
  const products = await Product.find({ ...base, _id: { $in: rows.map((r) => r.productId) } }).select(CARD_FIELDS).lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));
  const ordered = rows.flatMap((r) => {
    const p = byId.get(String(r.productId));
    return p ? [p] : [];
  });
  return toProductCards(ordered as CardSource[]);
}

// ---------------------------------------------------------------------------------------------
// Related lists
// ---------------------------------------------------------------------------------------------

async function cardsWhere(filter: Record<string, unknown>, limit: number): Promise<ProductCard[]> {
  const base = await publicProductFilter();
  const items = await Product.find({ ...base, ...filter }).sort({ soldCount: -1, _id: -1 }).limit(limit).select(CARD_FIELDS).lean();
  return toProductCards(items as CardSource[]);
}

export async function relatedProducts(slug: string): Promise<ProductCard[]> {
  const p = await loadPublicProduct(slug);
  return cardsWhere({ categoryId: p.categoryId, _id: { $ne: p._id } }, 12);
}

export async function moreFromStore(slug: string): Promise<ProductCard[]> {
  const p = await loadPublicProduct(slug);
  return cardsWhere({ storeId: p.storeId, _id: { $ne: p._id } }, 12);
}

/**
 * Bought together: order co-occurrence once orders exist (Phase 4). Until then (and whenever there
 * is not enough order data) the fallback is same store + same top-level category.
 */
export async function boughtTogether(slug: string): Promise<ProductCard[]> {
  const p = await loadPublicProduct(slug);
  const top = p.categoryPath[0] ?? p.categoryId;
  const items = await cardsWhere({ storeId: p.storeId, categoryPath: top, _id: { $ne: p._id } }, 6);
  return items.length ? items : cardsWhere({ storeId: p.storeId, _id: { $ne: p._id } }, 6);
}

/** Infinite "Just for you" feed: categories of recently viewed products when logged in, else best sellers. */
export async function justForYou(userId: string | undefined, cursor: string | undefined, limit: number) {
  let extraMatch: Record<string, unknown> | undefined;
  if (userId) {
    const recent = await RecentlyViewed.find({ userId: new Types.ObjectId(userId) }).sort({ viewedAt: -1 }).limit(20).select('productId').lean();
    if (recent.length) {
      const cats = await Product.distinct('categoryId', { _id: { $in: recent.map((r) => r.productId) } });
      const base = await publicProductFilter();
      // Only personalize when there is enough to fill a feed.
      if (cats.length && (await Product.countDocuments({ ...base, categoryPath: { $in: cats } })) >= limit) {
        extraMatch = { categoryPath: { $in: cats } };
      }
    }
  }
  const { cards, meta } = await listProducts(
    { sort: 'best_selling', limit, ...(cursor ? { cursor } : {}) } as ProductListQuery,
    { ...(extraMatch ? { extraMatch } : {}), skipLog: true },
  );
  return { cards, meta: { nextCursor: meta.nextCursor } };
}

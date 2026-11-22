import type { CampaignCard, CampaignDTO, FlashSaleDTO, HomePayload, HomeSection, ProductCard, ProductListQuery, ProductSort, SearchSuggest } from '@souqly/shared';
import { notFound } from '../../lib/AppError';
import { TtlCache } from '../../lib/cache';
import { escapeRegex, normalizeText } from '../../lib/text';
import { Store } from '../stores/store.model';
import { topStores } from '../stores/stores.service';
import { CARD_FIELDS, getCategoryTree, getPublicStoreIndex, getTopCategories, publicProductFilter, toProductCards, type CardSource } from './catalog.service';
import { Campaign, FlashSale, HomeContent, type ICampaign } from './marketing.models';
import { Product } from './product.model';
import { listProducts } from './product.service';
import { didYouMean } from './search.service';

const DEFAULT_SECTIONS: { type: HomeSection['type']; title: string }[] = [
  { type: 'trending', title: 'Trending now' },
  { type: 'best_sellers', title: 'Best sellers' },
  { type: 'mall', title: 'Souqly Mall' },
  { type: 'new_arrivals', title: 'New arrivals' },
  { type: 'top_rated', title: 'Top rated' },
  { type: 'top_stores', title: 'Top stores' },
  { type: 'campaign', title: 'Campaigns' },
];

const homeCache = new TtlCache<HomePayload>(30_000, 1);

async function topCards(sort: ProductSort, extra: Partial<ProductListQuery> = {}, limit = 12): Promise<ProductCard[]> {
  return (await listProducts({ sort, limit, ...extra } as ProductListQuery, { skipLog: true })).cards;
}

/** Trending = most viewed among recently published products (falls back to best sellers). */
async function trendingCards(limit = 12): Promise<ProductCard[]> {
  const base = await publicProductFilter();
  const items = await Product.find(base).sort({ viewCount: -1, soldCount: -1, _id: -1 }).limit(limit).select(CARD_FIELDS).lean();
  return toProductCards(items as CardSource[]);
}

function toCampaignCard(c: ICampaign, now = new Date()): CampaignCard {
  return {
    slug: c.slug,
    name: c.name,
    ...(c.theme ? { theme: c.theme } : {}),
    ...(c.banner ? { banner: c.banner } : {}),
    startsAt: c.startsAt.toISOString(),
    endsAt: c.endsAt.toISOString(),
    isLive: c.startsAt <= now && c.endsAt > now,
  };
}

export async function getHome(): Promise<HomePayload> {
  return homeCache.get('home', async () => {
    const [content, categories, flash] = await Promise.all([HomeContent.findOne({ key: 'home' }).lean(), getTopCategories(), getCurrentFlashSale(16)]);
    const configured = content?.sections?.length
      ? [...content.sections].filter((s) => s.enabled).sort((a, b) => a.order - b.order)
      : DEFAULT_SECTIONS.map((s, i) => ({ ...s, enabled: true, order: i, config: {} }));

    const sections: HomeSection[] = [];
    for (const s of configured) {
      const cfgLimit = (s.config as Record<string, unknown> | undefined)?.limit;
      const limit = typeof cfgLimit === 'number' ? Math.min(24, Math.max(4, cfgLimit)) : 12;
      switch (s.type) {
        case 'trending':
          sections.push({ type: s.type, title: s.title, items: await trendingCards(limit) });
          break;
        case 'new_arrivals':
          sections.push({ type: s.type, title: s.title, items: await topCards('newest', {}, limit) });
          break;
        case 'top_rated':
          sections.push({ type: s.type, title: s.title, items: await topCards('top_rated', {}, limit) });
          break;
        case 'best_sellers':
          sections.push({ type: s.type, title: s.title, items: await topCards('best_selling', {}, limit) });
          break;
        case 'mall':
          sections.push({ type: s.type, title: s.title, items: await topCards('best_selling', { mall: true }, limit) });
          break;
        case 'top_stores':
          sections.push({ type: s.type, title: s.title, items: await topStores(limit) });
          break;
        case 'campaign': {
          const now = new Date();
          const camps = await Campaign.find({ endsAt: { $gt: now } }).sort({ startsAt: 1 }).limit(6).lean();
          sections.push({ type: 'campaign', title: s.title, items: camps.map((c) => toCampaignCard(c, now)) });
          break;
        }
      }
    }
    return {
      heroSlides: (content?.heroSlides ?? []).map((h) => ({
        image: h.image,
        title: h.title,
        ...(h.subtitle ? { subtitle: h.subtitle } : {}),
        ...(h.ctaText ? { ctaText: h.ctaText } : {}),
        ...(h.ctaLink ? { ctaLink: h.ctaLink } : {}),
        ...(h.theme ? { theme: h.theme } : {}),
      })),
      categories,
      flashSale: flash ? { id: flash.id, title: flash.title, endsAt: flash.endsAt, items: flash.items } : null,
      sections,
    };
  });
}

export function invalidateHomeCache(): void {
  homeCache.clear();
}

export async function getCurrentFlashSale(limit = 50): Promise<FlashSaleDTO | null> {
  const now = new Date();
  const sale = await FlashSale.findOne({ isActive: true, startsAt: { $lte: now }, endsAt: { $gt: now } }).sort({ endsAt: 1 }).lean();
  if (!sale) return null;
  const items = sale.items.slice(0, limit);
  const base = await publicProductFilter();
  const products = await Product.find({ ...base, _id: { $in: items.map((i) => i.productId) } }).select(CARD_FIELDS).lean();
  const cards = await toProductCards(products as CardSource[]);
  const byId = new Map(cards.map((c) => [c.id, c]));
  return {
    id: String(sale._id),
    title: sale.title,
    startsAt: sale.startsAt.toISOString(),
    endsAt: sale.endsAt.toISOString(),
    items: items.flatMap((i) => {
      const card = byId.get(String(i.productId));
      if (!card) return [];
      return [
        {
          ...card,
          flash: { price: i.flashPrice, endsAt: sale.endsAt.toISOString() },
          flashPrice: i.flashPrice,
          quantityLimit: i.quantityLimit,
          sold: i.sold,
        },
      ];
    }),
  };
}

export async function getCampaign(slug: string): Promise<CampaignDTO> {
  const c = await Campaign.findOne({ slug }).lean();
  if (!c) throw notFound('Campaign');
  const or: Record<string, unknown>[] = [];
  if (c.productIds?.length) or.push({ _id: { $in: c.productIds } });
  if (c.categoryIds?.length) or.push({ categoryPath: { $in: c.categoryIds } });
  if (c.storeIds?.length) or.push({ storeId: { $in: c.storeIds } });
  let products: ProductCard[] = [];
  if (or.length) {
    const base = await publicProductFilter();
    const items = await Product.find({ ...base, $or: or }).sort({ discountPct: -1, soldCount: -1, _id: -1 }).limit(48).select(CARD_FIELDS).lean();
    products = await toProductCards(items as CardSource[]);
  }
  return { ...toCampaignCard(c), ...(c.description ? { description: c.description } : {}), products };
}

// ---------------------------------------------------------------------------------------------
// Search suggest
// ---------------------------------------------------------------------------------------------

export async function suggest(q: string): Promise<SearchSuggest> {
  const norm = normalizeText(q);
  if (!norm) return { products: [], stores: [], categories: [] };
  const prefix = new RegExp(`(^|\\s)${escapeRegex(norm)}`, 'i');
  const [{ cards, meta }, stores, tree, storeIndex] = await Promise.all([
    listProducts({ q, sort: 'relevance', limit: 6 } as ProductListQuery, { skipLog: true }),
    Store.find({ status: 'approved', name: { $regex: escapeRegex(norm), $options: 'i' } }).sort({ followerCount: -1 }).limit(4).select('slug name logo isMall').lean(),
    getCategoryTree(),
    getPublicStoreIndex(),
  ]);
  const flat = tree.flatMap((c) => [c, ...c.children]);
  const categories = flat.filter((c) => prefix.test(normalizeText(c.name.en))).slice(0, 4);
  // Text search had no exact hit → offer a correction even if fuzzy matching found something.
  const textHit = await Product.exists({ ...(await publicProductFilter()), $text: { $search: norm } });
  const dym = meta.didYouMean ?? (textHit ? undefined : await didYouMean(q));
  return {
    products: cards.map((c) => ({ slug: c.slug, title: c.title, image: c.image, price: c.flash?.price ?? c.price })),
    stores: stores.filter((s) => storeIndex.has(String(s._id))).map((s) => ({ slug: s.slug, name: s.name, ...(s.logo?.url ? { logo: s.logo.url } : {}), isMall: !!s.isMall })),
    categories: categories.map((c) => ({ slug: c.slug, name: c.name })),
    ...(dym ? { didYouMean: dym } : {}),
  };
}

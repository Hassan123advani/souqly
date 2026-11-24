import type { LocalizedName, StoreCard, StoreListQuery, StorePublic } from '@souqly/shared';
import { Types } from 'mongoose';
import { notFound } from '../../lib/AppError';
import { cursorFilter, cursorSort, paginate } from '../../lib/pagination';
import { escapeRegex } from '../../lib/text';
import { Category } from '../catalog/category.model';
import { getCategoryMap, publicProductFilter } from '../catalog/catalog.service';
import { Product } from '../catalog/product.model';
import { Store, type IStore } from './store.model';

/**
 * Public store DTOs. Built from an explicit allow-list: never ownerId, business, payout,
 * contact email/phone, healthScore or plan.
 */
const CARD_SELECT = 'slug name tagline logo banner themeColor isMall ratingAvg ratingCount followerCount productCount address.city createdAt';
const PUBLIC_SELECT = `${CARD_SELECT} description categoryIds policies layoutTemplate sections seo holidayMode responseRate responseTimeHours contact.whatsapp featuredProductIds`;

type StoreLean = Partial<IStore> & { _id: Types.ObjectId; slug: string; name: string };

export function toStoreCard(s: StoreLean): StoreCard {
  return {
    id: String(s._id),
    slug: s.slug,
    name: s.name,
    ...(s.tagline ? { tagline: s.tagline } : {}),
    ...(s.logo?.url ? { logo: s.logo.url } : {}),
    ...(s.banner?.url ? { banner: s.banner.url } : {}),
    themeColor: s.themeColor ?? '#0E5E5A',
    isMall: !!s.isMall,
    ratingAvg: s.ratingAvg ?? 0,
    ratingCount: s.ratingCount ?? 0,
    followerCount: s.followerCount ?? 0,
    productCount: s.productCount ?? 0,
    ...(s.address?.city ? { city: s.address.city } : {}),
  };
}

const STORE_SORTS = {
  followers: { field: 'followerCount', dir: -1 as const },
  rating: { field: 'ratingAvg', dir: -1 as const },
  new: { field: 'createdAt', dir: -1 as const },
};

export async function listStores(q: StoreListQuery): Promise<{ items: StoreCard[]; nextCursor: string | null }> {
  const { field, dir } = STORE_SORTS[q.sort];
  const filter: Record<string, unknown> = { status: 'approved', billingStatus: { $ne: 'suspended' }, ...cursorFilter(field, dir, q.cursor) };
  if (q.mall) filter.isMall = true;
  if (q.q) filter.name = { $regex: escapeRegex(q.q), $options: 'i' };
  const rows = (await Store.find(filter).sort(cursorSort(field, dir)).limit(q.limit + 1).select(CARD_SELECT).lean()) as StoreLean[];
  const page = paginate(rows, q.limit, field);
  return { items: page.items.map(toStoreCard), nextCursor: page.nextCursor };
}

export async function findApprovedStore(slug: string): Promise<StoreLean> {
  const s = (await Store.findOne({ slug, status: 'approved', billingStatus: { $ne: 'suspended' } }).select(PUBLIC_SELECT).lean()) as StoreLean | null;
  if (!s) throw notFound('Store');
  return s;
}

export async function getStorePublic(slug: string): Promise<StorePublic> {
  const s = await findApprovedStore(slug);
  const cats = s.categoryIds?.length ? await Category.find({ _id: { $in: s.categoryIds }, isActive: true }).select('slug name').lean() : [];
  const now = new Date();
  const holiday = !!s.holidayMode?.enabled && (!s.holidayMode.until || s.holidayMode.until > now);
  return {
    ...toStoreCard(s),
    ...(s.description ? { description: s.description } : {}),
    categories: cats.map((c) => ({ id: String(c._id), slug: c.slug, name: c.name })),
    policies: {
      ...(s.policies?.shipping ? { shipping: s.policies.shipping } : {}),
      ...(s.policies?.returns ? { returns: s.policies.returns } : {}),
      ...(s.policies?.warranty ? { warranty: s.policies.warranty } : {}),
    },
    layoutTemplate: s.layoutTemplate ?? 'classic',
    sections: (s.sections ?? []).map((x) => ({ type: x.type, ...(x.title ? { title: x.title } : {}), config: x.config ?? {} })),
    seo: { ...(s.seo?.title ? { title: s.seo.title } : {}), ...(s.seo?.description ? { description: s.seo.description } : {}) },
    holidayMode: {
      enabled: holiday,
      ...(holiday && s.holidayMode?.message ? { message: s.holidayMode.message } : {}),
      ...(holiday && s.holidayMode?.until ? { until: s.holidayMode.until.toISOString() } : {}),
    },
    responseRate: s.responseRate ?? 0,
    responseTimeHours: s.responseTimeHours ?? 24,
    contact: { ...(s.contact?.whatsapp ? { whatsapp: s.contact.whatsapp } : {}) },
    joinedAt: (s.createdAt ?? new Date()).toISOString(),
    shareImage: `/api/v1/stores/${encodeURIComponent(s.slug)}/share-image.svg`,
    ...(s.featuredProductIds?.length ? { featuredProductIds: s.featuredProductIds.map(String) } : {}),
  };
}

/** Categories that the store's public products are in, with counts. */
export async function storeCategories(slug: string): Promise<{ id: string; slug: string; name: LocalizedName; count: number }[]> {
  const s = await findApprovedStore(slug);
  const base = await publicProductFilter();
  const rows = await Product.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { ...base, storeId: s._id } },
    { $group: { _id: '$categoryId', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  const cats = await getCategoryMap();
  return rows.flatMap((r) => {
    const c = cats.get(String(r._id));
    return c ? [{ id: String(c._id), slug: c.slug, name: c.name, count: r.count }] : [];
  });
}

export async function topStores(limit = 12): Promise<StoreCard[]> {
  const rows = (await Store.find({ status: 'approved', billingStatus: { $ne: 'suspended' } }).sort({ followerCount: -1, _id: -1 }).limit(limit).select(CARD_SELECT).lean()) as StoreLean[];
  return rows.map(toStoreCard);
}

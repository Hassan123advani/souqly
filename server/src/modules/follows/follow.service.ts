import type { FollowedStoreDTO } from '@souqly/shared';
import { Types } from 'mongoose';
import { AppError } from '../../lib/AppError';
import { cursorFilter, cursorSort, paginate } from '../../lib/pagination';
import { Product } from '../catalog/product.model';
import { Store } from '../stores/store.model';
import { Follow, type FollowLean } from './follow.model';

const oid = (s: string | Types.ObjectId) => new Types.ObjectId(String(s));

export async function isFollowing(userId: string | Types.ObjectId, storeId: string | Types.ObjectId): Promise<boolean> {
  return !!(await Follow.exists({ userId: oid(userId), storeId: oid(storeId) }));
}

async function publicStore(slug: string) {
  const store = await Store.findOne({ slug, status: 'approved' }).select('_id slug name followerCount ownerId').lean();
  if (!store) throw new AppError(404, 'NOT_FOUND', 'Store not found');
  return store;
}

export async function follow(userId: string, slug: string): Promise<{ following: true; followerCount: number }> {
  const store = await publicStore(slug);
  try {
    await Follow.create({ userId: oid(userId), storeId: store._id });
    const s = await Store.findByIdAndUpdate(store._id, { $inc: { followerCount: 1 } }, { new: true }).select('followerCount').lean();
    return { following: true, followerCount: s?.followerCount ?? store.followerCount };
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return { following: true, followerCount: store.followerCount };
    throw err;
  }
}

export async function unfollow(userId: string, slug: string): Promise<{ following: false; followerCount: number }> {
  const store = await publicStore(slug);
  const r = await Follow.deleteOne({ userId: oid(userId), storeId: store._id });
  if (r.deletedCount === 1) {
    const s = await Store.findOneAndUpdate({ _id: store._id, followerCount: { $gt: 0 } }, { $inc: { followerCount: -1 } }, { new: true }).select('followerCount').lean();
    return { following: false, followerCount: s?.followerCount ?? 0 };
  }
  return { following: false, followerCount: store.followerCount };
}

export async function followStatus(userId: string | undefined, slug: string) {
  const store = await publicStore(slug);
  return { following: userId ? await isFollowing(userId, store._id) : false, followerCount: store.followerCount };
}

export async function listFollowing(userId: string, q: { cursor?: string; limit: number }): Promise<{ items: FollowedStoreDTO[]; nextCursor: string | null }> {
  const rows = await Follow.find({ userId: oid(userId), ...cursorFilter('_id', -1, q.cursor) })
    .sort(cursorSort('_id', -1))
    .limit(q.limit + 1)
    .lean<FollowLean[]>();
  const page = paginate(rows, q.limit, '_id');
  const stores = await Store.find({ _id: { $in: page.items.map((f) => f.storeId) } })
    .select('slug name logo followerCount ratingAvg status')
    .lean();
  const byId = new Map(stores.map((s) => [String(s._id), s]));
  const items: FollowedStoreDTO[] = [];
  for (const f of page.items) {
    const s = byId.get(String(f.storeId));
    if (!s || s.status !== 'approved') continue;
    items.push({
      id: String(s._id),
      slug: s.slug,
      name: s.name,
      ...((s as { logo?: { url?: string } }).logo?.url ? { logo: (s as { logo?: { url?: string } }).logo!.url! } : {}),
      followerCount: s.followerCount,
      ratingAvg: s.ratingAvg,
      followedAt: f.createdAt.toISOString(),
    });
  }
  return { items, nextCursor: page.nextCursor };
}

/** Newest published products from stores the user follows (cursor on publishedAt). */
export async function followingFeed(userId: string, q: { cursor?: string; limit: number }) {
  const storeIds = (await Follow.find({ userId: oid(userId) }).select('storeId').limit(500).lean()).map((f) => f.storeId);
  if (!storeIds.length) return { items: [], nextCursor: null };
  const rows = await Product.find({ storeId: { $in: storeIds }, status: 'published', deletedAt: { $exists: false }, ...cursorFilter('publishedAt', -1, q.cursor) })
    .sort(cursorSort('publishedAt', -1))
    .limit(q.limit + 1)
    .select('storeId title slug images priceMin compareAtMin discountPct ratingAvg ratingCount soldCount totalStock publishedAt')
    .lean();
  const page = paginate(rows as (typeof rows[number] & { _id: Types.ObjectId })[], q.limit, 'publishedAt');
  const stores = await Store.find({ _id: { $in: storeIds } }).select('slug name').lean();
  const byId = new Map(stores.map((s) => [String(s._id), s]));
  return {
    items: page.items.map((p) => ({
      id: String(p._id),
      title: p.title,
      slug: p.slug,
      image: p.images?.[0]?.url,
      price: p.priceMin,
      ...(p.compareAtMin ? { compareAtPrice: p.compareAtMin } : {}),
      discountPct: p.discountPct,
      ratingAvg: p.ratingAvg,
      ratingCount: p.ratingCount,
      soldCount: p.soldCount,
      inStock: p.totalStock > 0,
      publishedAt: p.publishedAt?.toISOString(),
      store: { id: String(p.storeId), slug: byId.get(String(p.storeId))?.slug ?? '', name: byId.get(String(p.storeId))?.name ?? '' },
    })),
    nextCursor: page.nextCursor,
  };
}

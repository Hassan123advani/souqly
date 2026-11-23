import type { WishlistDTO, WishlistItemDTO } from '@souqly/shared';
import { Types } from 'mongoose';
import { AppError } from '../../lib/AppError';
import { Product, type ProductLean } from '../catalog/product.model';
import { DEFAULT_WISHLIST_NAME, MAX_WISHLISTS, MAX_WISHLIST_ITEMS, Wishlist, type WishlistLean } from './wishlist.model';

const oid = (s: string | Types.ObjectId) => new Types.ObjectId(String(s));
const sameVariant = (a?: Types.ObjectId | null, b?: string | null) => String(a ?? '') === String(b ?? '');

async function ensureDefault(userId: Types.ObjectId): Promise<WishlistLean> {
  const existing = await Wishlist.findOne({ userId, isDefault: true }).lean<WishlistLean>();
  if (existing) return existing;
  try {
    return (await Wishlist.create({ userId, name: DEFAULT_WISHLIST_NAME, isDefault: true })).toObject() as WishlistLean;
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return (await Wishlist.findOne({ userId, isDefault: true }).lean<WishlistLean>())!;
    throw err;
  }
}

async function ownList(userId: string, id: string): Promise<WishlistLean> {
  const list = await Wishlist.findOne({ _id: oid(id), userId: oid(userId) }).lean<WishlistLean>();
  if (!list) throw new AppError(404, 'NOT_FOUND', 'Wishlist not found');
  return list;
}

const toDTO = (w: WishlistLean, covers: Map<string, string>): WishlistDTO => {
  const last = w.items[w.items.length - 1];
  const cover = last ? covers.get(String(last.productId)) : undefined;
  return { id: String(w._id), name: w.name, isDefault: w.isDefault, itemCount: w.items.length, ...(cover ? { cover } : {}) };
};

export async function listWishlists(userId: string): Promise<WishlistDTO[]> {
  const uid = oid(userId);
  await ensureDefault(uid);
  const lists = await Wishlist.find({ userId: uid }).sort({ isDefault: -1, createdAt: 1 }).lean<WishlistLean[]>();
  const lastIds = lists.map((l) => l.items[l.items.length - 1]?.productId).filter(Boolean) as Types.ObjectId[];
  const prods = await Product.find({ _id: { $in: lastIds } }).select('images').lean();
  const covers = new Map(prods.map((p) => [String(p._id), p.images?.[0]?.url ?? '']));
  return lists.map((l) => toDTO(l, covers));
}

export async function createWishlist(userId: string, name: string): Promise<WishlistDTO> {
  const uid = oid(userId);
  await ensureDefault(uid);
  if ((await Wishlist.countDocuments({ userId: uid })) >= MAX_WISHLISTS) throw new AppError(400, 'WISHLIST_LIMIT', `You can have up to ${MAX_WISHLISTS} lists`);
  const w = await Wishlist.create({ userId: uid, name, isDefault: false });
  return toDTO(w.toObject() as WishlistLean, new Map());
}

export async function renameWishlist(userId: string, id: string, name: string): Promise<WishlistDTO> {
  await ownList(userId, id);
  const w = await Wishlist.findOneAndUpdate({ _id: oid(id), userId: oid(userId) }, { $set: { name } }, { new: true }).lean<WishlistLean>();
  return toDTO(w!, new Map());
}

export async function deleteWishlist(userId: string, id: string): Promise<void> {
  const list = await ownList(userId, id);
  if (list.isDefault) throw new AppError(400, 'DEFAULT_WISHLIST', 'The default wishlist cannot be deleted');
  await Wishlist.deleteOne({ _id: list._id, userId: list.userId });
  for (const it of list.items) await syncWishlistCount(list.userId, it.productId);
}

/** Product.wishlistCount = number of users who have the product in at least one list. */
async function syncWishlistCount(userId: Types.ObjectId, productId: Types.ObjectId, added?: boolean): Promise<void> {
  const lists = await Wishlist.countDocuments({ userId, 'items.productId': productId });
  if (added && lists === 1) await Product.updateOne({ _id: productId }, { $inc: { wishlistCount: 1 } });
  if (!added && lists === 0) await Product.updateOne({ _id: productId, wishlistCount: { $gt: 0 } }, { $inc: { wishlistCount: -1 } });
}

async function loadProduct(productId: string, variantId?: string) {
  const p = await Product.findOne({ _id: oid(productId), status: 'published', deletedAt: { $exists: false } }).select('variants priceMin').lean<ProductLean>();
  if (!p) throw new AppError(404, 'NOT_FOUND', 'Product not found');
  if (variantId && !p.variants.some((v) => String(v._id) === variantId)) throw new AppError(400, 'INVALID_VARIANT', 'Variant not found');
  const price = variantId ? p.variants.find((v) => String(v._id) === variantId)!.price : p.priceMin;
  return { product: p, price };
}

export async function addItem(userId: string, listId: string | null, input: { productId: string; variantId?: string }): Promise<WishlistDTO> {
  const uid = oid(userId);
  const list = listId ? await ownList(userId, listId) : await ensureDefault(uid);
  const { price } = await loadProduct(input.productId, input.variantId);
  if (list.items.some((i) => String(i.productId) === input.productId && sameVariant(i.variantId, input.variantId))) {
    return toDTO(list, new Map());
  }
  const updated = await Wishlist.findOneAndUpdate(
    { _id: list._id, userId: uid, [`items.${MAX_WISHLIST_ITEMS - 1}`]: { $exists: false }, items: { $not: { $elemMatch: { productId: oid(input.productId), variantId: input.variantId ? oid(input.variantId) : null } } } },
    { $push: { items: { productId: oid(input.productId), variantId: input.variantId ? oid(input.variantId) : null, addedAt: new Date(), priceAtAdd: price } } },
    { new: true },
  ).lean<WishlistLean>();
  if (!updated) {
    const fresh = await ownList(userId, String(list._id));
    if (fresh.items.length >= MAX_WISHLIST_ITEMS) throw new AppError(400, 'WISHLIST_FULL', 'This list is full');
    return toDTO(fresh, new Map());
  }
  await syncWishlistCount(uid, oid(input.productId), true);
  return toDTO(updated, new Map());
}

export async function removeItem(userId: string, listId: string, productId: string, variantId?: string): Promise<void> {
  const list = await ownList(userId, listId);
  const pull = variantId ? { productId: oid(productId), variantId: oid(variantId) } : { productId: oid(productId) };
  await Wishlist.updateOne({ _id: list._id, userId: list.userId }, { $pull: { items: pull } });
  await syncWishlistCount(list.userId, oid(productId));
}

export async function removeEverywhere(userId: string, productId: string): Promise<void> {
  const uid = oid(userId);
  const r = await Wishlist.updateMany({ userId: uid }, { $pull: { items: { productId: oid(productId) } } });
  if (r.modifiedCount > 0) await syncWishlistCount(uid, oid(productId));
}

export async function getWishlist(userId: string, id: string): Promise<WishlistDTO & { items: WishlistItemDTO[] }> {
  const list = await ownList(userId, id);
  const products = await Product.find({ _id: { $in: list.items.map((i) => i.productId) } })
    .select('title slug images variants priceMin compareAtMin totalStock ratingAvg status deletedAt')
    .lean<ProductLean[]>();
  const byId = new Map(products.map((p) => [String(p._id), p]));
  const items: WishlistItemDTO[] = [...list.items].reverse().map((i) => {
    const p = byId.get(String(i.productId));
    const visible = p && p.status === 'published' && !p.deletedAt;
    const v = visible && i.variantId ? p.variants.find((x) => String(x._id) === String(i.variantId)) : undefined;
    return {
      productId: String(i.productId),
      ...(i.variantId ? { variantId: String(i.variantId) } : {}),
      addedAt: i.addedAt.toISOString(),
      product: visible
        ? {
            title: p.title,
            slug: p.slug,
            ...(p.images?.[0]?.url ? { image: p.images[0].url } : {}),
            price: v?.price ?? p.priceMin,
            ...((v?.compareAtPrice ?? p.compareAtMin) ? { compareAtPrice: v?.compareAtPrice ?? p.compareAtMin } : {}),
            inStock: v ? v.isActive && v.stock - (v.reserved ?? 0) > 0 : p.totalStock > 0,
            ratingAvg: p.ratingAvg,
          }
        : null,
    };
  });
  return { ...toDTO(list, new Map()), items };
}

/** Heart states for product cards. */
export async function contains(userId: string, productIds: string[]): Promise<Record<string, boolean>> {
  const ids = productIds.map(oid);
  const lists = await Wishlist.find({ userId: oid(userId), 'items.productId': { $in: ids } }).select('items.productId').lean();
  const found = new Set(lists.flatMap((l) => l.items.map((i) => String(i.productId))));
  return Object.fromEntries(productIds.map((id) => [id, found.has(id)]));
}

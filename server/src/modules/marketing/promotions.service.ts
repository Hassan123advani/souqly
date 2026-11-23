import { Types } from 'mongoose';
import type { PricingBundle, PricingBxgy } from '../orders/pricing';
import { Product } from '../catalog/product.model';
import { Bundle, Promotion, StoreFlashDeal } from './marketing.model';

/** Read side of seller promotions, used by the cart quote, checkout and the PDP. */

const activeWindow = (now: Date) => ({
  isActive: true,
  $and: [{ $or: [{ startsAt: { $exists: false } }, { startsAt: null }, { startsAt: { $lte: now } }] }, { $or: [{ endsAt: { $exists: false } }, { endsAt: null }, { endsAt: { $gt: now } }] }],
});

/**
 * Active store flash-deal prices keyed `${productId}:${variantId}` (or `${productId}:*`). Only deals
 * whose storeId matches the product's store count (defence in depth; writes are validated too).
 */
export async function activeStoreDealPrices(products: { _id: Types.ObjectId; storeId: Types.ObjectId }[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!products.length) return out;
  const now = new Date();
  const owner = new Map(products.map((p) => [String(p._id), String(p.storeId)]));
  const deals = await StoreFlashDeal.find({ isActive: true, startsAt: { $lte: now }, endsAt: { $gt: now }, 'items.productId': { $in: products.map((p) => p._id) } }).lean();
  for (const d of deals) {
    for (const it of d.items) {
      if (owner.get(String(it.productId)) !== String(d.storeId) || it.sold >= it.quantityLimit) continue;
      const key = `${it.productId}:${it.variantId ? String(it.variantId) : '*'}`;
      out.set(key, Math.min(out.get(key) ?? Infinity, it.price));
    }
  }
  return out;
}

export async function activePromotionsForStores(storeIds: string[]): Promise<{ bundles: PricingBundle[]; promotions: PricingBxgy[] }> {
  if (!storeIds.length) return { bundles: [], promotions: [] };
  const now = new Date();
  const ids = storeIds.map((s) => new Types.ObjectId(s));
  const [bundles, promos] = await Promise.all([
    Bundle.find({ storeId: { $in: ids }, ...activeWindow(now) }).sort({ bundlePrice: 1 }).limit(200).lean(),
    Promotion.find({ storeId: { $in: ids }, isActive: true, startsAt: { $lte: now }, endsAt: { $gt: now } }).limit(200).lean(),
  ]);
  return {
    bundles: bundles.map((b) => ({
      id: String(b._id),
      storeId: String(b.storeId),
      name: b.name,
      bundlePrice: b.bundlePrice,
      items: b.items.map((i) => ({ productId: String(i.productId), ...(i.variantId ? { variantId: String(i.variantId) } : {}), qty: i.qty })),
    })),
    promotions: promos.map((p) => ({
      id: String(p._id),
      storeId: String(p.storeId),
      name: p.name,
      buy: { productIds: p.buy.productIds.map(String), qty: p.buy.qty },
      get: { productIds: p.get.productIds.map(String), qty: p.get.qty, discountBps: p.get.discountBps },
    })),
  };
}

/** PDP: active bundles / BXGY promotions / store flash deal that involve this product. */
export async function productPromotions(product: { _id: Types.ObjectId; storeId: Types.ObjectId }) {
  const now = new Date();
  const [bundles, promos, deals] = await Promise.all([
    Bundle.find({ storeId: product.storeId, 'items.productId': product._id, ...activeWindow(now) }).limit(10).lean(),
    Promotion.find({ storeId: product.storeId, isActive: true, startsAt: { $lte: now }, endsAt: { $gt: now }, $or: [{ 'buy.productIds': product._id }, { 'get.productIds': product._id }] })
      .limit(10)
      .lean(),
    activeStoreDealPrices([product]),
  ]);
  const productIds = [...new Set(bundles.flatMap((b) => b.items.map((i) => String(i.productId))))].map((id) => new Types.ObjectId(id));

  const products = await Product.find({ _id: { $in: productIds }, storeId: product.storeId, status: 'published', deletedAt: { $exists: false } })
    .select('title slug images priceMin')
    .lean();
  const pmap = new Map(products.map((p) => [String(p._id), p]));
  const flash = [...deals.entries()].map(([k, price]) => ({ variantId: k.split(':')[1] === '*' ? null : k.split(':')[1]!, price }));
  return {
    bundles: bundles
      .filter((b) => b.items.every((i) => pmap.has(String(i.productId))))
      .map((b) => ({
        id: String(b._id),
        name: b.name,
        bundlePrice: b.bundlePrice,
        regularPrice: b.items.reduce((s, i) => s + (pmap.get(String(i.productId))?.priceMin ?? 0) * i.qty, 0),
        items: b.items.map((i) => {
          const p = pmap.get(String(i.productId))!;
          return { productId: String(i.productId), variantId: i.variantId ? String(i.variantId) : null, qty: i.qty, title: p.title, slug: p.slug, image: p.images?.[0]?.url ?? null };
        }),
      })),
    promotions: promos.map((p) => ({
      id: String(p._id),
      type: p.type,
      name: p.name,
      buy: { productIds: p.buy.productIds.map(String), qty: p.buy.qty },
      get: { productIds: p.get.productIds.map(String), qty: p.get.qty, discountBps: p.get.discountBps },
      endsAt: p.endsAt.toISOString(),
    })),
    flashDeal: flash.length ? flash : null,
  };
}

import type { BundleInput, PromotionInput, SellerFlashDealInput, SellerVoucherInput } from '@souqly/shared';
import type { Request } from 'express';
import { Types } from 'mongoose';
import { AppError, notFound } from '../../lib/AppError';
import { logger } from '../../lib/logger';
import { audit } from '../audit/audit.service';
import { Campaign, FlashSale } from '../catalog/marketing.models';
import { Category } from '../catalog/category.model';
import { Product } from '../catalog/product.model';
import { Store } from '../stores/store.model';
import { Voucher } from '../vouchers/voucher.model';
import { Bundle, Promotion, StoreFlashDeal } from './marketing.model';

/** Seller marketing service. EVERY query is scoped by `storeId` = req.store._id (never client input). */

const oid = (id: string | Types.ObjectId) => new Types.ObjectId(String(id));
const DAY = 24 * 3600_000;
/** Store flash-deal rules (platform guard-rails; documented in docs/api-growth.md). */
export const FLASH_DEAL_RULES = { maxDays: 14, minPriceBps: 1000 } as const;

/** Every product id must belong to this store (and not be deleted); returns the products. */
async function ownProducts(storeId: Types.ObjectId, ids: string[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) return [];
  const products = await Product.find({ _id: { $in: unique.map(oid) }, storeId, deletedAt: { $exists: false } }).select('title variants status').lean();
  if (products.length !== unique.length) throw new AppError(400, 'INVALID_PRODUCTS', 'Some products do not belong to your store');
  return products;
}

const dupKey = (err: unknown) => (err as { code?: number }).code === 11000;

// ---------------- vouchers ----------------
const voucherDTO = (v: Record<string, unknown> & { _id: Types.ObjectId }) => ({
  id: String(v._id),
  code: v.code,
  title: v.title ?? null,
  type: v.type,
  value: v.value,
  minSpend: v.minSpend,
  maxDiscount: v.maxDiscount ?? null,
  startsAt: v.startsAt,
  endsAt: v.endsAt,
  usageLimit: v.usageLimit,
  perUserLimit: v.perUserLimit,
  usedCount: v.usedCount,
  followerOnly: v.followerOnly,
  productIds: ((v.productIds as Types.ObjectId[]) ?? []).map(String),
  categoryIds: ((v.categoryIds as Types.ObjectId[]) ?? []).map(String),
  isActive: v.isActive,
});

async function checkCategories(ids: string[] | undefined) {
  if (!ids?.length) return;
  const n = await Category.countDocuments({ _id: { $in: ids.map(oid) } });
  if (n !== new Set(ids).size) throw new AppError(400, 'INVALID_CATEGORIES', 'Unknown category');
}

export async function listVouchers(storeId: Types.ObjectId) {
  const rows = await Voucher.find({ scope: 'store', storeId }).sort({ createdAt: -1 }).limit(200).lean();
  return rows.map((v) => voucherDTO(v as never));
}

export async function createVoucher(req: Request, input: SellerVoucherInput) {
  const storeId = req.store!._id;
  await ownProducts(storeId, input.productIds);
  await checkCategories(input.categoryIds);
  try {
    const v = await Voucher.create({
      code: input.code,
      scope: 'store',
      storeId,
      ...(input.title ? { title: input.title } : {}),
      type: input.type,
      value: input.type === 'free_shipping' ? 0 : input.value,
      minSpend: input.minSpend,
      ...(input.maxDiscount !== undefined ? { maxDiscount: input.maxDiscount } : {}),
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      usageLimit: input.usageLimit,
      perUserLimit: input.perUserLimit,
      followerOnly: input.followerOnly,
      productIds: input.productIds.map(oid),
      categoryIds: input.categoryIds.map(oid),
      isActive: input.isActive,
    });
    await audit({ action: 'store.voucher_created', targetType: 'Voucher', targetId: v._id, meta: { code: v.code }, req });
    return voucherDTO(v.toObject() as never);
  } catch (err) {
    if (dupKey(err)) throw new AppError(409, 'CODE_TAKEN', 'You already have a voucher with this code');
    throw err;
  }
}

export async function updateVoucher(req: Request, id: string, input: Partial<SellerVoucherInput>) {
  const storeId = req.store!._id;
  if (input.productIds) await ownProducts(storeId, input.productIds);
  await checkCategories(input.categoryIds);
  const set: Record<string, unknown> = {};
  for (const k of ['title', 'value', 'minSpend', 'maxDiscount', 'startsAt', 'endsAt', 'usageLimit', 'perUserLimit', 'followerOnly', 'isActive'] as const) {
    if (input[k] !== undefined) set[k] = input[k];
  }
  if (input.productIds) set.productIds = input.productIds.map(oid);
  if (input.categoryIds) set.categoryIds = input.categoryIds.map(oid);
  const current = await Voucher.findOne({ _id: oid(id), scope: 'store', storeId }).lean();
  if (!current) throw notFound('Voucher');
  const startsAt = (set.startsAt as Date | undefined) ?? current.startsAt;
  const endsAt = (set.endsAt as Date | undefined) ?? current.endsAt;
  if (endsAt <= startsAt) throw new AppError(400, 'INVALID_WINDOW', 'End must be after start');
  if (current.type === 'percent' && set.value !== undefined && ((set.value as number) <= 0 || (set.value as number) > 9000)) {
    throw new AppError(400, 'INVALID_VALUE', 'Percent is in basis points (1-9000)');
  }
  const v = await Voucher.findOneAndUpdate({ _id: current._id, storeId }, { $set: set }, { new: true }).lean();
  await audit({ action: 'store.voucher_updated', targetType: 'Voucher', targetId: current._id, meta: { fields: Object.keys(set) }, req });
  return voucherDTO(v as never);
}

export async function deleteVoucher(req: Request, id: string) {
  const r = await Voucher.deleteOne({ _id: oid(id), scope: 'store', storeId: req.store!._id });
  if (!r.deletedCount) throw notFound('Voucher');
  await audit({ action: 'store.voucher_deleted', targetType: 'Voucher', targetId: id, req });
}

// ---------------- flash deals ----------------
type FlashItem = SellerFlashDealInput['items'][number];

/** Validates a deal against the store's products and the platform rules. */
async function validateDeal(storeId: Types.ObjectId, startsAt: Date, endsAt: Date, items: FlashItem[]) {
  if (endsAt.getTime() - startsAt.getTime() > FLASH_DEAL_RULES.maxDays * DAY) {
    throw new AppError(400, 'DEAL_TOO_LONG', `A flash deal can run for at most ${FLASH_DEAL_RULES.maxDays} days`);
  }
  const products = await ownProducts(storeId, items.map((i) => i.productId));
  const pmap = new Map(products.map((p) => [String(p._id), p]));
  const errors: { index: number; code: string; message: string }[] = [];
  items.forEach((it, index) => {
    const p = pmap.get(it.productId)!;
    const variants = it.variantId ? p.variants.filter((v) => String(v._id) === it.variantId) : p.variants;
    if (!variants.length) return errors.push({ index, code: 'VARIANT_NOT_FOUND', message: 'Variant not found' });
    for (const v of variants) {
      if (it.price >= v.price) return errors.push({ index, code: 'NOT_A_DISCOUNT', message: 'Deal price must be below the regular price' });
      if (it.price * 10_000 < v.price * FLASH_DEAL_RULES.minPriceBps) return errors.push({ index, code: 'PRICE_TOO_LOW', message: 'Deal price cannot be more than 90% off' });
    }
    return undefined;
  });
  // Items already in a platform flash sale during this window: the platform price wins, so reject the overlap.
  const overlapping = await FlashSale.find({ isActive: true, startsAt: { $lt: endsAt }, endsAt: { $gt: startsAt }, 'items.productId': { $in: products.map((p) => p._id) } }).select('items.productId').lean();
  const inPlatform = new Set(overlapping.flatMap((s) => s.items.map((i) => String(i.productId))));
  items.forEach((it, index) => {
    if (inPlatform.has(it.productId)) errors.push({ index, code: 'IN_PLATFORM_FLASH_SALE', message: 'This product is in a platform flash sale during that time' });
  });
  if (errors.length) throw new AppError(400, 'INVALID_DEAL', 'Some deal items are not valid', { items: errors });
}

const dealDTO = (d: Record<string, unknown> & { _id: Types.ObjectId; items: { productId: Types.ObjectId; variantId?: Types.ObjectId; price: number; quantityLimit: number; sold: number }[] }) => ({
  id: String(d._id),
  title: d.title,
  startsAt: d.startsAt,
  endsAt: d.endsAt,
  isActive: d.isActive,
  items: d.items.map((i) => ({ productId: String(i.productId), variantId: i.variantId ? String(i.variantId) : null, price: i.price, quantityLimit: i.quantityLimit, sold: i.sold })),
});

export async function listDeals(storeId: Types.ObjectId) {
  return (await StoreFlashDeal.find({ storeId }).sort({ endsAt: -1 }).limit(100).lean()).map((d) => dealDTO(d as never));
}

export async function createDeal(req: Request, input: SellerFlashDealInput) {
  const storeId = req.store!._id;
  await validateDeal(storeId, input.startsAt, input.endsAt, input.items);
  const d = await StoreFlashDeal.create({
    storeId,
    title: input.title,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    isActive: input.isActive,
    items: input.items.map((i) => ({ productId: oid(i.productId), ...(i.variantId ? { variantId: oid(i.variantId) } : {}), price: i.price, quantityLimit: i.quantityLimit })),
  });
  await audit({ action: 'store.flash_deal_created', targetType: 'StoreFlashDeal', targetId: d._id, meta: { items: input.items.length }, req });
  return dealDTO(d.toObject() as never);
}

export async function updateDeal(req: Request, id: string, input: SellerFlashDealInput) {
  const storeId = req.store!._id;
  const existing = await StoreFlashDeal.findOne({ _id: oid(id), storeId }).lean();
  if (!existing) throw notFound('Flash deal');
  await validateDeal(storeId, input.startsAt, input.endsAt, input.items);
  const sold = new Map(existing.items.map((i) => [`${i.productId}:${i.variantId ?? '*'}`, i.sold]));
  const d = await StoreFlashDeal.findOneAndUpdate(
    { _id: existing._id, storeId },
    {
      $set: {
        title: input.title,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        isActive: input.isActive,
        items: input.items.map((i) => ({ productId: oid(i.productId), ...(i.variantId ? { variantId: oid(i.variantId) } : {}), price: i.price, quantityLimit: i.quantityLimit, sold: sold.get(`${i.productId}:${i.variantId ?? '*'}`) ?? 0 })),
      },
    },
    { new: true },
  ).lean();
  await audit({ action: 'store.flash_deal_updated', targetType: 'StoreFlashDeal', targetId: existing._id, req });
  return dealDTO(d as never);
}

export async function deleteDeal(req: Request, id: string) {
  const r = await StoreFlashDeal.deleteOne({ _id: oid(id), storeId: req.store!._id });
  if (!r.deletedCount) throw notFound('Flash deal');
  await audit({ action: 'store.flash_deal_deleted', targetType: 'StoreFlashDeal', targetId: id, req });
}

/** Increments `sold` on the active store deal for each sold line (best effort, never throws). */
export async function recordStoreDealSales(lines: { storeId: Types.ObjectId; productId: Types.ObjectId; variantId: Types.ObjectId; qty: number }[]): Promise<void> {
  const now = new Date();
  for (const l of lines) {
    try {
      await StoreFlashDeal.updateOne(
        { storeId: l.storeId, isActive: true, startsAt: { $lte: now }, endsAt: { $gt: now }, items: { $elemMatch: { productId: l.productId, $or: [{ variantId: l.variantId }, { variantId: { $exists: false } }, { variantId: null }] } } },
        { $inc: { 'items.$.sold': l.qty } },
      );
    } catch (err) {
      logger.warn({ err }, 'store deal sold counter failed');
    }
  }
}

// ---------------- bundles ----------------
const bundleDTO = (b: Record<string, unknown> & { _id: Types.ObjectId; items: { productId: Types.ObjectId; variantId?: Types.ObjectId; qty: number }[] }) => ({
  id: String(b._id),
  name: b.name,
  bundlePrice: b.bundlePrice,
  isActive: b.isActive,
  startsAt: b.startsAt ?? null,
  endsAt: b.endsAt ?? null,
  items: b.items.map((i) => ({ productId: String(i.productId), variantId: i.variantId ? String(i.variantId) : null, qty: i.qty })),
});

async function validateBundle(storeId: Types.ObjectId, input: BundleInput) {
  const products = await ownProducts(storeId, input.items.map((i) => i.productId));
  const pmap = new Map(products.map((p) => [String(p._id), p]));
  let regular = 0;
  for (const it of input.items) {
    const p = pmap.get(it.productId)!;
    const v = it.variantId ? p.variants.find((x) => String(x._id) === it.variantId) : p.variants.reduce((a, b) => (b.price < a.price ? b : a), p.variants[0]!);
    if (!v) throw new AppError(400, 'VARIANT_NOT_FOUND', 'Variant not found');
    regular += v.price * it.qty;
  }
  if (input.bundlePrice >= regular) throw new AppError(400, 'NOT_A_DISCOUNT', 'Bundle price must be below the items’ regular total', { regular });
}

export async function listBundles(storeId: Types.ObjectId) {
  return (await Bundle.find({ storeId }).sort({ createdAt: -1 }).limit(100).lean()).map((b) => bundleDTO(b as never));
}

const bundleDoc = (input: BundleInput) => ({
  name: input.name,
  bundlePrice: input.bundlePrice,
  isActive: input.isActive,
  ...(input.startsAt ? { startsAt: input.startsAt } : {}),
  ...(input.endsAt ? { endsAt: input.endsAt } : {}),
  items: input.items.map((i) => ({ productId: oid(i.productId), ...(i.variantId ? { variantId: oid(i.variantId) } : {}), qty: i.qty })),
});

export async function createBundle(req: Request, input: BundleInput) {
  const storeId = req.store!._id;
  await validateBundle(storeId, input);
  const b = await Bundle.create({ storeId, ...bundleDoc(input) });
  await audit({ action: 'store.bundle_created', targetType: 'Bundle', targetId: b._id, req });
  return bundleDTO(b.toObject() as never);
}

export async function updateBundle(req: Request, id: string, input: BundleInput) {
  const storeId = req.store!._id;
  if (!(await Bundle.exists({ _id: oid(id), storeId }))) throw notFound('Bundle');
  await validateBundle(storeId, input);
  const b = await Bundle.findOneAndUpdate({ _id: oid(id), storeId }, { $set: bundleDoc(input), ...(input.startsAt ? {} : { $unset: { startsAt: 1, endsAt: 1 } }) }, { new: true }).lean();
  await audit({ action: 'store.bundle_updated', targetType: 'Bundle', targetId: id, req });
  return bundleDTO(b as never);
}

export async function deleteBundle(req: Request, id: string) {
  const r = await Bundle.deleteOne({ _id: oid(id), storeId: req.store!._id });
  if (!r.deletedCount) throw notFound('Bundle');
  await audit({ action: 'store.bundle_deleted', targetType: 'Bundle', targetId: id, req });
}

// ---------------- buy X get Y ----------------
const promoDTO = (p: Record<string, unknown> & { _id: Types.ObjectId; buy: { productIds: Types.ObjectId[]; qty: number }; get: { productIds: Types.ObjectId[]; qty: number; discountBps: number } }) => ({
  id: String(p._id),
  type: p.type,
  name: p.name,
  buy: { productIds: p.buy.productIds.map(String), qty: p.buy.qty },
  get: { productIds: p.get.productIds.map(String), qty: p.get.qty, discountBps: p.get.discountBps },
  startsAt: p.startsAt,
  endsAt: p.endsAt,
  isActive: p.isActive,
});

const promoDoc = (input: PromotionInput) => ({
  type: 'bxgy' as const,
  name: input.name,
  buy: { productIds: input.buy.productIds.map(oid), qty: input.buy.qty },
  get: { productIds: input.get.productIds.map(oid), qty: input.get.qty, discountBps: input.get.discountBps },
  startsAt: input.startsAt,
  endsAt: input.endsAt,
  isActive: input.isActive,
});

export async function listPromotions(storeId: Types.ObjectId) {
  return (await Promotion.find({ storeId }).sort({ createdAt: -1 }).limit(100).lean()).map((p) => promoDTO(p as never));
}

export async function createPromotion(req: Request, input: PromotionInput) {
  const storeId = req.store!._id;
  await ownProducts(storeId, [...input.buy.productIds, ...input.get.productIds]);
  const p = await Promotion.create({ storeId, ...promoDoc(input) });
  await audit({ action: 'store.promotion_created', targetType: 'Promotion', targetId: p._id, req });
  return promoDTO(p.toObject() as never);
}

export async function updatePromotion(req: Request, id: string, input: PromotionInput) {
  const storeId = req.store!._id;
  if (!(await Promotion.exists({ _id: oid(id), storeId }))) throw notFound('Promotion');
  await ownProducts(storeId, [...input.buy.productIds, ...input.get.productIds]);
  const p = await Promotion.findOneAndUpdate({ _id: oid(id), storeId }, { $set: promoDoc(input) }, { new: true }).lean();
  await audit({ action: 'store.promotion_updated', targetType: 'Promotion', targetId: id, req });
  return promoDTO(p as never);
}

export async function deletePromotion(req: Request, id: string) {
  const r = await Promotion.deleteOne({ _id: oid(id), storeId: req.store!._id });
  if (!r.deletedCount) throw notFound('Promotion');
  await audit({ action: 'store.promotion_deleted', targetType: 'Promotion', targetId: id, req });
}

// ---------------- platform campaigns ----------------
export async function openCampaigns(storeId: Types.ObjectId) {
  const rows = await Campaign.find({ endsAt: { $gt: new Date() } }).sort({ startsAt: 1 }).limit(50).lean();
  return rows.map((c) => ({
    id: String(c._id),
    slug: c.slug,
    name: c.name,
    banner: c.banner ?? null,
    startsAt: c.startsAt,
    endsAt: c.endsAt,
    description: c.description ?? null,
    // Only THIS store's nominations are ever returned.
    nominations: (c.nominations ?? [])
      .filter((n) => String(n.storeId) === String(storeId))
      .map((n) => ({ id: String(n._id), productId: String(n.productId), campaignPrice: n.campaignPrice, status: n.status, note: n.note ?? null, createdAt: n.createdAt })),
  }));
}

export async function nominate(req: Request, campaignId: string, items: { productId: string; campaignPrice: number }[]) {
  const storeId = req.store!._id;
  const campaign = await Campaign.findOne({ _id: oid(campaignId), endsAt: { $gt: new Date() } }).lean();
  if (!campaign) throw notFound('Campaign');
  const products = await ownProducts(storeId, items.map((i) => i.productId));
  const pmap = new Map(products.map((p) => [String(p._id), p]));
  for (const it of items) {
    const min = Math.min(...pmap.get(it.productId)!.variants.map((v) => v.price));
    if (it.campaignPrice <= 0 || it.campaignPrice >= min) throw new AppError(400, 'NOT_A_DISCOUNT', 'Campaign price must be below the regular price', { productId: it.productId });
  }
  const already = new Set((campaign.nominations ?? []).filter((n) => String(n.storeId) === String(storeId) && n.status !== 'rejected').map((n) => String(n.productId)));
  const fresh = items.filter((i) => !already.has(i.productId));
  if (fresh.length) {
    await Campaign.updateOne(
      { _id: campaign._id },
      { $push: { nominations: { $each: fresh.map((i) => ({ storeId, productId: oid(i.productId), campaignPrice: i.campaignPrice, status: 'pending', createdAt: new Date() })) } } },
    );
  }
  await audit({ action: 'store.campaign_nominated', targetType: 'Campaign', targetId: campaign._id, meta: { products: fresh.length }, req });
  return { added: fresh.length, skipped: items.length - fresh.length };
}

/** Admin review: approved → product added to the campaign's productIds. */
export async function reviewNomination(req: Request, campaignId: string, nominationId: string, status: 'approved' | 'rejected', note?: string) {
  const c = await Campaign.findOne({ _id: oid(campaignId), 'nominations._id': oid(nominationId) }).lean();
  const n = c?.nominations?.find((x) => String(x._id) === nominationId);
  if (!c || !n) throw notFound('Nomination');
  await Campaign.updateOne(
    { _id: c._id, 'nominations._id': n._id },
    {
      $set: { 'nominations.$.status': status, 'nominations.$.reviewedAt': new Date(), 'nominations.$.reviewedBy': oid(req.user!.id), ...(note ? { 'nominations.$.note': note } : {}) },
      ...(status === 'approved' ? { $addToSet: { productIds: n.productId } } : { $pull: { productIds: n.productId } }),
    },
  );
  await audit({ action: `admin.campaign_nomination_${status}`, targetType: 'Campaign', targetId: c._id, meta: { nominationId, storeId: String(n.storeId), productId: String(n.productId) }, req });
  return { id: nominationId, status };
}

// ---------------- featured products ----------------
export async function getFeatured(storeId: Types.ObjectId) {
  const s = await Store.findById(storeId).select('featuredProductIds').lean();
  return { productIds: (s?.featuredProductIds ?? []).map(String) };
}

export async function setFeatured(req: Request, productIds: string[]) {
  const storeId = req.store!._id;
  await ownProducts(storeId, productIds);
  const ids = [...new Set(productIds)].map(oid);
  await Store.updateOne({ _id: storeId }, { $set: { featuredProductIds: ids } });
  await audit({ action: 'store.featured_updated', targetType: 'Store', targetId: storeId, meta: { count: ids.length }, req });
  return { productIds: ids.map(String) };
}

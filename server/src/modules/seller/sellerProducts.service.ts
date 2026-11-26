import { assertLiveProductLimit, assertProductLimit } from '../plans/plan.service';
import type { ProductCreateInput, ProductUpdateInput, SellerProductBulkInput, SellerProductBulkResult, ProductVariantInput, SellerProduct, SellerProductListQuery, UploadResult } from '@souqly/shared';
import { slugify } from '@souqly/shared';
import type { Request } from 'express';
import { Types } from 'mongoose';
import { AppError, notFound } from '../../lib/AppError';
import { randomCode } from '../../lib/crypto';
import { IMAGE_UPLOAD_MIME, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, VIDEO_UPLOAD_MIME, sniffMime } from '../../lib/fileType';
import { cursorFilter, cursorSort, paginate } from '../../lib/pagination';
import { sanitizeRichText, stripHtml } from '../../lib/sanitize';
import { escapeRegex } from '../../lib/text';
import { getStorage } from '../../services/storage';
import { checkProductAlerts } from '../alerts/alert.service';
import { autoReviewProduct } from '../aiReview/aiReview.service';
import { audit } from '../audit/audit.service';
import { Brand } from '../catalog/brand.model';
import { buildSearchText, categoryPathFor, invalidateStoreIndex } from '../catalog/catalog.service';
import { Product, type IVariant, type ProductDoc } from '../catalog/product.model';
import { invalidateVocabulary } from '../catalog/search.service';
import { getSetting } from '../settings/settings.service';
import { Store, type StoreDoc } from '../stores/store.model';

/**
 * Seller product management. EVERY query is scoped by `store._id` taken from req.store
 * (storeContext); ids from the URL only select within that store.
 */

export function newProductSlug(title: string): string {
  return `${slugify(title) || 'product'}-${randomCode(6).toLowerCase()}`;
}

/** Media must be ours: a local /uploads path or an https URL on our Cloudinary account. */
function assertOwnMedia(url: string): void {
  if (url.startsWith('/uploads/')) return;
  try {
    const u = new URL(url);
    if (u.protocol === 'https:' && u.hostname === 'res.cloudinary.com') return;
  } catch {
    /* fall through */
  }
  throw new AppError(400, 'INVALID_MEDIA', 'Images and videos must be uploaded through Souqly');
}

function skuPrefix(store: StoreDoc): string {
  return (store.slug.replace(/[^a-z0-9]/g, '').slice(0, 6) || 'sq').toUpperCase();
}

/** Maps variant input to stored variants, keeping ids and `reserved` of existing variants. */
function buildVariants(store: StoreDoc, inputs: ProductVariantInput[], existing: IVariant[] = []): Partial<IVariant>[] {
  const byId = new Map(existing.map((v) => [String(v._id), v]));
  const prefix = skuPrefix(store);
  return inputs.map((v) => {
    const prev = v.id ? byId.get(v.id) : undefined;
    v.images?.forEach(assertOwnMedia);
    return {
      _id: prev?._id ?? new Types.ObjectId(),
      sku: v.sku ?? prev?.sku ?? `${prefix}-${randomCode(8)}`,
      options: v.options,
      price: v.price,
      compareAtPrice: v.compareAtPrice,
      stock: v.stock,
      reserved: prev?.reserved ?? 0,
      images: v.images,
      barcode: v.barcode,
      weightGrams: v.weightGrams,
      isActive: v.isActive,
    };
  });
}

function checkVariantsAgainstOptions(options: { key: string; values: string[] }[], variants: { options: Record<string, string> }[]): void {
  const keys = options.map((o) => o.key).sort().join('|');
  for (const v of variants) {
    if (Object.keys(v.options).sort().join('|') !== keys) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Each variant must set exactly one value for each option');
    }
    for (const o of options) {
      if (!o.values.includes(v.options[o.key]!)) throw new AppError(400, 'VALIDATION_ERROR', `Unknown value for option ${o.key}`);
    }
  }
}

/** Applies whitelisted, sanitized fields. Never touches storeId, status, counters or ratings. */
export async function applyInput(product: ProductDoc, store: StoreDoc, input: ProductUpdateInput): Promise<void> {
  if (input.title !== undefined) product.title = stripHtml(input.title);
  if (input.description !== undefined) product.description = sanitizeRichText(input.description);
  if (input.highlights !== undefined) product.highlights = input.highlights.map(stripHtml).filter(Boolean);
  if (input.sizeGuide !== undefined) product.sizeGuide = sanitizeRichText(input.sizeGuide);
  if (input.images !== undefined) {
    input.images.forEach((i) => assertOwnMedia(i.url));
    product.images = input.images.map((i) => ({ url: i.url, key: i.key, ...(i.alt ? { alt: stripHtml(i.alt) } : {}) }));
  }
  if (input.video !== undefined) {
    assertOwnMedia(input.video.url);
    product.video = input.video;
  }
  if (input.attributes !== undefined) product.attributes = input.attributes;
  if (input.tags !== undefined) product.tags = [...new Set(input.tags.map(stripHtml).filter(Boolean))];
  if (input.cod !== undefined) product.cod = input.cod;
  if (input.freeShipping !== undefined) product.freeShipping = input.freeShipping;
  if (input.shipping !== undefined) product.shipping = input.shipping;
  if (input.warranty !== undefined) product.warranty = { type: input.warranty.type, period: stripHtml(input.warranty.period) };
  if (input.returnPolicy !== undefined) {
    product.returnPolicy = { days: input.returnPolicy.days, ...(input.returnPolicy.note ? { note: stripHtml(input.returnPolicy.note) } : {}) };
  }
  if (input.specs !== undefined) product.specs = input.specs.map((s) => ({ label: stripHtml(s.label), value: stripHtml(s.value) }));
  if (input.wholesaleTiers !== undefined) product.wholesaleTiers = [...input.wholesaleTiers].sort((a, b) => a.minQty - b.minQty);
  if (input.preOrder !== undefined) product.preOrder = input.preOrder;

  if (input.options !== undefined) product.options = input.options.map((o) => ({ key: o.key, name: stripHtml(o.name), values: o.values }));
  if (input.variants !== undefined) {
    checkVariantsAgainstOptions(product.options, input.variants);
    product.set('variants', buildVariants(store, input.variants, product.variants));
  } else if (input.options !== undefined) {
    checkVariantsAgainstOptions(product.options, product.variants);
  }

  if (input.brandId !== undefined) {
    const brand = await Brand.findById(input.brandId).select('name').lean();
    if (!brand) throw new AppError(400, 'INVALID_BRAND', 'Brand not found');
    product.brandId = brand._id;
    product.brandName = brand.name;
  } else if (input.brandName !== undefined) {
    product.brandId = undefined;
    product.brandName = stripHtml(input.brandName) || undefined;
  }

  let categoryNames: string[] | undefined;
  if (input.categoryId !== undefined || !product.categoryPath.length) {
    const { category, path } = await categoryPathFor(input.categoryId ?? product.categoryId);
    product.categoryId = category._id;
    product.categoryPath = path;
    categoryNames = [...category.ancestors.flatMap((a) => [a.name.en, a.name.ur, a.name.ar]), category.name.en, category.name.ur, category.name.ar];
  }
  if (categoryNames || input.title !== undefined || input.tags !== undefined || input.brandId !== undefined || input.brandName !== undefined) {
    if (!categoryNames) {
      const { category } = await categoryPathFor(product.categoryId);
      categoryNames = [...category.ancestors.map((a) => a.name.en), category.name.en, category.name.ur, category.name.ar];
    }
    product.searchText = buildSearchText(product, categoryNames.filter(Boolean));
  }
}

async function loadOwn(store: StoreDoc, id: string): Promise<ProductDoc> {
  const p = await Product.findOne({ _id: new Types.ObjectId(id), storeId: store._id, deletedAt: { $exists: false } });
  if (!p) throw notFound('Product');
  return p;
}

export function toSellerProduct(p: ProductDoc): SellerProduct {
  const o = p.toObject();
  return {
    id: String(o._id),
    slug: o.slug,
    title: o.title,
    description: o.description,
    highlights: o.highlights,
    categoryId: String(o.categoryId),
    ...(o.brandName ? { brand: { ...(o.brandId ? { id: String(o.brandId) } : {}), name: o.brandName } } : {}),
    images: o.images.map((i) => ({ url: i.url, key: i.key, ...(i.alt ? { alt: i.alt } : {}) })),
    ...(o.video?.url ? { video: { url: o.video.url, key: o.video.key } } : {}),
    attributes: o.attributes ?? {},
    options: o.options,
    variants: o.variants.map((v) => ({
      id: String(v._id),
      sku: v.sku,
      options: v.options ?? {},
      price: v.price,
      ...(v.compareAtPrice ? { compareAtPrice: v.compareAtPrice } : {}),
      stock: v.stock,
      reserved: v.reserved ?? 0,
      ...(v.images?.length ? { images: v.images } : {}),
      ...(v.barcode ? { barcode: v.barcode } : {}),
      ...(v.weightGrams !== undefined ? { weightGrams: v.weightGrams } : {}),
      isActive: v.isActive,
    })),
    priceMin: o.priceMin,
    priceMax: o.priceMax,
    ...(o.compareAtMax ? { compareAtMax: o.compareAtMax } : {}),
    discountPct: o.discountPct,
    totalStock: o.totalStock,
    tags: o.tags,
    cod: o.cod,
    freeShipping: o.freeShipping,
    shipping: o.shipping,
    ...(o.warranty ? { warranty: { type: o.warranty.type, period: o.warranty.period } } : {}),
    ...(o.returnPolicy ? { returnPolicy: o.returnPolicy } : {}),
    ...(o.sizeGuide ? { sizeGuide: o.sizeGuide } : {}),
    specs: o.specs,
    ...(o.wholesaleTiers?.length ? { wholesaleTiers: o.wholesaleTiers } : {}),
    ...(o.preOrder ? { preOrder: { enabled: o.preOrder.enabled, ...(o.preOrder.shipsOn ? { shipsOn: o.preOrder.shipsOn.toISOString() } : {}) } } : {}),
    ratingAvg: o.ratingAvg,
    ratingCount: o.ratingCount,
    soldCount: o.soldCount,
    wishlistCount: o.wishlistCount,
    viewCount: o.viewCount,
    ...(o.publishedAt ? { publishedAt: o.publishedAt.toISOString() } : {}),
    status: o.status,
    ...(o.moderationNote ? { moderationNote: o.moderationNote } : {}),
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}

export async function listOwn(store: StoreDoc, q: SellerProductListQuery) {
  const filter: Record<string, unknown> = { storeId: store._id, deletedAt: { $exists: false }, ...cursorFilter('_id', -1, q.cursor) };
  if (q.status) filter.status = q.status;
  if (q.q) filter.title = { $regex: escapeRegex(q.q), $options: 'i' };
  const rows = await Product.find(filter).sort(cursorSort('_id', -1)).limit(q.limit + 1);
  const page = paginate(rows, q.limit, '_id');
  return { items: page.items.map(toSellerProduct), nextCursor: page.nextCursor };
}

/** Product counts per status tab (+ `all`) for the seller product list. */
export async function statusCounts(store: StoreDoc): Promise<Record<string, number>> {
  const rows = await Product.aggregate<{ _id: string; n: number }>([
    { $match: { storeId: store._id, deletedAt: { $exists: false } } },
    { $group: { _id: '$status', n: { $sum: 1 } } },
  ]);
  const counts: Record<string, number> = { all: 0, draft: 0, pending_review: 0, published: 0, rejected: 0, archived: 0 };
  for (const r of rows) {
    counts[r._id] = r.n;
    counts.all! += r.n;
  }
  return counts;
}

/** Takes a product off sale (seller side). Published → archived; the public count drops. */
export async function archiveProduct(req: Request, id: string): Promise<SellerProduct> {
  const store = req.store!;
  const product = await loadOwn(store, id);
  if (product.status === 'archived') return toSellerProduct(product);
  const wasLive = product.status === 'published';
  product.status = 'archived';
  if (wasLive) product.publishedAt = undefined;
  await product.save();
  if (wasLive) {
    await Store.updateOne({ _id: store._id, productCount: { $gt: 0 } }, { $inc: { productCount: -1 } });
    invalidateVocabulary();
    invalidateStoreIndex();
  }
  await audit({ action: 'product.archived', targetType: 'Product', targetId: product._id, meta: { storeId: String(store._id) }, req });
  return toSellerProduct(product);
}

/** Bulk publish / archive. Each id is processed independently; failures are reported per id. */
export async function bulkProducts(req: Request, input: SellerProductBulkInput): Promise<SellerProductBulkResult> {
  const out: SellerProductBulkResult = { ok: [], failed: [] };
  for (const id of [...new Set(input.ids)]) {
    try {
      if (input.action === 'publish') await publishProduct(req, id);
      else await archiveProduct(req, id);
      out.ok.push(id);
    } catch (err) {
      if (!(err instanceof AppError)) throw err;
      out.failed.push({ id, code: err.code, message: err.message });
    }
  }
  return out;
}

export async function getOwn(store: StoreDoc, id: string): Promise<SellerProduct> {
  return toSellerProduct(await loadOwn(store, id));
}

export async function createProduct(req: Request, input: ProductCreateInput): Promise<SellerProduct> {
  const store = req.store!;
  await assertProductLimit(store); // Phase 10 plan limit
  const product = new Product({ storeId: store._id, title: input.title, slug: newProductSlug(input.title), status: 'draft', categoryId: input.categoryId });
  await applyInput(product, store, input);
  await product.save();
  await audit({ action: 'product.created', targetType: 'Product', targetId: product._id, meta: { storeId: String(store._id) }, req });
  return toSellerProduct(product);
}

export async function updateProduct(req: Request, id: string, input: ProductUpdateInput): Promise<SellerProduct> {
  const store = req.store!;
  const product = await loadOwn(store, id);
  await applyInput(product, store, input);
  await product.save();
  if (product.status === 'published') invalidateVocabulary();
  void checkProductAlerts(product._id); // Phase 8: price-drop / back-in-stock alerts
  await audit({ action: 'product.updated', targetType: 'Product', targetId: product._id, meta: { storeId: String(store._id), fields: Object.keys(input) }, req });
  return toSellerProduct(product);
}

export async function deleteProduct(req: Request, id: string): Promise<void> {
  const store = req.store!;
  const product = await loadOwn(store, id);
  product.deletedAt = new Date();
  product.status = 'archived';
  await product.save();
  await Store.updateOne({ _id: store._id }, { $inc: { productCount: product.publishedAt ? -1 : 0 } });
  await audit({ action: 'product.deleted', targetType: 'Product', targetId: product._id, meta: { storeId: String(store._id) }, req });
}

export async function duplicateProduct(req: Request, id: string): Promise<SellerProduct> {
  const store = req.store!;
  await assertProductLimit(store);
  const src = await loadOwn(store, id);
  const o = src.toObject();
  const title = `${o.title} (Copy)`.slice(0, 150);
  const copy = new Product({
    ...o,
    _id: new Types.ObjectId(),
    title,
    slug: newProductSlug(title),
    status: 'draft',
    variants: o.variants.map((v) => ({ ...v, _id: new Types.ObjectId(), sku: `${v.sku}-C${randomCode(3)}`.slice(0, 64), reserved: 0 })),
    ratingAvg: 0,
    ratingCount: 0,
    soldCount: 0,
    viewCount: 0,
    wishlistCount: 0,
    isFeatured: false,
    publishedAt: undefined,
    moderationNote: undefined,
    demo: false,
    createdAt: undefined,
    updatedAt: undefined,
  });
  await copy.save();
  await audit({ action: 'product.duplicated', targetType: 'Product', targetId: copy._id, meta: { storeId: String(store._id), from: String(src._id) }, req });
  return toSellerProduct(copy);
}

/** Submit for review; trusted stores (Mall, or `autoApproveProducts` setting) publish directly. */
export async function publishProduct(req: Request, id: string): Promise<SellerProduct> {
  const store = req.store!;
  const product = await loadOwn(store, id);
  if (!product.images.length) throw new AppError(400, 'IMAGES_REQUIRED', 'Add at least one image before publishing');
  if (!product.variants.some((v) => v.isActive)) throw new AppError(400, 'VARIANTS_REQUIRED', 'Add at least one active variant');
  if (product.status === 'published') return toSellerProduct(product);
  // Billing-suspended stores cannot put new products live (docs/api-billing.md §3).
  if (store.billingStatus === 'suspended') throw new AppError(403, 'BILLING_SUSPENDED', 'Your store is on hold for unpaid dues. Pay your invoice to publish products.');
  if (product.status !== 'pending_review') await assertLiveProductLimit(store);
  const trusted = store.status === 'approved' && (store.isMall || (await getSetting<boolean>('autoApproveProducts')) === true);
  const wasPublished = !!product.publishedAt;
  product.status = trusted ? 'published' : 'pending_review';
  if (trusted) product.publishedAt ??= new Date();
  product.moderationNote = undefined;
  product.aiReview = undefined; // every (re)submission gets a fresh automated review
  await product.save();
  if (trusted) {
    if (!wasPublished) await Store.updateOne({ _id: store._id }, { $inc: { productCount: 1 } });
    invalidateVocabulary();
    invalidateStoreIndex();
  }
  await audit({ action: 'product.publish_requested', targetType: 'Product', targetId: product._id, meta: { storeId: String(store._id), status: product.status }, req });
  if (product.status === 'pending_review') {
    // D-092: automated review of the clear cases; the response below reflects the outcome.
    await autoReviewProduct(product._id);
    const fresh = await Product.findById(product._id);
    if (fresh) return toSellerProduct(fresh);
  }
  return toSellerProduct(product);
}

export async function uploadMedia(req: Request, file: Express.Multer.File | undefined): Promise<UploadResult> {
  if (!file) throw new AppError(400, 'FILE_REQUIRED', 'Choose a file to upload');
  const mime = sniffMime(file.buffer);
  const isImage = !!mime && IMAGE_UPLOAD_MIME.has(mime);
  const isVideo = !!mime && VIDEO_UPLOAD_MIME.has(mime);
  if (!isImage && !isVideo) throw new AppError(400, 'INVALID_FILE_TYPE', 'Use a JPG, PNG, WebP or AVIF image, or an MP4/WebM video');
  if (isImage && file.size > MAX_IMAGE_BYTES) throw new AppError(413, 'FILE_TOO_LARGE', 'Images must be 5 MB or smaller');
  if (isVideo && file.size > MAX_VIDEO_BYTES) throw new AppError(413, 'FILE_TOO_LARGE', 'Videos must be 30 MB or smaller');
  const store = req.store!;
  const stored = await getStorage().upload(file.buffer, {
    folder: `stores/${String(store._id)}/${isImage ? 'images' : 'videos'}`,
    filename: isImage ? 'image' : 'video',
    mimetype: mime!,
  });
  await audit({ action: 'store.media_uploaded', targetType: 'Store', targetId: store._id, meta: { key: stored.key, size: file.size, mime }, req });
  return { url: stored.url, key: stored.key, kind: isImage ? 'image' : 'video', mimetype: mime!, size: file.size };
}

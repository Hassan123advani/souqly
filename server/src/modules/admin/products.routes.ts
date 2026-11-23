import { PERMISSIONS, adminFeatureSchema, adminModerationNoteSchema, adminProductBulkSchema, adminProductListQuerySchema, objectIdSchema } from '@souqly/shared';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { AppError, notFound } from '../../lib/AppError';
import { asyncHandler } from '../../lib/asyncHandler';
import { streamCsv } from '../../lib/csv';
import { cursorFilter, cursorSort, paginate } from '../../lib/pagination';
import { escapeRegex } from '../../lib/text';
import { validate } from '../../middleware/validate';
import { audit } from '../audit/audit.service';
import { invalidateStoreIndex } from '../catalog/catalog.service';
import { Product } from '../catalog/product.model';
import { invalidateVocabulary } from '../catalog/search.service';
import { notify } from '../notifications/notification.service';
import { Store } from '../stores/store.model';
import { can, iso, oid, q } from './common';

export const adminProductsRouter = Router();
const idParams = z.object({ id: objectIdSchema });
const MOD = PERMISSIONS.ADMIN_PRODUCTS_MODERATE;
type ProductListQuery = z.infer<typeof adminProductListQuerySchema>;

function productFilter(f: ProductListQuery): Record<string, unknown> {
  const filter: Record<string, unknown> = { deletedAt: { $exists: false } };
  if (f.status) filter.status = f.status;
  if (f.storeId) filter.storeId = oid(f.storeId);
  if (f.q) filter.title = { $regex: escapeRegex(f.q), $options: 'i' };
  return filter;
}

const FIELDS = 'storeId title slug status moderationNote priceMin priceMax totalStock images isFeatured categoryId createdAt updatedAt';
type Row = { _id: unknown; storeId: unknown; title: string; slug: string; status: string; moderationNote?: string; priceMin: number; priceMax: number; totalStock: number; images: { url: string }[]; isFeatured: boolean; createdAt: Date; updatedAt: Date };
const toRow = (p: Row, storeName?: string) => ({
  id: String(p._id),
  storeId: String(p.storeId),
  storeName: storeName ?? null,
  title: p.title,
  slug: p.slug,
  status: p.status,
  moderationNote: p.moderationNote ?? null,
  priceMin: p.priceMin,
  priceMax: p.priceMax,
  totalStock: p.totalStock,
  image: p.images?.[0]?.url ?? null,
  isFeatured: p.isFeatured,
  createdAt: iso(p.createdAt),
  updatedAt: iso(p.updatedAt),
});

adminProductsRouter.get(
  '/products',
  ...can(MOD),
  validate({ query: adminProductListQuerySchema }),
  asyncHandler(async (req, res) => {
    const f = q<ProductListQuery>(req);
    if (f.format === 'csv') {
      await audit({ action: 'admin.export_csv', targetType: 'Product', meta: { resource: 'products' }, req });
      const cursor = Product.find(productFilter(f)).select(FIELDS).sort({ _id: -1 }).lean<Row[]>().cursor() as AsyncIterable<Row>;
      return streamCsv(res, 'products.csv', [
        { header: 'id', value: (p: Row) => String(p._id) },
        { header: 'storeId', value: (p) => String(p.storeId) },
        { header: 'title', value: (p) => p.title },
        { header: 'status', value: (p) => p.status },
        { header: 'priceMin', value: (p) => p.priceMin },
        { header: 'totalStock', value: (p) => p.totalStock },
        { header: 'createdAt', value: (p) => p.createdAt },
      ], cursor);
    }
    // The pending queue is oldest-first (FIFO); other lists newest-first.
    const dir = f.status === 'pending_review' ? 1 : -1;
    const rows = await Product.find({ ...productFilter(f), ...cursorFilter('_id', dir, f.cursor) }).select(FIELDS).sort(cursorSort('_id', dir)).limit(f.limit + 1).lean();
    const page = paginate(rows, f.limit, '_id');
    const stores = await Store.find({ _id: { $in: page.items.map((p) => p.storeId) } }).select('name').lean();
    const names = new Map(stores.map((s) => [String(s._id), s.name]));
    res.json({ data: page.items.map((p) => toRow(p as unknown as Row, names.get(String(p.storeId)))), meta: { nextCursor: page.nextCursor } });
  }),
);

async function notifySeller(storeId: unknown, title: string, body: string, productId: unknown) {
  const s = await Store.findById(storeId).select('ownerId').lean();
  if (s) void notify({ userId: s.ownerId, type: 'product.moderated', title, body, link: `/seller/products/${String(productId)}` });
}

/** Approves a pending product (conditional update: concurrent moderators cannot double-apply). */
export async function approveProduct(req: Request, id: string) {
  const now = new Date();
  const before = await Product.findOneAndUpdate(
    { _id: oid(id), status: 'pending_review', deletedAt: { $exists: false } },
    { $set: { status: 'published' }, $unset: { moderationNote: 1 } },
  ).lean();
  if (!before) {
    if (!(await Product.exists({ _id: oid(id) }))) throw notFound('Product');
    throw new AppError(409, 'NOT_PENDING', 'Only products awaiting review can be approved');
  }
  if (!before.publishedAt) {
    await Product.updateOne({ _id: before._id }, { $set: { publishedAt: now } });
    await Store.updateOne({ _id: before.storeId }, { $inc: { productCount: 1 } });
  }
  invalidateVocabulary();
  invalidateStoreIndex();
  await audit({ action: 'admin.product_approved', targetType: 'Product', targetId: before._id, storeId: before.storeId, req });
  await notifySeller(before.storeId, 'Product approved', `"${before.title}" is now live.`, before._id);
  return { id: String(before._id), status: 'published' };
}

/** Rejects a pending product or takes a live one down (hide) with a note the seller sees. */
export async function rejectProduct(req: Request, id: string, note: string, from: ('pending_review' | 'published')[] = ['pending_review'], action = 'admin.product_rejected') {
  const before = await Product.findOneAndUpdate(
    { _id: oid(id), status: { $in: from }, deletedAt: { $exists: false } },
    { $set: { status: 'rejected', moderationNote: note, isFeatured: false } },
  ).lean();
  if (!before) {
    if (!(await Product.exists({ _id: oid(id) }))) throw notFound('Product');
    throw new AppError(409, 'INVALID_PRODUCT_STATE', 'This product cannot be moderated in its current state');
  }
  if (before.status === 'published') {
    await Store.updateOne({ _id: before.storeId, productCount: { $gt: 0 } }, { $inc: { productCount: -1 } });
    await Product.updateOne({ _id: before._id }, { $unset: { publishedAt: 1 } });
    invalidateVocabulary();
    invalidateStoreIndex();
  }
  await audit({ action, targetType: 'Product', targetId: before._id, storeId: before.storeId, meta: { note }, req });
  await notifySeller(before.storeId, action === 'admin.product_hidden' ? 'Product taken down' : 'Product needs changes', `"${before.title}": ${note}`, before._id);
  return { id: String(before._id), status: 'rejected' };
}

adminProductsRouter.post(
  '/products/bulk',
  ...can(MOD),
  validate({ body: adminProductBulkSchema }),
  asyncHandler(async (req, res) => {
    const { ids, action, note } = req.body as { ids: string[]; action: 'approve' | 'reject'; note?: string };
    const ok: string[] = [];
    const failed: { id: string; code: string; message: string }[] = [];
    for (const id of [...new Set(ids)]) {
      try {
        if (action === 'approve') await approveProduct(req, id);
        else await rejectProduct(req, id, note!);
        ok.push(id);
      } catch (err) {
        if (!(err instanceof AppError)) throw err;
        failed.push({ id, code: err.code, message: err.message });
      }
    }
    res.json({ data: { ok, failed } });
  }),
);

adminProductsRouter.post(
  '/products/:id/approve',
  ...can(MOD),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    res.json({ data: await approveProduct(req, req.params.id!) });
  }),
);

adminProductsRouter.post(
  '/products/:id/reject',
  ...can(MOD),
  validate({ params: idParams, body: adminModerationNoteSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await rejectProduct(req, req.params.id!, req.body.note) });
  }),
);

adminProductsRouter.post(
  '/products/:id/hide',
  ...can(MOD),
  validate({ params: idParams, body: adminModerationNoteSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await rejectProduct(req, req.params.id!, req.body.note, ['published', 'pending_review'], 'admin.product_hidden') });
  }),
);

adminProductsRouter.patch(
  '/products/:id/feature',
  ...can(MOD),
  validate({ params: idParams, body: adminFeatureSchema }),
  asyncHandler(async (req, res) => {
    const p = await Product.findOneAndUpdate({ _id: oid(req.params.id!), status: 'published' }, { $set: { isFeatured: req.body.isFeatured } }, { new: true }).lean();
    if (!p) throw new AppError(409, 'NOT_PUBLISHED', 'Only live products can be featured');
    await audit({ action: 'admin.product_featured', targetType: 'Product', targetId: p._id, storeId: p.storeId, meta: { isFeatured: p.isFeatured }, req });
    res.json({ data: { id: String(p._id), isFeatured: p.isFeatured } });
  }),
);

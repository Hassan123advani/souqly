import {
  PERMISSIONS,
  adminBrandSchema,
  adminCategoryAttributesSchema,
  adminCategoryCreateSchema,
  adminCategoryMoveSchema,
  adminCategoryReorderSchema,
  adminCategoryUpdateSchema,
  objectIdSchema,
} from '@souqly/shared';
import { Router } from 'express';
import type { Types } from 'mongoose';
import { z } from 'zod';
import { env } from '../../config/env';
import { AppError, notFound } from '../../lib/AppError';
import { asyncHandler } from '../../lib/asyncHandler';
import { logger } from '../../lib/logger';
import { validate } from '../../middleware/validate';
import { getJobs } from '../../services/jobs';
import { audit } from '../audit/audit.service';
import { Brand } from '../catalog/brand.model';
import { invalidateCategoryCache } from '../catalog/catalog.service';
import { Category } from '../catalog/category.model';
import { Product } from '../catalog/product.model';
import { can, oid } from './common';

export const adminCatalogRouter = Router();
const idParams = z.object({ id: objectIdSchema });
const MANAGE = PERMISSIONS.ADMIN_CATALOG_MANAGE;

// ---------------- category path maintenance ----------------

type Anc = { _id: Types.ObjectId; slug: string; name: { en: string; ur: string; ar: string } };
const ancOf = (c: { _id: Types.ObjectId; slug: string; name: Anc['name'] }): Anc => ({ _id: c._id, slug: c.slug, name: { en: c.name.en, ur: c.name.ur ?? '', ar: c.name.ar ?? '' } });

/**
 * Re-derives `ancestors` for every descendant of `rootId` from the root's (already updated) ancestors.
 * Then rewrites `categoryPath` of every product under the subtree. Idempotent; safe to re-run.
 */
export async function recomputeCategoryPaths(rootId: string): Promise<{ categories: number; products: number }> {
  const root = await Category.findById(rootId).lean();
  if (!root) return { categories: 0, products: 0 };
  const descendants = await Category.find({ 'ancestors._id': root._id }).lean();
  const byId = new Map(descendants.map((d) => [String(d._id), d]));
  const resolved = new Map<string, Anc[]>([[String(root._id), root.ancestors.map(ancOf)]]);
  const ancestorsFor = (id: string): Anc[] => {
    const hit = resolved.get(id);
    if (hit) return hit;
    const c = byId.get(id)!;
    const parent = String(c.parentId) === String(root._id) ? root : byId.get(String(c.parentId));
    const value = parent ? [...ancestorsFor(String(parent._id)), ancOf(parent)] : [];
    resolved.set(id, value);
    return value;
  };
  for (const d of descendants) await Category.updateOne({ _id: d._id }, { $set: { ancestors: ancestorsFor(String(d._id)) } });

  let products = 0;
  const subtree = [root, ...descendants];
  for (const c of subtree) {
    const path = [...ancestorsFor(String(c._id)).map((a) => a._id), c._id];
    const r = await Product.updateMany({ categoryId: c._id }, { $set: { categoryPath: path } });
    products += r.modifiedCount;
  }
  invalidateCategoryCache();
  logger.info({ rootId, categories: descendants.length, products }, 'Category paths recomputed');
  return { categories: descendants.length, products };
}

/** Re-derives the paths of every category tree (all roots). Idempotent; used by the daily cron. */
export async function recomputeAllCategoryPaths(): Promise<{ categories: number; products: number }> {
  const total = { categories: 0, products: 0 };
  for (const root of await Category.find({ parentId: null }).select('_id').lean()) {
    const r = await recomputeCategoryPaths(String(root._id));
    total.categories += r.categories + 1;
    total.products += r.products;
  }
  return total;
}

export const CATEGORY_PATH_JOB = 'catalog.recomputeCategoryPaths';
getJobs().register<{ categoryId: string }>(CATEGORY_PATH_JOB, async (p) => {
  await recomputeCategoryPaths(p.categoryId);
});

async function loadParent(parentId: string | null) {
  if (!parentId) return null;
  const parent = await Category.findById(parentId).lean();
  if (!parent) throw new AppError(400, 'PARENT_NOT_FOUND', 'Parent category not found');
  return parent;
}

// ---------------- categories ----------------

adminCatalogRouter.get(
  '/categories',
  ...can(MANAGE),
  asyncHandler(async (_req, res) => {
    const all = await Category.find().sort({ order: 1, 'name.en': 1 }).lean();
    const counts = await Product.aggregate<{ _id: Types.ObjectId; n: number }>([{ $match: { deletedAt: { $exists: false } } }, { $group: { _id: '$categoryId', n: { $sum: 1 } } }]);
    const n = new Map(counts.map((c) => [String(c._id), c.n]));
    res.json({
      data: all.map((c) => ({
        id: String(c._id),
        slug: c.slug,
        name: c.name,
        parentId: c.parentId ? String(c.parentId) : null,
        ancestors: c.ancestors.map((a) => String(a._id)),
        icon: c.icon,
        image: c.image ?? null,
        color: c.color ?? null,
        order: c.order,
        isActive: c.isActive,
        commissionBps: c.commissionBps ?? null,
        attributes: c.attributes,
        productCount: n.get(String(c._id)) ?? 0,
      })),
    });
  }),
);

adminCatalogRouter.post(
  '/categories',
  ...can(MANAGE),
  validate({ body: adminCategoryCreateSchema }),
  asyncHandler(async (req, res) => {
    const b = req.body as z.infer<typeof adminCategoryCreateSchema>;
    const parent = await loadParent(b.parentId);
    const order = (await Category.countDocuments({ parentId: parent?._id ?? null })) as number;
    const c = await Category.create({
      name: b.name,
      slug: b.slug,
      parentId: parent?._id ?? null,
      ancestors: parent ? [...parent.ancestors.map(ancOf), ancOf(parent)] : [],
      order,
      isActive: b.isActive,
      ...(b.icon ? { icon: b.icon } : {}),
      ...(b.image ? { image: b.image } : {}),
      ...(b.color ? { color: b.color } : {}),
    });
    invalidateCategoryCache();
    await audit({ action: 'admin.category_created', targetType: 'Category', targetId: c._id, meta: { slug: c.slug }, req });
    res.status(201).json({ data: { id: String(c._id), slug: c.slug } });
  }),
);

adminCatalogRouter.patch(
  '/categories/:id',
  ...can(MANAGE),
  validate({ params: idParams, body: adminCategoryUpdateSchema }),
  asyncHandler(async (req, res) => {
    const b = req.body as z.infer<typeof adminCategoryUpdateSchema>;
    const set: Record<string, unknown> = {};
    // `commissionBps` is accepted but ignored: commission is a flat PLATFORM_COMMISSION_BPS (D-079).
    for (const k of ['name', 'icon', 'image', 'color', 'isActive'] as const) if (b[k] !== undefined) set[k] = b[k];
    const c = await Category.findByIdAndUpdate(req.params.id, { $set: set }, { new: true }).lean();
    if (!c) throw notFound('Category');
    // A renamed category is denormalized into its descendants' ancestors.
    if (b.name) {
      await Category.updateMany({ 'ancestors._id': c._id }, { $set: { 'ancestors.$[a].name': ancOf(c).name } }, { arrayFilters: [{ 'a._id': c._id }] });
    }
    invalidateCategoryCache();
    await audit({ action: 'admin.category_updated', targetType: 'Category', targetId: c._id, meta: { fields: Object.keys(set) }, req });
    res.json({ data: { id: String(c._id) } });
  }),
);

adminCatalogRouter.post(
  '/categories/:id/move',
  ...can(MANAGE),
  validate({ params: idParams, body: adminCategoryMoveSchema }),
  asyncHandler(async (req, res) => {
    const { parentId, order } = req.body as z.infer<typeof adminCategoryMoveSchema>;
    const c = await Category.findById(req.params.id).lean();
    if (!c) throw notFound('Category');
    const parent = await loadParent(parentId);
    if (parent && (String(parent._id) === String(c._id) || parent.ancestors.some((a) => String(a._id) === String(c._id)))) {
      throw new AppError(400, 'INVALID_MOVE', 'A category cannot be moved under itself or its own subcategory');
    }
    const ancestors = parent ? [...parent.ancestors.map(ancOf), ancOf(parent)] : [];
    const newOrder = order ?? (await Category.countDocuments({ parentId: parent?._id ?? null, _id: { $ne: c._id } }));
    await Category.updateOne({ _id: c._id }, { $set: { parentId: parent?._id ?? null, ancestors, order: newOrder } });
    invalidateCategoryCache();
    // Serverless instances may be frozen right after the response, so a background timer could never
    // run there: recompute inline instead (the daily cron also re-derives every path as a safety net).
    if (env.SERVERLESS) await recomputeCategoryPaths(String(c._id));
    else getJobs().schedule(CATEGORY_PATH_JOB, new Date(), { categoryId: String(c._id) });
    await audit({ action: 'admin.category_moved', targetType: 'Category', targetId: c._id, meta: { from: c.parentId ? String(c.parentId) : null, to: parentId }, req });
    res.status(202).json({ data: { id: String(c._id), parentId, recompute: env.SERVERLESS ? 'done' : 'scheduled' } });
  }),
);

adminCatalogRouter.post(
  '/categories/reorder',
  ...can(MANAGE),
  validate({ body: adminCategoryReorderSchema }),
  asyncHandler(async (req, res) => {
    const { parentId, ids } = req.body as z.infer<typeof adminCategoryReorderSchema>;
    const siblings = await Category.find({ parentId: parentId ? oid(parentId) : null }).select('_id').lean();
    const set = new Set(siblings.map((s) => String(s._id)));
    if (ids.length !== set.size || !ids.every((id) => set.has(id))) throw new AppError(400, 'INVALID_ORDER', 'Send every sibling category exactly once');
    await Category.bulkWrite(ids.map((id, i) => ({ updateOne: { filter: { _id: oid(id) }, update: { $set: { order: i } } } })));
    invalidateCategoryCache();
    await audit({ action: 'admin.categories_reordered', targetType: 'Category', meta: { parentId, ids }, req });
    res.json({ data: { ok: true } });
  }),
);

adminCatalogRouter.put(
  '/categories/:id/attributes',
  ...can(MANAGE),
  validate({ params: idParams, body: adminCategoryAttributesSchema }),
  asyncHandler(async (req, res) => {
    const attrs = (req.body as z.infer<typeof adminCategoryAttributesSchema>).attributes;
    const keys = attrs.map((a) => a.key);
    if (new Set(keys).size !== keys.length) throw new AppError(400, 'DUPLICATE_ATTRIBUTE', 'Attribute keys must be unique');
    for (const a of attrs) if ((a.type === 'select' || a.type === 'multiselect') && !a.options?.length) throw new AppError(400, 'OPTIONS_REQUIRED', `"${a.key}" needs options`);
    const c = await Category.findByIdAndUpdate(req.params.id, { $set: { attributes: attrs } }, { new: true }).lean();
    if (!c) throw notFound('Category');
    invalidateCategoryCache();
    await audit({ action: 'admin.category_attributes_updated', targetType: 'Category', targetId: c._id, meta: { keys }, req });
    res.json({ data: { id: String(c._id), attributes: c.attributes } });
  }),
);

adminCatalogRouter.delete(
  '/categories/:id',
  ...can(MANAGE),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const id = oid(req.params.id!);
    if (await Category.exists({ parentId: id })) throw new AppError(409, 'CATEGORY_HAS_CHILDREN', 'Move or delete the subcategories first');
    if (await Product.exists({ categoryPath: id, deletedAt: { $exists: false } })) throw new AppError(409, 'CATEGORY_HAS_PRODUCTS', 'This category still has products');
    const r = await Category.deleteOne({ _id: id });
    if (!r.deletedCount) throw notFound('Category');
    invalidateCategoryCache();
    await audit({ action: 'admin.category_deleted', targetType: 'Category', targetId: id, req });
    res.status(204).end();
  }),
);

// ---------------- brands ----------------

adminCatalogRouter.get(
  '/brands',
  ...can(MANAGE),
  asyncHandler(async (_req, res) => {
    const rows = await Brand.find().sort({ name: 1 }).limit(2000).lean();
    res.json({ data: rows.map((b) => ({ id: String(b._id), name: b.name, slug: b.slug, logo: b.logo ?? null, description: b.description ?? null, isFeatured: b.isFeatured })) });
  }),
);

adminCatalogRouter.post(
  '/brands',
  ...can(MANAGE),
  validate({ body: adminBrandSchema }),
  asyncHandler(async (req, res) => {
    const b = await Brand.create(req.body);
    await audit({ action: 'admin.brand_created', targetType: 'Brand', targetId: b._id, meta: { slug: b.slug }, req });
    res.status(201).json({ data: { id: String(b._id), slug: b.slug } });
  }),
);

adminCatalogRouter.patch(
  '/brands/:id',
  ...can(MANAGE),
  validate({ params: idParams, body: adminBrandSchema.partial() }),
  asyncHandler(async (req, res) => {
    const b = req.body as Partial<z.infer<typeof adminBrandSchema>>;
    const set: Record<string, unknown> = {};
    for (const k of ['name', 'slug', 'logo', 'description', 'isFeatured'] as const) if (b[k] !== undefined) set[k] = b[k];
    const doc = await Brand.findByIdAndUpdate(req.params.id, { $set: set }, { new: true }).lean();
    if (!doc) throw notFound('Brand');
    if (set.name) await Product.updateMany({ brandId: doc._id }, { $set: { brandName: doc.name } });
    await audit({ action: 'admin.brand_updated', targetType: 'Brand', targetId: doc._id, meta: { fields: Object.keys(set) }, req });
    res.json({ data: { id: String(doc._id) } });
  }),
);

adminCatalogRouter.delete(
  '/brands/:id',
  ...can(MANAGE),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const id = oid(req.params.id!);
    if (await Product.exists({ brandId: id, deletedAt: { $exists: false } })) throw new AppError(409, 'BRAND_IN_USE', 'Products still use this brand');
    const r = await Brand.deleteOne({ _id: id });
    if (!r.deletedCount) throw notFound('Brand');
    await audit({ action: 'admin.brand_deleted', targetType: 'Brand', targetId: id, req });
    res.status(204).end();
  }),
);

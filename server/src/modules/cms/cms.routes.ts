import { PERMISSIONS, adminHomeSchema, adminPageSchema, adminPageUpdateSchema, objectIdSchema } from '@souqly/shared';
import { Router } from 'express';
import { z } from 'zod';
import { notFound } from '../../lib/AppError';
import { asyncHandler } from '../../lib/asyncHandler';
import { sanitizeRichText } from '../../lib/sanitize';
import { validate } from '../../middleware/validate';
import { audit } from '../audit/audit.service';
import { can, iso, oid } from '../admin/common';
import { invalidateHomeCache } from '../catalog/home.service';
import { HomeContent } from '../catalog/marketing.models';
import { singleImage, storeUploadedImage } from '../delivery/imageUpload';
import { Page, type PageLean } from './page.model';
import { categoryNames, productNames, storeNames } from '../admin/names';

/** Public CMS pages: GET /api/v1/pages/:slug (published only). */
export const pagesPublicRouter = Router();
/** Admin CMS (mounted at /api/v1/admin). */
export const adminCmsRouter = Router();
const CMS = PERMISSIONS.ADMIN_CMS_MANAGE;
const slugParams = z.object({ slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{1,80}$/) });
const idParams = z.object({ id: objectIdSchema });

const sanitizeBody = (b: { en: string; ur: string; ar: string }) => ({ en: sanitizeRichText(b.en), ur: sanitizeRichText(b.ur), ar: sanitizeRichText(b.ar) });
const pageDTO = (p: PageLean) => ({ id: String(p._id), slug: p.slug, title: p.title, body: p.body, published: p.published, updatedAt: iso(p.updatedAt) });

pagesPublicRouter.get(
  '/:slug',
  validate({ params: slugParams }),
  asyncHandler(async (req, res) => {
    const p = await Page.findOne({ slug: req.params.slug, published: true }).lean<PageLean>();
    if (!p) throw notFound('Page');
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json({ data: { slug: p.slug, title: p.title, body: p.body, updatedAt: iso(p.updatedAt) } });
  }),
);

// ---------------- home page ----------------
adminCmsRouter.get(
  '/cms/home',
  ...can(CMS),
  asyncHandler(async (_req, res) => {
    const h = await HomeContent.findOne({ key: 'home' }).lean();
    const f = h?.featured;
    const [pn, sn, cn] = await Promise.all([productNames(f?.productIds ?? []), storeNames(f?.storeIds ?? []), categoryNames(f?.categoryIds ?? [])]);
    const pick = <T>(list: unknown[] | undefined, m: Map<string, T>) => (list ?? []).flatMap((id) => (m.get(String(id)) ? [m.get(String(id))!] : []));
    res.json({
      data: {
        heroSlides: h?.heroSlides ?? [],
        sections: [...(h?.sections ?? [])].sort((a, b) => a.order - b.order),
        featured: {
          productIds: (h?.featured?.productIds ?? []).map(String),
          storeIds: (h?.featured?.storeIds ?? []).map(String),
          categoryIds: (h?.featured?.categoryIds ?? []).map(String),
          // Display names for the admin editor (same order as the ids; deleted items are skipped).
          products: pick(f?.productIds, pn),
          stores: pick(f?.storeIds, sn),
          categories: pick(f?.categoryIds, cn),
        },
      },
    });
  }),
);

/** Replaces the home content. Array order = display order (drag & drop reorder on the client). */
adminCmsRouter.put(
  '/cms/home',
  ...can(CMS),
  validate({ body: adminHomeSchema }),
  asyncHandler(async (req, res) => {
    const b = req.body as z.infer<typeof adminHomeSchema>;
    const set: Record<string, unknown> = {
      heroSlides: b.heroSlides,
      sections: b.sections.map((s, i) => ({ ...s, order: i })),
    };
    if (b.featured) {
      set.featured = {
        productIds: b.featured.productIds.map(oid),
        storeIds: b.featured.storeIds.map(oid),
        categoryIds: b.featured.categoryIds.map(oid),
      };
    }
    await HomeContent.updateOne({ key: 'home' }, { $set: set }, { upsert: true });
    invalidateHomeCache();
    await audit({ action: 'admin.home_updated', targetType: 'HomeContent', meta: { slides: b.heroSlides.length, sections: b.sections.length }, req });
    res.json({ data: { ok: true } });
  }),
);

/** Image upload for hero slides / pages (multipart `file`, sniffed, ≤ 5 MB). Returns the stored URL. */
adminCmsRouter.post(
  '/cms/uploads',
  ...can(CMS),
  singleImage,
  asyncHandler(async (req, res) => {
    const { url, key } = await storeUploadedImage(req, 'cms', 'cms');
    await audit({ action: 'admin.cms_upload', targetType: 'Upload', meta: { key }, req });
    res.status(201).json({ data: { url, key } });
  }),
);

// ---------------- pages ----------------
adminCmsRouter.get(
  '/pages',
  ...can(CMS),
  asyncHandler(async (_req, res) => {
    const rows = await Page.find().sort({ slug: 1 }).lean<PageLean[]>();
    res.json({ data: rows.map(pageDTO) });
  }),
);

adminCmsRouter.get(
  '/pages/:id',
  ...can(CMS),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const p = await Page.findById(req.params.id).lean<PageLean>();
    if (!p) throw notFound('Page');
    res.json({ data: pageDTO(p) });
  }),
);

adminCmsRouter.post(
  '/pages',
  ...can(CMS),
  validate({ body: adminPageSchema }),
  asyncHandler(async (req, res) => {
    const b = req.body as z.infer<typeof adminPageSchema>;
    const p = await Page.create({ slug: b.slug, title: b.title, body: sanitizeBody(b.body), published: b.published, updatedBy: oid(req.user!.id) });
    await audit({ action: 'admin.page_created', targetType: 'Page', targetId: p._id, meta: { slug: p.slug }, req });
    res.status(201).json({ data: pageDTO(p.toObject() as PageLean) });
  }),
);

adminCmsRouter.patch(
  '/pages/:id',
  ...can(CMS),
  validate({ params: idParams, body: adminPageUpdateSchema }),
  asyncHandler(async (req, res) => {
    const b = req.body as z.infer<typeof adminPageUpdateSchema>;
    const set: Record<string, unknown> = { updatedBy: oid(req.user!.id) };
    if (b.title) set.title = b.title;
    if (b.body) set.body = sanitizeBody(b.body);
    if (b.published !== undefined) set.published = b.published;
    const p = await Page.findByIdAndUpdate(req.params.id, { $set: set }, { new: true }).lean<PageLean>();
    if (!p) throw notFound('Page');
    await audit({ action: 'admin.page_updated', targetType: 'Page', targetId: p._id, meta: { slug: p.slug, fields: Object.keys(b) }, req });
    res.json({ data: pageDTO(p) });
  }),
);

adminCmsRouter.delete(
  '/pages/:id',
  ...can(CMS),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const p = await Page.findByIdAndDelete(req.params.id).lean<PageLean>();
    if (!p) throw notFound('Page');
    await audit({ action: 'admin.page_deleted', targetType: 'Page', targetId: p._id, meta: { slug: p.slug }, req });
    res.status(204).end();
  }),
);

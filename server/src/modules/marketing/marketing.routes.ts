import {
  PERMISSIONS,
  adminNominationReviewSchema,
  bundleSchema,
  campaignNominationSchema,
  featuredProductsSchema,
  objectIdSchema,
  promotionSchema,
  sellerFlashDealSchema,
  sellerVoucherSchema,
  sellerVoucherUpdateSchema,
} from '@souqly/shared';
import { Router } from 'express';
import { z } from 'zod';
import { notFound } from '../../lib/AppError';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/auth';
import { requirePermission } from '../../middleware/permissions';
import { can } from '../admin/common';
import { storeContext } from '../../middleware/storeContext';
import { validate } from '../../middleware/validate';
import { requirePlanFeature } from '../plans/plan.service';
import type { PlanFeature } from '@souqly/shared';
import { Product } from '../catalog/product.model';
import { Store } from '../stores/store.model';
import * as svc from './marketing.service';
import { productPromotions } from './promotions.service';
import { shareSvg } from './shareImage';

const idParams = z.object({ id: objectIdSchema });
const slugParams = z.object({ slug: z.string().trim().min(1).max(160).regex(/^[a-z0-9-]+$/) });

/** Seller marketing (`/seller/marketing/*`). storeId comes ONLY from req.store. */
export const sellerMarketingRouter = Router();
sellerMarketingRouter.use(requireAuth, storeContext, requirePermission(PERMISSIONS.STORE_MARKETING_MANAGE));

type Crud = {
  path: string;
  /** Plan feature needed to create/edit (listing and deleting stay open so a downgraded store can clean up). */
  feature?: PlanFeature;
  create: z.ZodTypeAny;
  update: z.ZodTypeAny;
  list: (storeId: import('mongoose').Types.ObjectId) => Promise<unknown>;
  add: (req: import('express').Request, input: never) => Promise<unknown>;
  edit: (req: import('express').Request, id: string, input: never) => Promise<unknown>;
  remove: (req: import('express').Request, id: string) => Promise<void>;
};
const cruds: Crud[] = [
  { path: '/vouchers', create: sellerVoucherSchema, update: sellerVoucherUpdateSchema, list: svc.listVouchers, add: svc.createVoucher as never, edit: svc.updateVoucher as never, remove: svc.deleteVoucher },
  { path: '/flash-deals', feature: 'flashDeals', create: sellerFlashDealSchema, update: sellerFlashDealSchema, list: svc.listDeals, add: svc.createDeal as never, edit: svc.updateDeal as never, remove: svc.deleteDeal },
  { path: '/bundles', feature: 'bundles', create: bundleSchema, update: bundleSchema, list: svc.listBundles, add: svc.createBundle as never, edit: svc.updateBundle as never, remove: svc.deleteBundle },
  { path: '/promotions', feature: 'bundles', create: promotionSchema, update: promotionSchema, list: svc.listPromotions, add: svc.createPromotion as never, edit: svc.updatePromotion as never, remove: svc.deletePromotion },
];
for (const c of cruds) {
  const gate = c.feature ? [requirePlanFeature(c.feature)] : [];
  sellerMarketingRouter.get(c.path, asyncHandler(async (req, res) => res.json({ data: await c.list(req.store!._id) })));
  sellerMarketingRouter.post(
    c.path,
    ...gate,
    validate({ body: c.create }),
    asyncHandler(async (req, res) => res.status(201).json({ data: await c.add(req, req.body as never) })),
  );
  sellerMarketingRouter.patch(
    `${c.path}/:id`,
    ...gate,
    validate({ params: idParams, body: c.update }),
    asyncHandler(async (req, res) => res.json({ data: await c.edit(req, req.params.id!, req.body as never) })),
  );
  sellerMarketingRouter.delete(
    `${c.path}/:id`,
    validate({ params: idParams }),
    asyncHandler(async (req, res) => {
      await c.remove(req, req.params.id!);
      res.status(204).end();
    }),
  );
}

sellerMarketingRouter.get('/campaigns', asyncHandler(async (req, res) => res.json({ data: await svc.openCampaigns(req.store!._id) })));
sellerMarketingRouter.post(
  '/campaigns/:id/nominations',
  validate({ params: idParams, body: campaignNominationSchema }),
  asyncHandler(async (req, res) => res.status(201).json({ data: await svc.nominate(req, req.params.id!, req.body.items) })),
);
sellerMarketingRouter.get('/featured', asyncHandler(async (req, res) => res.json({ data: await svc.getFeatured(req.store!._id) })));
sellerMarketingRouter.put(
  '/featured',
  // Clearing the list is always allowed (a downgraded store can remove its featured section).
  (req, res, next) => (Array.isArray(req.body?.productIds) && req.body.productIds.length === 0 ? next() : requirePlanFeature('featuredProducts')(req, res, next)),
  validate({ body: featuredProductsSchema }),
  asyncHandler(async (req, res) => res.json({ data: await svc.setFeatured(req, req.body.productIds) })),
);

/** Admin: review campaign nominations. Per-route `can()` only (mounted at /admin: never add a router-level .use()). */
export const adminNominationsRouter = Router();
adminNominationsRouter.patch(
  '/campaigns/:id/nominations/:nominationId',
  ...can(PERMISSIONS.ADMIN_MARKETING_MANAGE),
  validate({ params: z.object({ id: objectIdSchema, nominationId: objectIdSchema }), body: adminNominationReviewSchema }),
  asyncHandler(async (req, res) => res.json({ data: await svc.reviewNomination(req, req.params.id!, req.params.nominationId!, req.body.status, req.body.note) })),
);

/** Public growth endpoints: PDP promotions + share images. */
export const publicMarketingRouter = Router();

publicMarketingRouter.get(
  '/products/:slug/promotions',
  validate({ params: slugParams }),
  asyncHandler(async (req, res) => {
    const p = await Product.findOne({ slug: req.params.slug, status: 'published', deletedAt: { $exists: false } }).select('_id storeId').lean();
    if (!p) throw notFound('Product');
    res.json({ data: await productPromotions(p) });
  }),
);

const sendSvg = (res: import('express').Response, svg: string) => {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
  res.type('image/svg+xml').send(svg);
};

publicMarketingRouter.get(
  '/stores/:slug/share-image.svg',
  validate({ params: slugParams }),
  asyncHandler(async (req, res) => {
    const s = await Store.findOne({ slug: req.params.slug, status: 'approved', billingStatus: { $ne: 'suspended' } }).select('name tagline themeColor ratingAvg ratingCount isMall address.city').lean();
    if (!s) throw notFound('Store');
    const sub = [s.tagline, s.address?.city].filter(Boolean).join(' · ');
    sendSvg(res, shareSvg({ kicker: s.isMall ? 'Souqly Mall store' : 'Shop on Souqly', title: s.name, ...(sub ? { subtitle: sub } : {}), ...(s.themeColor ? { themeColor: s.themeColor } : {}) }));
  }),
);

publicMarketingRouter.get(
  '/products/:slug/share-image.svg',
  validate({ params: slugParams }),
  asyncHandler(async (req, res) => {
    const p = await Product.findOne({ slug: req.params.slug, status: 'published', deletedAt: { $exists: false } }).select('title priceMin compareAtMax discountPct storeId').lean();
    if (!p) throw notFound('Product');
    const s = await Store.findById(p.storeId).select('name themeColor').lean();
    sendSvg(
      res,
      shareSvg({
        kicker: s?.name ?? 'Souqly',
        title: p.title,
        price: p.priceMin,
        ...(p.compareAtMax ? { compareAt: p.compareAtMax } : {}),
        ...(p.discountPct > 0 ? { badge: `-${p.discountPct}%` } : {}),
        ...(s?.themeColor ? { themeColor: s.themeColor } : {}),
      }),
    );
  }),
);

// `.png` is kept as a stable URL for crawlers; it redirects to the SVG (no native PNG renderer, D-073).
publicMarketingRouter.get('/stores/:slug/share-image.png', validate({ params: slugParams }), (_req, res) => res.redirect(302, `share-image.svg`));
publicMarketingRouter.get('/products/:slug/share-image.png', validate({ params: slugParams }), (_req, res) => res.redirect(302, `share-image.svg`));

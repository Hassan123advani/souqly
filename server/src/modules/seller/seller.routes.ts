import { PERMISSIONS, objectIdSchema, productCreateSchema, productUpdateSchema, sellerProductListQuerySchema, type SellerProductListQuery } from '@souqly/shared';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler';
import { MAX_VIDEO_BYTES } from '../../lib/fileType';
import { requireAuth } from '../../middleware/auth';
import { requirePermission } from '../../middleware/permissions';
import { storeContext } from '../../middleware/storeContext';
import { validate } from '../../middleware/validate';
import * as svc from './sellerProducts.service';
import { inventoryRouter } from '../inventory/inventory.routes';
import { staffRouter } from '../staff/staff.routes';
import { sellerCoreRouter } from './sellerCore.routes';

/** Seller Center API. storeId comes ONLY from req.store (storeContext). */
export const sellerRouter = Router();
sellerRouter.use(requireAuth, storeContext);

const idParams = z.object({ id: objectIdSchema });
const VIEW = requirePermission(PERMISSIONS.STORE_PRODUCTS_VIEW);
const MANAGE = requirePermission(PERMISSIONS.STORE_PRODUCTS_MANAGE);

// Size is re-checked per kind (image 5 MB / video 30 MB) after sniffing the magic bytes.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_VIDEO_BYTES, files: 1, fields: 5 } });

sellerRouter.get(
  '/products',
  VIEW,
  validate({ query: sellerProductListQuerySchema }),
  asyncHandler(async (req, res) => {
    const { items, nextCursor } = await svc.listOwn(req.store!, req.query as unknown as SellerProductListQuery);
    res.json({ data: items, meta: { nextCursor } });
  }),
);

sellerRouter.post(
  '/products',
  MANAGE,
  validate({ body: productCreateSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await svc.createProduct(req, req.body) });
  }),
);

sellerRouter.get(
  '/products/:id',
  VIEW,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.getOwn(req.store!, req.params.id!) });
  }),
);

sellerRouter.patch(
  '/products/:id',
  MANAGE,
  validate({ params: idParams, body: productUpdateSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.updateProduct(req, req.params.id!, req.body) });
  }),
);

sellerRouter.delete(
  '/products/:id',
  MANAGE,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    await svc.deleteProduct(req, req.params.id!);
    res.status(204).end();
  }),
);

sellerRouter.post(
  '/products/:id/duplicate',
  MANAGE,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await svc.duplicateProduct(req, req.params.id!) });
  }),
);

sellerRouter.post(
  '/products/:id/publish',
  MANAGE,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.publishProduct(req, req.params.id!) });
  }),
);

sellerRouter.post(
  '/uploads',
  MANAGE,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await svc.uploadMedia(req, req.file) });
  }),
);

// Phase 5: store settings, dashboard, inventory, staff & roles (all behind requireAuth + storeContext above).
sellerRouter.use(sellerCoreRouter);
sellerRouter.use(inventoryRouter);
sellerRouter.use(staffRouter);

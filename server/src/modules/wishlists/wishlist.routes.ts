import { idParamsSchema, objectIdSchema, variantQuerySchema, wishlistContainsQuerySchema, wishlistItemParamsSchema, wishlistItemSchema, wishlistNameSchema } from '@souqly/shared';
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as svc from './wishlist.service';

/** Mounted at `/wishlists`. Every query is scoped to req.user. */
export const wishlistRouter = Router();
wishlistRouter.use(requireAuth);

wishlistRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.listWishlists(req.user!.id) });
  }),
);

wishlistRouter.get(
  '/contains',
  validate({ query: wishlistContainsQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.contains(req.user!.id, (req.query as unknown as { productIds: string[] }).productIds) });
  }),
);

wishlistRouter.post(
  '/',
  validate({ body: wishlistNameSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await svc.createWishlist(req.user!.id, req.body.name) });
  }),
);

wishlistRouter.post(
  '/items',
  validate({ body: wishlistItemSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await svc.addItem(req.user!.id, null, req.body) });
  }),
);

wishlistRouter.delete(
  '/items/:productId',
  validate({ params: z.object({ productId: objectIdSchema }) }),
  asyncHandler(async (req, res) => {
    await svc.removeEverywhere(req.user!.id, String(req.params.productId));
    res.status(204).end();
  }),
);

wishlistRouter.get(
  '/:id',
  validate({ params: idParamsSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.getWishlist(req.user!.id, String(req.params.id)) });
  }),
);

wishlistRouter.patch(
  '/:id',
  validate({ params: idParamsSchema, body: wishlistNameSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.renameWishlist(req.user!.id, String(req.params.id), req.body.name) });
  }),
);

wishlistRouter.delete(
  '/:id',
  validate({ params: idParamsSchema }),
  asyncHandler(async (req, res) => {
    await svc.deleteWishlist(req.user!.id, String(req.params.id));
    res.status(204).end();
  }),
);

wishlistRouter.post(
  '/:id/items',
  validate({ params: idParamsSchema, body: wishlistItemSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await svc.addItem(req.user!.id, String(req.params.id), req.body) });
  }),
);

wishlistRouter.delete(
  '/:id/items/:productId',
  validate({ params: wishlistItemParamsSchema, query: variantQuerySchema }),
  asyncHandler(async (req, res) => {
    await svc.removeItem(req.user!.id, String(req.params.id), String(req.params.productId), (req.query as { variantId?: string }).variantId);
    res.status(204).end();
  }),
);

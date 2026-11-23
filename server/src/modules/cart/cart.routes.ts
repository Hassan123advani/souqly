import { cartAddItemSchema, cartMergeSchema, cartSelectAllSchema, cartUpdateItemSchema, cartVoucherParamsSchema, cartVoucherSchema, objectIdSchema } from '@souqly/shared';
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as svc from './cart.service';

/** Server cart of the logged-in buyer (guest carts live in localStorage and are merged on login). */
export const cartRouter = Router();
cartRouter.use(requireAuth);

const itemParams = z.object({ id: objectIdSchema });

cartRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.cartView(req.user!.id) });
  }),
);

cartRouter.post(
  '/items',
  validate({ body: cartAddItemSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await svc.addItem(req.user!.id, req.body) });
  }),
);

cartRouter.patch(
  '/items/:id',
  validate({ params: itemParams, body: cartUpdateItemSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.updateItem(req.user!.id, req.params.id!, req.body) });
  }),
);

cartRouter.delete(
  '/items/:id',
  validate({ params: itemParams }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.removeItem(req.user!.id, req.params.id!) });
  }),
);

cartRouter.post(
  '/select-all',
  validate({ body: cartSelectAllSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.selectAll(req.user!.id, req.body.selected) });
  }),
);

cartRouter.post(
  '/merge',
  validate({ body: cartMergeSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.merge(req.user!.id, req.body) });
  }),
);

cartRouter.post(
  '/vouchers',
  validate({ body: cartVoucherSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.applyVoucher(req.user!.id, req.body.code) });
  }),
);

cartRouter.delete(
  '/vouchers/:code',
  validate({ params: cartVoucherParamsSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.removeVoucher(req.user!.id, String(req.params.code)) });
  }),
);

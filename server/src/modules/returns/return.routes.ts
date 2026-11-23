import {
  PERMISSIONS,
  createReturnSchema,
  objectIdSchema,
  orderNumberParamsSchema,
  returnEscalateSchema,
  returnListQuerySchema,
  returnNoteSchema,
  returnRejectSchema,
  type CreateReturnInput,
  type ReturnListQuery,
} from '@souqly/shared';
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/auth';
import { requirePermission } from '../../middleware/permissions';
import { storeContext } from '../../middleware/storeContext';
import { validate } from '../../middleware/validate';
import { audit } from '../audit/audit.service';
import { singleImage, storeUploadedImage } from '../delivery/imageUpload';
import * as svc from './return.service';

const idParams = z.object({ id: objectIdSchema });

/** POST /orders/:number/returns (mounted at /orders before the buyer orders router). */
export const orderReturnsRouter = Router();
orderReturnsRouter.post(
  '/:number/returns',
  requireAuth,
  validate({ params: orderNumberParamsSchema, body: createReturnSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await svc.createReturn(req, String(req.params.number), req.body as CreateReturnInput) });
  }),
);

/** Buyer returns (mounted at /returns). */
export const buyerReturnsRouter = Router();
buyerReturnsRouter.use(requireAuth);

buyerReturnsRouter.post(
  '/uploads',
  singleImage,
  asyncHandler(async (req, res) => {
    const img = await storeUploadedImage(req, `returns/${req.user!.id}`, 'return');
    await audit({ action: 'upload.return_photo', req, targetType: 'User', targetId: req.user!.id, meta: { key: img.key } });
    res.status(201).json({ data: img });
  }),
);

buyerReturnsRouter.get(
  '/',
  validate({ query: returnListQuerySchema }),
  asyncHandler(async (req, res) => {
    const { items, nextCursor } = await svc.listBuyerReturns(req.user!.id, req.query as unknown as ReturnListQuery);
    res.json({ data: items, meta: { nextCursor } });
  }),
);

buyerReturnsRouter.get(
  '/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.getBuyerReturn(req.user!.id, req.params.id!) });
  }),
);

buyerReturnsRouter.post(
  '/:id/escalate',
  validate({ params: idParams, body: returnEscalateSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.escalateReturn(req, req.params.id!, (req.body as { message: string }).message) });
  }),
);

/** Seller returns (mounted at /seller/returns). storeId comes ONLY from req.store. */
export const sellerReturnsRouter = Router();
sellerReturnsRouter.use(requireAuth, storeContext);
const VIEW = requirePermission(PERMISSIONS.STORE_ORDERS_VIEW);
const MANAGE = requirePermission(PERMISSIONS.STORE_ORDERS_MANAGE);

sellerReturnsRouter.get(
  '/',
  VIEW,
  validate({ query: returnListQuerySchema }),
  asyncHandler(async (req, res) => {
    const { items, nextCursor, counts } = await svc.listStoreReturns(req.store!, req.query as unknown as ReturnListQuery);
    res.json({ data: items, meta: { nextCursor, counts } });
  }),
);

sellerReturnsRouter.get(
  '/:id',
  VIEW,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.getStoreReturn(req.store!, req.params.id!) });
  }),
);

const note = (req: { body: unknown }) => (req.body as { note?: string } | undefined)?.note;

sellerReturnsRouter.post('/:id/approve', MANAGE, validate({ params: idParams, body: returnNoteSchema }), asyncHandler(async (req, res) => {
  res.json({ data: await svc.approveReturn(req, req.params.id!, note(req)) });
}));
sellerReturnsRouter.post('/:id/reject', MANAGE, validate({ params: idParams, body: returnRejectSchema }), asyncHandler(async (req, res) => {
  res.json({ data: await svc.rejectReturn(req, req.params.id!, note(req)!) });
}));
sellerReturnsRouter.post('/:id/received', MANAGE, validate({ params: idParams, body: returnNoteSchema }), asyncHandler(async (req, res) => {
  res.json({ data: await svc.receiveReturn(req, req.params.id!, note(req)) });
}));
sellerReturnsRouter.post('/:id/refund', MANAGE, validate({ params: idParams, body: returnNoteSchema }), asyncHandler(async (req, res) => {
  res.json({ data: await svc.refundReturn(req, req.params.id!, note(req)) });
}));

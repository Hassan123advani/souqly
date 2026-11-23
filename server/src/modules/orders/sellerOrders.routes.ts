import {
  PERMISSIONS,
  assignRiderSchema,
  objectIdSchema,
  orderNoteSchema,
  sellerBulkStatusSchema,
  sellerOrderListQuerySchema,
  sellerOrderStatusSchema,
  type SellerOrderListQuery,
} from '@souqly/shared';
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/auth';
import { requirePermission } from '../../middleware/permissions';
import { storeContext } from '../../middleware/storeContext';
import { validate } from '../../middleware/validate';
import { sendPdf } from './orders.routes';
import * as svc from './sellerOrders.service';
import { listStoreRiders } from '../delivery/sellerRiders.service';

/** Seller Center orders (mounted at /seller/orders). storeId comes ONLY from req.store. */
export const sellerOrdersRouter = Router();
sellerOrdersRouter.use(requireAuth, storeContext);

const VIEW = requirePermission(PERMISSIONS.STORE_ORDERS_VIEW);
const MANAGE = requirePermission(PERMISSIONS.STORE_ORDERS_MANAGE);
const idParams = z.object({ id: objectIdSchema });

/** Lightweight rider picker for order assignment (STORE_ORDERS_VIEW, not staff.manage). */
sellerOrdersRouter.get(
  '/riders',
  VIEW,
  asyncHandler(async (req, res) => {
    const riders = await listStoreRiders(req.store!);
    res.json({ data: riders.map((r) => ({ memberId: r.memberId, user: r.user, activeDeliveries: r.activeDeliveries })) });
  }),
);

sellerOrdersRouter.get(
  '/',
  VIEW,
  validate({ query: sellerOrderListQuerySchema }),
  asyncHandler(async (req, res) => {
    const { items, nextCursor, counts } = await svc.listStoreOrders(req.store!, req.query as unknown as SellerOrderListQuery);
    res.json({ data: items, meta: { nextCursor, counts } });
  }),
);

sellerOrdersRouter.post(
  '/bulk-status',
  MANAGE,
  validate({ body: sellerBulkStatusSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.bulkStatus(req, req.body) });
  }),
);

sellerOrdersRouter.get(
  '/:id',
  VIEW,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.getStoreOrder(req.store!, req.params.id!) });
  }),
);

sellerOrdersRouter.post(
  '/:id/status',
  MANAGE,
  validate({ params: idParams, body: sellerOrderStatusSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.setStatus(req, req.params.id!, req.body) });
  }),
);

sellerOrdersRouter.post(
  '/:id/notes',
  MANAGE,
  validate({ params: idParams, body: orderNoteSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await svc.addNote(req, req.params.id!, req.body.text) });
  }),
);

sellerOrdersRouter.get(
  '/:id/invoice.pdf',
  VIEW,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const { pdf, filename } = await svc.storeInvoice(req.store!, req.params.id!);
    sendPdf(res, pdf, filename);
  }),
);

sellerOrdersRouter.get(
  '/:id/label.pdf',
  VIEW,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const { pdf, filename } = await svc.storeLabel(req.store!, req.params.id!);
    sendPdf(res, pdf, filename);
  }),
);

sellerOrdersRouter.post(
  '/:id/assign-rider',
  MANAGE,
  validate({ params: idParams, body: assignRiderSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.assignRider(req, req.params.id!, req.body.riderMemberId) });
  }),
);

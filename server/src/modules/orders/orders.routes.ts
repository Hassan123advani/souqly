import { buyerOrderListQuerySchema, orderCancelSchema, orderNumberParamsSchema, type BuyerOrderListQuery } from '@souqly/shared';
import { Router, type Response } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as svc from './orders.service';

/** Buyer "My Orders". Every query is scoped to req.user (orders of other buyers → 404). */
export const ordersRouter = Router();
ordersRouter.use(requireAuth);

export function sendPdf(res: Response, pdf: Buffer, filename: string) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename.replace(/[^A-Za-z0-9._-]/g, '')}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(pdf);
}

ordersRouter.get(
  '/',
  validate({ query: buyerOrderListQuerySchema }),
  asyncHandler(async (req, res) => {
    const { items, nextCursor, counts } = await svc.listBuyerOrders(req.user!.id, req.query as unknown as BuyerOrderListQuery);
    res.json({ data: items, meta: { nextCursor, counts } });
  }),
);

ordersRouter.get(
  '/:number/invoice.pdf',
  validate({ params: orderNumberParamsSchema }),
  asyncHandler(async (req, res) => {
    const { pdf, filename } = await svc.invoiceForViewer(req, String(req.params.number));
    sendPdf(res, pdf, filename);
  }),
);

ordersRouter.get(
  '/:number',
  validate({ params: orderNumberParamsSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.getBuyerOrder(req.user!.id, String(req.params.number)) });
  }),
);

ordersRouter.post(
  '/:number/cancel',
  validate({ params: orderNumberParamsSchema, body: orderCancelSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.cancelBuyerOrder(req, String(req.params.number), req.body.reason) });
  }),
);

ordersRouter.post(
  '/:number/reorder',
  validate({ params: orderNumberParamsSchema }),
  asyncHandler(async (req, res) => {
    const { added, skipped, cart } = await svc.reorder(req.user!.id, String(req.params.number));
    res.json({ data: cart, meta: { added, skipped } });
  }),
);

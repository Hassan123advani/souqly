import { PERMISSIONS, objectIdSchema, posCatalogQuerySchema, posLookupQuerySchema, posShiftCloseSchema, posShiftOpenSchema, posSyncSchema } from '@souqly/shared';
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/auth';
import { requirePermission } from '../../middleware/permissions';
import { storeContext } from '../../middleware/storeContext';
import { validate } from '../../middleware/validate';
import { requirePlanFeature } from '../plans/plan.service';
import * as svc from './pos.service';

const idParams = z.object({ id: objectIdSchema });

/** `/seller/pos/*` — STORE_POS_USE + plan feature `pos` (Pro+). storeId comes ONLY from req.store. */
export const sellerPosRouter = Router();
sellerPosRouter.use(requireAuth, storeContext, requirePermission(PERMISSIONS.STORE_POS_USE), requirePlanFeature('pos'));

sellerPosRouter.get(
  '/catalog',
  validate({ query: posCatalogQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof posCatalogQuerySchema>;
    const { items, serverTime } = await svc.posCatalog(req.store!._id, q.updatedSince);
    res.json({ data: items, meta: { serverTime } });
  }),
);
sellerPosRouter.get(
  '/lookup',
  validate({ query: posLookupQuerySchema }),
  asyncHandler(async (req, res) => res.json({ data: await svc.posLookup(req.store!._id, String(req.query.code)) })),
);
sellerPosRouter.post(
  '/sales',
  validate({ body: posSyncSchema }),
  asyncHandler(async (req, res) => res.json({ data: { results: await svc.syncSales(req, req.body.sales) } })),
);
sellerPosRouter.get(
  '/sales/:id/receipt',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => res.json({ data: await svc.receipt(req.store!._id, req.params.id!) })),
);
sellerPosRouter.get('/shifts', asyncHandler(async (req, res) => res.json({ data: await svc.listShifts(req.store!._id) })));
sellerPosRouter.post(
  '/shifts/open',
  validate({ body: posShiftOpenSchema }),
  asyncHandler(async (req, res) => res.status(201).json({ data: await svc.openShift(req, req.body.openingCash) })),
);
sellerPosRouter.post(
  '/shifts/:id/close',
  validate({ params: idParams, body: posShiftCloseSchema }),
  asyncHandler(async (req, res) => res.json({ data: await svc.closeShift(req, req.params.id!, req.body.countedCash, req.body.note) })),
);

/** Public digital receipt `/r/:token` (signed token; items + totals only). */
export const publicReceiptRouter = Router();
publicReceiptRouter.get(
  '/r/:token',
  validate({ params: z.object({ token: z.string().max(80).regex(/^[a-f0-9]{24}\.[A-Za-z0-9_-]{16,64}$/i) }) }),
  asyncHandler(async (req, res) => res.json({ data: await svc.publicReceipt(req.params.token!) })),
);

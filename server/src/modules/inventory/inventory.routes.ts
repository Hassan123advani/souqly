import {
  PERMISSIONS,
  inventoryAdjustSchema,
  inventoryListQuerySchema,
  movementsQuerySchema,
  objectIdSchema,
  warehouseCreateSchema,
  warehouseUpdateSchema,
  type InventoryAdjustInput,
} from '@souqly/shared';
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler';
import { requirePermission } from '../../middleware/permissions';
import { validate } from '../../middleware/validate';
import { audit } from '../audit/audit.service';
import * as svc from './inventory.service';

/** Mounted inside sellerRouter (requireAuth + storeContext already applied). storeId ONLY from req.store. */
export const inventoryRouter = Router();
const VIEW = requirePermission(PERMISSIONS.STORE_PRODUCTS_VIEW);
const MANAGE = requirePermission(PERMISSIONS.STORE_INVENTORY_MANAGE);
const idParams = z.object({ id: objectIdSchema });

inventoryRouter.get(
  '/inventory',
  VIEW,
  validate({ query: inventoryListQuerySchema }),
  asyncHandler(async (req, res) => {
    const { items, nextCursor } = await svc.listInventory(req.store!._id, req.query as unknown as Parameters<typeof svc.listInventory>[1]);
    res.json({ data: items, meta: { nextCursor } });
  }),
);

inventoryRouter.post(
  '/inventory/adjust',
  MANAGE,
  validate({ body: inventoryAdjustSchema }),
  asyncHandler(async (req, res) => {
    const b = req.body as InventoryAdjustInput;
    const result = await svc.adjustStock({
      storeId: req.store!._id,
      productId: b.productId,
      variantId: b.variantId,
      ...(b.warehouseId ? { warehouseId: b.warehouseId } : {}),
      delta: b.delta,
      reason: b.reason,
      ...(b.note ? { note: b.note } : {}),
      ref: { type: 'adjustment' },
      actorId: req.user!.id,
    });
    await audit({
      action: 'store.stock_adjusted',
      targetType: 'Product',
      targetId: b.productId,
      meta: { variantId: b.variantId, delta: b.delta, reason: b.reason, balanceAfter: result.balanceAfter },
      req,
    });
    res.json({ data: result });
  }),
);

inventoryRouter.get(
  '/inventory/movements',
  VIEW,
  validate({ query: movementsQuerySchema }),
  asyncHandler(async (req, res) => {
    const { items, nextCursor } = await svc.listMovements(req.store!._id, req.query as unknown as Parameters<typeof svc.listMovements>[1]);
    res.json({ data: items, meta: { nextCursor } });
  }),
);

inventoryRouter.get(
  '/warehouses',
  VIEW,
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.listWarehouses(req.store!._id) });
  }),
);

inventoryRouter.post(
  '/warehouses',
  MANAGE,
  validate({ body: warehouseCreateSchema }),
  asyncHandler(async (req, res) => {
    const w = await svc.createWarehouse(req.store!._id, req.body);
    await audit({ action: 'store.warehouse_created', targetType: 'Warehouse', targetId: w.id, meta: { name: w.name }, req });
    res.status(201).json({ data: w });
  }),
);

inventoryRouter.patch(
  '/warehouses/:id',
  MANAGE,
  validate({ params: idParams, body: warehouseUpdateSchema }),
  asyncHandler(async (req, res) => {
    const w = await svc.updateWarehouse(req.store!._id, req.params.id!, req.body);
    await audit({ action: 'store.warehouse_updated', targetType: 'Warehouse', targetId: w.id, meta: { fields: Object.keys(req.body) }, req });
    res.json({ data: w });
  }),
);

inventoryRouter.delete(
  '/warehouses/:id',
  MANAGE,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    await svc.deleteWarehouse(req.store!._id, req.params.id!);
    await audit({ action: 'store.warehouse_deleted', targetType: 'Warehouse', targetId: req.params.id!, req });
    res.status(204).end();
  }),
);

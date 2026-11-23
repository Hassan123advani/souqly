import type { InventoryRow, StockMovementDTO, StockMovementReason, WarehouseDTO } from '@souqly/shared';
import { Types, type ClientSession, type PipelineStage } from 'mongoose';
import { AppError, notFound } from '../../lib/AppError';
import { escapeRegex } from '../../lib/text';
import { Product } from '../catalog/product.model';
import { getLowStockThreshold } from '../seller/storeSettings.service';
import { StockMovement } from './stockMovement.model';
import { Warehouse } from './warehouse.model';

/**
 * Inventory service. `adjustStock()` and `recordMovement()` are the reusable entry points for other
 * modules (orders / POS): ALWAYS pass the storeId of the acting store; ids are never trusted alone.
 */

type Id = Types.ObjectId | string;
const oid = (id: Id) => new Types.ObjectId(String(id));

export type MovementRef = { type: 'order' | 'pos' | 'adjustment'; id?: string };

export type RecordMovementInput = {
  storeId: Id;
  productId: Id;
  variantId: Id;
  warehouseId?: Id;
  delta: number;
  reason: StockMovementReason;
  note?: string;
  ref?: MovementRef;
  actorId?: Id;
  balanceAfter: number;
  session?: ClientSession;
};

/** Appends a ledger row. Use it when the stock itself was already changed by the caller (e.g. checkout reservation). */
export async function recordMovement(m: RecordMovementInput): Promise<string> {
  const [doc] = await StockMovement.create(
    [
      {
        storeId: oid(m.storeId),
        productId: oid(m.productId),
        variantId: oid(m.variantId),
        ...(m.warehouseId ? { warehouseId: oid(m.warehouseId) } : {}),
        delta: m.delta,
        reason: m.reason,
        ...(m.note ? { note: m.note } : {}),
        ...(m.ref ? { ref: m.ref } : {}),
        ...(m.actorId ? { actorId: oid(m.actorId) } : {}),
        balanceAfter: m.balanceAfter,
      },
    ],
    m.session ? { session: m.session } : {},
  );
  return String(doc!._id);
}

/** Recomputes Product.totalStock (sum of available = stock - reserved over active variants) atomically server-side. */
export async function recomputeTotalStock(productId: Id, session?: ClientSession): Promise<void> {
  await Product.updateOne(
    { _id: oid(productId) },
    [
      {
        $set: {
          totalStock: {
            $sum: {
              $map: {
                input: { $filter: { input: '$variants', as: 'v', cond: { $ne: ['$$v.isActive', false] } } },
                as: 'v',
                in: { $max: [0, { $subtract: ['$$v.stock', { $ifNull: ['$$v.reserved', 0] }] }] },
              },
            },
          },
        },
      },
    ],
    session ? { session } : {},
  );
}

export type AdjustStockInput = Omit<RecordMovementInput, 'balanceAfter'>;

/**
 * Atomically changes a variant's stock by `delta` ($inc guarded so it never goes below 0, also per
 * warehouse when `warehouseId` is given), recomputes totalStock and records a StockMovement.
 * Throws 404 NOT_FOUND (product/variant/warehouse not in this store) or 409 INSUFFICIENT_STOCK.
 */
export async function adjustStock(input: AdjustStockInput): Promise<{ balanceAfter: number; movementId: string }> {
  if (!Number.isInteger(input.delta) || input.delta === 0) throw new AppError(400, 'INVALID_DELTA', 'Delta must be a non-zero integer');
  const storeId = oid(input.storeId);
  const productId = oid(input.productId);
  const variantId = oid(input.variantId);
  const opts = input.session ? { session: input.session } : {};
  const base = { _id: productId, storeId, deletedAt: { $exists: false } };

  let warehouseId: Types.ObjectId | undefined;
  if (input.warehouseId) {
    warehouseId = oid(input.warehouseId);
    if (!(await Warehouse.exists({ _id: warehouseId, storeId }).session(input.session ?? null))) throw notFound('Warehouse');
    if (input.delta > 0) {
      // First stock in this warehouse: create its (qty 0) slot so the guarded $inc below can match.
      await Product.updateOne(
        { ...base, variants: { $elemMatch: { _id: variantId, 'warehouseStock.warehouseId': { $ne: warehouseId } } } },
        { $push: { 'variants.$.warehouseStock': { warehouseId, qty: 0 } } },
        opts,
      );
    }
  }

  const need = -input.delta; // only matters when removing stock
  const variantMatch: Record<string, unknown> = { _id: variantId, stock: { $gte: Math.max(0, need) } };
  if (warehouseId) variantMatch.warehouseStock = { $elemMatch: { warehouseId, qty: { $gte: Math.max(0, need) } } };

  const updated = await Product.findOneAndUpdate(
    { ...base, variants: { $elemMatch: variantMatch } },
    {
      $inc: {
        'variants.$[v].stock': input.delta,
        ...(warehouseId ? { 'variants.$[v].warehouseStock.$[w].qty': input.delta } : {}),
      },
    },
    {
      ...opts,
      new: true,
      projection: { variants: 1 },
      arrayFilters: [{ 'v._id': variantId }, ...(warehouseId ? [{ 'w.warehouseId': warehouseId }] : [])],
    },
  ).lean();

  if (!updated) {
    const exists = await Product.exists({ ...base, 'variants._id': variantId }).session(input.session ?? null);
    if (!exists) throw notFound('Product variant');
    throw new AppError(409, 'INSUFFICIENT_STOCK', 'Not enough stock to remove that many units');
  }
  const balanceAfter = updated.variants.find((v) => v._id.equals(variantId))!.stock;
  await recomputeTotalStock(productId, input.session);
  const movementId = await recordMovement({ ...input, storeId, productId, variantId, ...(warehouseId ? { warehouseId } : {}), balanceAfter });
  return { balanceAfter, movementId };
}

// ---------------------------------------------------------------------------------------------
// Seller views
// ---------------------------------------------------------------------------------------------

/** One product row per variant after $unwind (so `variants` is a single object). */
type InvRow = {
  _id: Types.ObjectId;
  title: string;
  slug: string;
  images?: { url: string }[];
  variants: { _id: Types.ObjectId; sku: string; options?: Record<string, string>; stock: number; reserved?: number; warehouseStock?: { warehouseId: Types.ObjectId; qty: number }[] };
};

/** Variant rows of the store's (non-deleted) products, newest product first. Cursor = `${productId}_${variantId}`. */
export async function listInventory(storeId: Types.ObjectId, q: { cursor?: string; limit: number; lowStock?: boolean; q?: string }): Promise<{ items: InventoryRow[]; nextCursor: string | null }> {
  const threshold = await getLowStockThreshold(storeId);
  const pipeline: PipelineStage[] = [{ $match: { storeId, deletedAt: { $exists: false } } }, { $unwind: '$variants' }];
  if (q.q) {
    const rx = { $regex: escapeRegex(q.q), $options: 'i' };
    pipeline.push({ $match: { $or: [{ title: rx }, { 'variants.sku': rx }] } });
  }
  if (q.lowStock) {
    pipeline.push({ $match: { $expr: { $lte: [{ $subtract: ['$variants.stock', { $ifNull: ['$variants.reserved', 0] }] }, threshold] } } });
  }
  if (q.cursor) {
    const [p, v] = q.cursor.split('_');
    if (!p || !v || !Types.ObjectId.isValid(p) || !Types.ObjectId.isValid(v)) throw new AppError(400, 'INVALID_CURSOR', 'Invalid cursor');
    pipeline.push({ $match: { $or: [{ _id: { $lt: oid(p) } }, { _id: oid(p), 'variants._id': { $gt: oid(v) } }] } });
  }
  pipeline.push({ $sort: { _id: -1, 'variants._id': 1 } }, { $limit: q.limit + 1 }, { $project: { title: 1, slug: 1, images: { $slice: ['$images', 1] }, variants: 1 } });
  const rows = await Product.aggregate<InvRow>(pipeline);
  const page = rows.slice(0, q.limit);
  const last = page[page.length - 1];
  return {
    items: page.map((r) => {
      const v = r.variants;
      const reserved = v.reserved ?? 0;
      const available = Math.max(0, v.stock - reserved);
      return {
        productId: String(r._id),
        variantId: String(v._id),
        title: r.title,
        slug: r.slug,
        ...(r.images?.[0]?.url ? { image: r.images[0].url } : {}),
        sku: v.sku,
        options: v.options ?? {},
        stock: v.stock,
        reserved,
        available,
        lowStock: available <= threshold,
        warehouseStock: (v.warehouseStock ?? []).map((w) => ({ warehouseId: String(w.warehouseId), qty: w.qty })),
      };
    }),
    nextCursor: rows.length > q.limit && last ? `${String(last._id)}_${String(last.variants._id)}` : null,
  };
}

/** Number of variants at or below the store's low-stock threshold (dashboard to-do). */
export async function countLowStock(storeId: Types.ObjectId): Promise<number> {
  const threshold = await getLowStockThreshold(storeId);
  const [row] = await Product.aggregate<{ n: number }>([
    { $match: { storeId, deletedAt: { $exists: false }, status: { $ne: 'archived' } } },
    { $unwind: '$variants' },
    { $match: { 'variants.isActive': { $ne: false }, $expr: { $lte: [{ $subtract: ['$variants.stock', { $ifNull: ['$variants.reserved', 0] }] }, threshold] } } },
    { $count: 'n' },
  ]);
  return row?.n ?? 0;
}

export async function listMovements(storeId: Types.ObjectId, q: { cursor?: string; limit: number; productId?: string }): Promise<{ items: StockMovementDTO[]; nextCursor: string | null }> {
  const filter: Record<string, unknown> = { storeId };
  if (q.productId) filter.productId = oid(q.productId);
  if (q.cursor) {
    if (!Types.ObjectId.isValid(q.cursor)) throw new AppError(400, 'INVALID_CURSOR', 'Invalid cursor');
    filter._id = { $lt: oid(q.cursor) };
  }
  const rows = await StockMovement.find(filter).sort({ _id: -1 }).limit(q.limit + 1).lean();
  const page = rows.slice(0, q.limit);
  return {
    items: page.map((m) => ({
      id: String(m._id),
      productId: String(m.productId),
      variantId: String(m.variantId),
      ...(m.warehouseId ? { warehouseId: String(m.warehouseId) } : {}),
      delta: m.delta,
      reason: m.reason,
      ...(m.note ? { note: m.note } : {}),
      ...(m.ref?.type ? { ref: { type: m.ref.type, ...(m.ref.id ? { id: m.ref.id } : {}) } } : {}),
      ...(m.actorId ? { actorId: String(m.actorId) } : {}),
      balanceAfter: m.balanceAfter,
      createdAt: m.createdAt.toISOString(),
    })),
    nextCursor: rows.length > q.limit ? String(page[page.length - 1]!._id) : null,
  };
}

// ---------------------------------------------------------------------------------------------
// Warehouses
// ---------------------------------------------------------------------------------------------

const toWarehouse = (w: { _id: Types.ObjectId; name: string; address: WarehouseDTO['address']; isDefault: boolean }): WarehouseDTO => ({
  id: String(w._id),
  name: w.name,
  address: w.address,
  isDefault: !!w.isDefault,
});

export async function listWarehouses(storeId: Types.ObjectId): Promise<WarehouseDTO[]> {
  return (await Warehouse.find({ storeId }).sort({ isDefault: -1, name: 1 }).lean()).map(toWarehouse);
}

const dupName = (err: unknown) => ((err as { code?: number }).code === 11000 ? new AppError(409, 'WAREHOUSE_EXISTS', 'A warehouse with this name already exists') : err);

export async function createWarehouse(storeId: Types.ObjectId, input: { name: string; address: WarehouseDTO['address']; isDefault: boolean }): Promise<WarehouseDTO> {
  if ((await Warehouse.countDocuments({ storeId })) >= 20) throw new AppError(409, 'WAREHOUSE_LIMIT', 'A store can have at most 20 warehouses');
  const first = !(await Warehouse.exists({ storeId }));
  const makeDefault = input.isDefault || first;
  if (makeDefault) await Warehouse.updateMany({ storeId, isDefault: true }, { $set: { isDefault: false } });
  const w = await Warehouse.create({ storeId, name: input.name, address: input.address, isDefault: makeDefault }).catch((e) => {
    throw dupName(e);
  });
  return toWarehouse(w);
}

export async function updateWarehouse(storeId: Types.ObjectId, id: string, input: { name?: string; address?: WarehouseDTO['address']; isDefault?: true }): Promise<WarehouseDTO> {
  const w = await Warehouse.findOne({ _id: oid(id), storeId });
  if (!w) throw notFound('Warehouse');
  if (input.isDefault && !w.isDefault) await Warehouse.updateMany({ storeId, isDefault: true }, { $set: { isDefault: false } });
  if (input.name) w.name = input.name;
  if (input.address) w.set('address', input.address);
  if (input.isDefault) w.isDefault = true;
  await w.save().catch((e) => {
    throw dupName(e);
  });
  return toWarehouse(w);
}

/** A warehouse that still holds stock cannot be deleted. Empty slots are removed from variants. */
export async function deleteWarehouse(storeId: Types.ObjectId, id: string): Promise<void> {
  const w = await Warehouse.findOne({ _id: oid(id), storeId });
  if (!w) throw notFound('Warehouse');
  const holding = await Product.exists({ storeId, variants: { $elemMatch: { warehouseStock: { $elemMatch: { warehouseId: w._id, qty: { $gt: 0 } } } } } });
  if (holding) throw new AppError(409, 'WAREHOUSE_NOT_EMPTY', 'Move or remove the stock in this warehouse first');
  await Product.updateMany({ storeId, 'variants.warehouseStock.warehouseId': w._id }, { $pull: { 'variants.$[].warehouseStock': { warehouseId: w._id } } });
  await w.deleteOne();
  if (w.isDefault) {
    const next = await Warehouse.findOne({ storeId }).sort({ createdAt: 1 });
    if (next) await Warehouse.updateOne({ _id: next._id }, { $set: { isDefault: true } });
  }
}

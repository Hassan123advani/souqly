import type { StockMovementReason } from '@souqly/shared';
import type { Types } from 'mongoose';
import { logger } from '../../lib/logger';
import { Product } from '../catalog/product.model';
import { recordMovement } from '../inventory/inventory.service';

export interface StockLine {
  productId: Types.ObjectId;
  variantId: Types.ObjectId;
  storeId: Types.ObjectId;
  qty: number;
  title?: string;
}

/** Writes a StockMovement ledger row (Phase 5 `recordMovement`). Never throws: the ledger is not a gate. */
export async function writeStockMovement(m: {
  storeId: Types.ObjectId;
  productId: Types.ObjectId;
  variantId: Types.ObjectId;
  delta: number;
  reason: StockMovementReason;
  note?: string;
  ref?: { type: 'order' | 'pos' | 'adjustment'; id: Types.ObjectId };
  actorId?: Types.ObjectId | null;
}): Promise<void> {
  try {
    const p = await Product.findOne({ _id: m.productId, 'variants._id': m.variantId }, { 'variants.$': 1 }).lean();
    await recordMovement({
      storeId: m.storeId,
      productId: m.productId,
      variantId: m.variantId,
      delta: m.delta,
      reason: m.reason,
      ...(m.note ? { note: m.note } : {}),
      ...(m.ref ? { ref: { type: m.ref.type, id: String(m.ref.id) } } : {}),
      ...(m.actorId ? { actorId: m.actorId } : {}),
      balanceAfter: p?.variants?.[0]?.stock ?? 0,
    });
  } catch (err) {
    logger.warn({ err, productId: String(m.productId) }, 'Failed to write stock movement');
  }
}

/** Atomically takes `qty` units of one variant (only if enough stock); also counts them as sold. */
async function takeOne(l: StockLine): Promise<boolean> {
  const res = await Product.updateOne(
    { _id: l.productId, status: 'published', variants: { $elemMatch: { _id: l.variantId, isActive: true, stock: { $gte: l.qty } } } },
    { $inc: { 'variants.$.stock': -l.qty, totalStock: -l.qty, soldCount: l.qty } },
  );
  return res.modifiedCount === 1;
}

/** Puts units back (rollback or cancellation). */
async function putBack(l: StockLine, unsell: boolean): Promise<void> {
  await Product.updateOne(
    { _id: l.productId, 'variants._id': l.variantId },
    { $inc: { 'variants.$.stock': l.qty, totalStock: l.qty, ...(unsell ? { soldCount: -l.qty } : {}) } },
  );
}

/**
 * Reserves every line or none: on the first failure, already-taken lines are restored and the
 * failed lines are returned. Lines are processed in a stable order (productId, variantId).
 */
export async function reserveAll(lines: StockLine[]): Promise<{ ok: true } | { ok: false; failed: StockLine[] }> {
  const sorted = [...lines].sort((a, b) => `${a.productId}${a.variantId}`.localeCompare(`${b.productId}${b.variantId}`));
  const taken: StockLine[] = [];
  for (const l of sorted) {
    if (await takeOne(l)) taken.push(l);
    else {
      await Promise.all(taken.map((t) => putBack(t, true)));
      return { ok: false, failed: [l] };
    }
  }
  return { ok: true };
}

/** Rolls back a successful `reserveAll` (e.g. when order creation fails afterwards). */
export async function releaseAll(lines: StockLine[]): Promise<void> {
  await Promise.all(lines.map((l) => putBack(l, true)));
}

/** Restores the stock of a cancelled order and writes `cancel` movements. */
export async function restoreOrderStock(
  order: { _id: Types.ObjectId; storeId: Types.ObjectId; items: { productId: Types.ObjectId; variantId: Types.ObjectId; qty: number }[] },
  actorId: Types.ObjectId | null,
  reason: 'cancel' | 'return' = 'cancel',
): Promise<void> {
  for (const it of order.items) {
    await putBack({ productId: it.productId, variantId: it.variantId, storeId: order.storeId, qty: it.qty }, true);
    await writeStockMovement({
      storeId: order.storeId,
      productId: it.productId,
      variantId: it.variantId,
      delta: it.qty,
      reason,
      ref: { type: 'order', id: order._id },
      actorId,
    });
  }
}

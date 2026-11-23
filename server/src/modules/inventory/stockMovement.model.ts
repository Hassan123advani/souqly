import { STOCK_MOVEMENT_REASONS, type StockMovementReason } from '@souqly/shared';
import { Schema, Types, model } from 'mongoose';

/** Append-only ledger of every stock change (manual adjustments, orders, POS). */
export interface IStockMovement {
  storeId: Types.ObjectId;
  productId: Types.ObjectId;
  variantId: Types.ObjectId;
  warehouseId?: Types.ObjectId;
  delta: number;
  reason: StockMovementReason;
  note?: string;
  ref?: { type: 'order' | 'pos' | 'adjustment'; id?: string };
  actorId?: Types.ObjectId;
  /** Variant total `stock` right after this movement. */
  balanceAfter: number;
  createdAt: Date;
}

const stockMovementSchema = new Schema<IStockMovement>({
  storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  variantId: { type: Schema.Types.ObjectId, required: true },
  warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse' },
  delta: { type: Number, required: true },
  reason: { type: String, enum: STOCK_MOVEMENT_REASONS, required: true },
  note: { type: String, maxlength: 300 },
  ref: { type: { type: String, enum: ['order', 'pos', 'adjustment'] }, id: String, _id: false },
  actorId: { type: Schema.Types.ObjectId, ref: 'User' },
  balanceAfter: { type: Number, required: true },
  createdAt: { type: Date, default: () => new Date() },
});
stockMovementSchema.index({ storeId: 1, _id: -1 });
stockMovementSchema.index({ storeId: 1, productId: 1, _id: -1 });

export const StockMovement = model<IStockMovement>('StockMovement', stockMovementSchema);

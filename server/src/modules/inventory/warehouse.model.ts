import { Schema, Types, model, type HydratedDocument } from 'mongoose';

export interface IWarehouse {
  storeId: Types.ObjectId;
  name: string;
  address: { line1?: string; area?: string; city: string; postalCode?: string };
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const warehouseSchema = new Schema<IWarehouse>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    address: { line1: String, area: String, city: { type: String, required: true }, postalCode: String },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true },
);
warehouseSchema.index({ storeId: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
// At most one default warehouse per store.
warehouseSchema.index({ storeId: 1, isDefault: 1 }, { unique: true, partialFilterExpression: { isDefault: true } });

export const Warehouse = model<IWarehouse>('Warehouse', warehouseSchema);
export type WarehouseDoc = HydratedDocument<IWarehouse>;

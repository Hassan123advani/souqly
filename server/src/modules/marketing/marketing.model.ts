import { Schema, Types, model } from 'mongoose';

/**
 * Seller marketing tools (Phase 10, docs/api-growth.md). Every document is store-owned: `storeId`
 * first in every compound index; seller routes always filter by req.store._id.
 */

// ---------------------------------------------------------------------------------------------
// Store flash deal: discounted price window for selected variants of the store's own products.
// ---------------------------------------------------------------------------------------------
export interface IStoreFlashDeal {
  storeId: Types.ObjectId;
  title: string;
  startsAt: Date;
  endsAt: Date;
  items: { productId: Types.ObjectId; variantId?: Types.ObjectId; price: number; quantityLimit: number; sold: number }[];
  isActive: boolean;
  demo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const flashDealSchema = new Schema<IStoreFlashDeal>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    title: { type: String, required: true, maxlength: 120 },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    items: [
      {
        productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
        variantId: Schema.Types.ObjectId,
        price: { type: Number, required: true, min: 0 },
        quantityLimit: { type: Number, default: 100 },
        sold: { type: Number, default: 0 },
        _id: false,
      },
    ],
    isActive: { type: Boolean, default: true },
    demo: { type: Boolean, default: false },
  },
  { timestamps: true },
);
flashDealSchema.index({ storeId: 1, endsAt: -1 });
flashDealSchema.index({ 'items.productId': 1, isActive: 1, endsAt: 1 });
export const StoreFlashDeal = model<IStoreFlashDeal>('StoreFlashDeal', flashDealSchema);

// ---------------------------------------------------------------------------------------------
// Bundle: buy every item (in qty) together for `bundlePrice`.
// ---------------------------------------------------------------------------------------------
export interface IBundle {
  storeId: Types.ObjectId;
  name: string;
  items: { productId: Types.ObjectId; variantId?: Types.ObjectId; qty: number }[];
  bundlePrice: number;
  isActive: boolean;
  startsAt?: Date;
  endsAt?: Date;
  demo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const bundleSchema = new Schema<IBundle>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    name: { type: String, required: true, maxlength: 120 },
    items: [
      {
        productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
        variantId: Schema.Types.ObjectId,
        qty: { type: Number, required: true, min: 1 },
        _id: false,
      },
    ],
    bundlePrice: { type: Number, required: true, min: 1 },
    isActive: { type: Boolean, default: true },
    startsAt: Date,
    endsAt: Date,
    demo: { type: Boolean, default: false },
  },
  { timestamps: true },
);
bundleSchema.index({ storeId: 1, isActive: 1 });
bundleSchema.index({ 'items.productId': 1, isActive: 1 });
export const Bundle = model<IBundle>('Bundle', bundleSchema);

// ---------------------------------------------------------------------------------------------
// Promotion (buy X get Y)
// ---------------------------------------------------------------------------------------------
export interface IPromotion {
  storeId: Types.ObjectId;
  type: 'bxgy';
  name: string;
  buy: { productIds: Types.ObjectId[]; qty: number };
  get: { productIds: Types.ObjectId[]; qty: number; discountBps: number };
  startsAt: Date;
  endsAt: Date;
  isActive: boolean;
  demo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const promotionSchema = new Schema<IPromotion>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    type: { type: String, enum: ['bxgy'], default: 'bxgy' },
    name: { type: String, required: true, maxlength: 120 },
    buy: { productIds: [Schema.Types.ObjectId], qty: { type: Number, min: 1, required: true } },
    get: { productIds: [Schema.Types.ObjectId], qty: { type: Number, min: 1, required: true }, discountBps: { type: Number, min: 1, max: 10_000, required: true } },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
    demo: { type: Boolean, default: false },
  },
  // `get` is the documented API field name (buy X get Y); it is a plain sub-object, never a getter.
  { timestamps: true, suppressReservedKeysWarning: true },
);
promotionSchema.index({ storeId: 1, isActive: 1, endsAt: 1 });
promotionSchema.index({ 'buy.productIds': 1, isActive: 1 });
promotionSchema.index({ 'get.productIds': 1, isActive: 1 });
export const Promotion = model<IPromotion>('Promotion', promotionSchema);

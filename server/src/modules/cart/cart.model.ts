import { Schema, Types, model, type HydratedDocument } from 'mongoose';

export interface ICartItem {
  _id: Types.ObjectId;
  productId: Types.ObjectId;
  variantId: Types.ObjectId;
  storeId: Types.ObjectId;
  qty: number;
  selected: boolean;
  savedForLater: boolean;
  /** Unit price the buyer last saw (minor units); used to flag `price_changed`. */
  seenPrice: number;
  addedAt: Date;
}

export interface ICart {
  userId: Types.ObjectId;
  items: Types.DocumentArray<ICartItem & Types.Subdocument>;
  vouchers: { platform?: string | null; store: { storeId: Types.ObjectId; code: string }[] };
  demo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const cartItemSchema = new Schema<ICartItem>({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  variantId: { type: Schema.Types.ObjectId, required: true },
  storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
  qty: { type: Number, required: true, min: 1 },
  selected: { type: Boolean, default: true },
  savedForLater: { type: Boolean, default: false },
  seenPrice: { type: Number, default: 0 },
  addedAt: { type: Date, default: () => new Date() },
});

const cartSchema = new Schema<ICart>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    items: { type: [cartItemSchema], default: [] },
    vouchers: {
      platform: { type: String, default: null },
      store: { type: [{ storeId: Schema.Types.ObjectId, code: String, _id: false }], default: [] },
    },
    demo: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const Cart = model<ICart>('Cart', cartSchema);
export type CartDoc = HydratedDocument<ICart>;

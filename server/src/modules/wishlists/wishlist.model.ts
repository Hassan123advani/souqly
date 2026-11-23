import { Schema, Types, model, type HydratedDocument } from 'mongoose';

export const MAX_WISHLISTS = 20;
export const MAX_WISHLIST_ITEMS = 500;
export const DEFAULT_WISHLIST_NAME = 'My wishlist';

export interface IWishlistItem {
  productId: Types.ObjectId;
  variantId?: Types.ObjectId | null;
  addedAt: Date;
  priceAtAdd: number;
}

export interface IWishlist {
  userId: Types.ObjectId;
  name: string;
  isDefault: boolean;
  items: IWishlistItem[];
  demo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IWishlist>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    isDefault: { type: Boolean, default: false },
    items: {
      type: [
        {
          productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
          variantId: { type: Schema.Types.ObjectId, default: null },
          addedAt: { type: Date, default: () => new Date() },
          priceAtAdd: { type: Number, default: 0 },
          _id: false,
        },
      ],
      default: [],
    },
    demo: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

schema.index({ userId: 1, createdAt: 1 });
schema.index({ userId: 1, 'items.productId': 1 });
// At most one default list per user.
schema.index({ userId: 1, isDefault: 1 }, { unique: true, partialFilterExpression: { isDefault: true } });

export const Wishlist = model<IWishlist>('Wishlist', schema);
export type WishlistDoc = HydratedDocument<IWishlist>;
export type WishlistLean = IWishlist & { _id: Types.ObjectId };

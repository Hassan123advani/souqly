import { ALERT_TYPES, type AlertType } from '@souqly/shared';
import { Schema, Types, model } from 'mongoose';

export interface IProductAlert {
  userId: Types.ObjectId;
  productId: Types.ObjectId;
  variantId: Types.ObjectId | null;
  type: AlertType;
  /** Price (minor units) at subscription / last notification; a drop below it notifies. */
  targetPrice: number;
  active: boolean;
  notifiedAt?: Date;
  demo: boolean;
  createdAt: Date;
}

const schema = new Schema<IProductAlert>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: Schema.Types.ObjectId, default: null },
    type: { type: String, enum: ALERT_TYPES, required: true },
    targetPrice: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    notifiedAt: Date,
    demo: { type: Boolean, default: false, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

schema.index({ userId: 1, productId: 1, variantId: 1, type: 1 }, { unique: true });
schema.index({ productId: 1, active: 1 });
schema.index({ active: 1, productId: 1 });

export const ProductAlert = model<IProductAlert>('ProductAlert', schema);
export type ProductAlertLean = IProductAlert & { _id: Types.ObjectId };

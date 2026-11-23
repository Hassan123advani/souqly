import { PAYMENT_METHODS, type PaymentMethod } from '@souqly/shared';
import { Schema, Types, model, type HydratedDocument } from 'mongoose';
import { PAYMENT_STATUSES, type IAddressSnapshot, type PaymentStatus } from '../orders/order.model';

export interface ICheckout {
  userId: Types.ObjectId;
  number: string;
  /** Client-generated; unique per user so retries return the original checkout. */
  idempotencyKey: string;
  /** 'processing' while stock is being reserved; 'completed' once orders exist; 'failed' after a rollback. */
  state: 'processing' | 'completed' | 'failed';
  addressSnapshot: IAddressSnapshot;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  totals: { itemsSubtotal: number; shippingTotal: number; discountTotal: number; coins: number; total: number };
  vouchers: { platform?: string; store: string[] };
  orderIds: Types.ObjectId[];
  demo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const checkoutSchema = new Schema<ICheckout>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    number: { type: String, required: true, unique: true },
    idempotencyKey: { type: String, required: true },
    state: { type: String, enum: ['processing', 'completed', 'failed'], default: 'processing' },
    addressSnapshot: { fullName: String, phone: String, country: String, city: String, area: String, line1: String, line2: String, postalCode: String },
    paymentMethod: { type: String, enum: PAYMENT_METHODS, required: true },
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: 'pending' },
    totals: {
      itemsSubtotal: { type: Number, default: 0 },
      shippingTotal: { type: Number, default: 0 },
      discountTotal: { type: Number, default: 0 },
      coins: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
    },
    vouchers: { platform: String, store: { type: [String], default: [] } },
    orderIds: { type: [Schema.Types.ObjectId], default: [] },
    demo: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);
checkoutSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
checkoutSchema.index({ userId: 1, createdAt: -1 });

export const Checkout = model<ICheckout>('Checkout', checkoutSchema);
export type CheckoutDoc = HydratedDocument<ICheckout>;

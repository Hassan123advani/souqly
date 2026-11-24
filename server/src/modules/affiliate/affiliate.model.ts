import { Schema, Types, model } from 'mongoose';

/** One commission per (order) for the affiliate who referred it (flag `affiliateLinks`, Phase 10). */
export interface IAffiliateCommission {
  affiliateUserId: Types.ObjectId;
  orderId: Types.ObjectId;
  storeId: Types.ObjectId;
  orderNumber: string;
  /** Item value the rate applies to (items after promo + store voucher), paisa. */
  base: number;
  bps: number;
  amount: number;
  status: 'pending' | 'credited' | 'void';
  creditedAt?: Date;
  /** Set on delivery: the commission is paid after this (return window, M3). */
  releaseAt?: Date;
  /** A paid commission clawed back after a refund/cancel. */
  reversedAt?: Date;
  demo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IAffiliateCommission>(
  {
    affiliateUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    orderNumber: { type: String, required: true },
    base: { type: Number, required: true, min: 0 },
    bps: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['pending', 'credited', 'void'], default: 'pending' },
    creditedAt: Date,
    releaseAt: Date,
    reversedAt: Date,
    demo: { type: Boolean, default: false },
  },
  { timestamps: true },
);
schema.index({ orderId: 1 }, { unique: true });
schema.index({ affiliateUserId: 1, createdAt: -1 });
schema.index({ storeId: 1, createdAt: -1 });
schema.index({ status: 1, releaseAt: 1 });

export const AffiliateCommission = model<IAffiliateCommission>('AffiliateCommission', schema);
export type AffiliateCommissionLean = IAffiliateCommission & { _id: Types.ObjectId };

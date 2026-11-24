import { BILLING_ADJUSTMENT_TYPES, type BillingAdjustmentType } from '@souqly/shared';
import { Schema, model, type Types } from 'mongoose';

/**
 * Explicit record of every admin billing intervention (docs/api-billing.md §6): waivers, period
 * extensions, comped plan changes, manual payment approvals, billing suspensions/reactivations.
 * Never deleted; money effects always go through one of these (no silent edits).
 */
export interface IBillingAdjustment {
  storeId: Types.ObjectId;
  type: BillingAdjustmentType;
  invoiceId?: Types.ObjectId | null;
  paymentId?: Types.ObjectId | null;
  amount: number;
  reason: string;
  meta?: Record<string, unknown>;
  by?: Types.ObjectId | null;
  demo: boolean;
  createdAt: Date;
}

const schema = new Schema<IBillingAdjustment>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    type: { type: String, enum: BILLING_ADJUSTMENT_TYPES, required: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', default: null },
    paymentId: { type: Schema.Types.ObjectId, ref: 'BillingPayment', default: null },
    amount: { type: Number, default: 0 },
    reason: { type: String, required: true, maxlength: 500 },
    meta: { type: Schema.Types.Mixed, default: undefined },
    by: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    demo: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
schema.index({ storeId: 1, createdAt: -1, _id: -1 });
schema.index({ type: 1, createdAt: -1, _id: -1 });
schema.index({ createdAt: -1, _id: -1 });

export const BillingAdjustment = model<IBillingAdjustment>('BillingAdjustment', schema);
export type BillingAdjustmentLean = IBillingAdjustment & { _id: Types.ObjectId };

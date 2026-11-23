import { Schema, model, type Types } from 'mongoose';

export const PAYOUT_STATUSES = ['requested', 'approved', 'paid', 'rejected'] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

/** Seller payout request (sellers create them in Phase 10; admins review here). Money in paisa. */
export interface IPayout {
  storeId: Types.ObjectId;
  amount: number;
  status: PayoutStatus;
  /** Masked snapshot of the store's payout method at request time (never full account numbers). */
  method: { type?: string; bankName?: string; accountTitle?: string; accountMasked?: string };
  reference?: string;
  notes?: string;
  requestedBy?: Types.ObjectId;
  reviewedBy?: Types.ObjectId;
  approvedAt?: Date;
  paidAt?: Date;
  rejectedAt?: Date;
  demo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IPayout>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    amount: { type: Number, required: true, min: 1 },
    status: { type: String, enum: PAYOUT_STATUSES, default: 'requested' },
    method: { type: { type: String, bankName: String, accountTitle: String, accountMasked: String, _id: false }, default: {} },
    reference: { type: String, maxlength: 120 },
    notes: { type: String, maxlength: 1000 },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
    paidAt: Date,
    rejectedAt: Date,
    demo: { type: Boolean, default: false, index: true },
  },
  { timestamps: true, minimize: false },
);
schema.index({ storeId: 1, createdAt: -1 });
schema.index({ status: 1, createdAt: -1 });

export const Payout = model<IPayout>('Payout', schema);
export type PayoutLean = IPayout & { _id: Types.ObjectId };

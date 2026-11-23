import { Schema, Types, model } from 'mongoose';

export interface IWalletTransaction {
  userId: Types.ObjectId;
  type: 'credit' | 'debit';
  /** Positive amount in minor units (paisa). */
  amount: number;
  balanceAfter: number;
  /** e.g. refund | gift_card | referral | adjustment | order_payment */
  reason: string;
  /** Idempotency key: the same ref is applied at most once (e.g. `refund:<returnId>`). */
  ref: string;
  /** `pending` while the balance change is being applied; `done` afterwards. */
  state: 'pending' | 'done';
  meta?: Record<string, unknown>;
  demo: boolean;
  createdAt: Date;
}

const schema = new Schema<IWalletTransaction>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['credit', 'debit'], required: true },
    amount: { type: Number, required: true, min: 1 },
    balanceAfter: { type: Number, default: 0 },
    reason: { type: String, required: true, maxlength: 40 },
    ref: { type: String, required: true, maxlength: 200 },
    state: { type: String, enum: ['pending', 'done'], default: 'pending' },
    meta: { type: Schema.Types.Mixed },
    demo: { type: Boolean, default: false, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

schema.index({ ref: 1 }, { unique: true });
schema.index({ userId: 1, createdAt: -1 });

export const WalletTransaction = model<IWalletTransaction>('WalletTransaction', schema);
export type WalletTransactionLean = IWalletTransaction & { _id: Types.ObjectId };

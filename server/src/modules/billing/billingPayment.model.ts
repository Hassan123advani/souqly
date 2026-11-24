import { BILLING_PAYMENT_METHODS, BILLING_PAYMENT_STATUSES, MANUAL_PAYMENT_CHANNELS, type BillingPaymentMethod, type BillingPaymentStatus, type ManualPaymentChannel } from '@souqly/shared';
import { Schema, model, type Types } from 'mongoose';

/**
 * A payment attempt on a billing invoice (docs/api-billing.md §4). `refLock` is set only while a
 * manual payment is pending/succeeded (`<channel>:<REFERENCE>`, unique) so the same bank transfer
 * reference can never pay twice; `gateway.transactionId` is unique so a webhook can't pay twice.
 */
export interface IBillingPayment {
  storeId: Types.ObjectId;
  invoiceId: Types.ObjectId;
  invoiceNumber: string;
  method: BillingPaymentMethod;
  amount: number;
  status: BillingPaymentStatus;
  channel?: ManualPaymentChannel;
  reference?: string;
  refLock?: string;
  proof?: { url: string; key: string };
  note?: string;
  gateway?: { provider: string; sessionId?: string; transactionId?: string; checkoutUrl?: string; failure?: string };
  idempotencyKey?: string;
  submittedBy?: Types.ObjectId;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  reviewNote?: string;
  demo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IBillingPayment>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true },
    invoiceNumber: { type: String, required: true },
    method: { type: String, enum: BILLING_PAYMENT_METHODS, required: true },
    amount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: BILLING_PAYMENT_STATUSES, required: true },
    channel: { type: String, enum: MANUAL_PAYMENT_CHANNELS },
    reference: { type: String, maxlength: 80 },
    refLock: { type: String, maxlength: 100 },
    proof: { type: { url: String, key: String, _id: false }, default: undefined },
    note: { type: String, maxlength: 500 },
    gateway: { type: { provider: String, sessionId: String, transactionId: String, checkoutUrl: String, failure: String, _id: false }, default: undefined },
    idempotencyKey: { type: String, maxlength: 100 },
    submittedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    reviewNote: { type: String, maxlength: 500 },
    demo: { type: Boolean, default: false },
  },
  { timestamps: true },
);
schema.index({ storeId: 1, createdAt: -1, _id: -1 });
schema.index({ invoiceId: 1, createdAt: -1 });
schema.index({ status: 1, method: 1, _id: -1 });
schema.index({ refLock: 1 }, { unique: true, partialFilterExpression: { refLock: { $type: 'string' } }, name: 'manual_reference_once' });
schema.index({ 'gateway.transactionId': 1 }, { unique: true, partialFilterExpression: { 'gateway.transactionId': { $type: 'string' } }, name: 'gateway_txn_once' });
schema.index({ 'gateway.sessionId': 1 }, { unique: true, partialFilterExpression: { 'gateway.sessionId': { $type: 'string' } }, name: 'gateway_session_once' });
schema.index({ storeId: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } }, name: 'payment_idempotency' });
// One pending (manual or gateway) payment per invoice.
schema.index({ invoiceId: 1 }, { unique: true, partialFilterExpression: { status: 'pending' }, name: 'one_pending_per_invoice' });

export const BillingPayment = model<IBillingPayment>('BillingPayment', schema);
export type BillingPaymentLean = IBillingPayment & { _id: Types.ObjectId };

import { COMMISSION_CHANNELS, COMMISSION_STATUSES, type CommissionChannel, type CommissionStatus } from '@souqly/shared';
import { Schema, model, type Types } from 'mongoose';

/**
 * Commission ledger (docs/api-billing.md §2). Append-only rows:
 * - `charge`: one per delivered sub-order (unique `orderId`), ref `order:<orderId>`, amount > 0.
 * - `reversal`: ref `return:<returnId>` or `cancel:<orderId>`, amount < 0, `chargeId` → its charge.
 * Only `status` / `invoiceId` / `settledAt` ever change.
 */
export interface ICommissionEntry {
  storeId: Types.ObjectId;
  orderId: Types.ObjectId;
  orderNumber: string;
  kind: 'charge' | 'reversal';
  channel: CommissionChannel;
  ref: string;
  reason: 'delivered' | 'return_refund' | 'cancelled_after_delivery';
  base: number;
  bps: number;
  amount: number;
  orderTotal: number;
  status: CommissionStatus;
  invoiceId?: Types.ObjectId | null;
  chargeId?: Types.ObjectId | null;
  at: Date;
  settledAt?: Date | null;
  demo: boolean;
  createdAt: Date;
}

const schema = new Schema<ICommissionEntry>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    orderNumber: { type: String, required: true },
    kind: { type: String, enum: ['charge', 'reversal'], required: true },
    channel: { type: String, enum: COMMISSION_CHANNELS, required: true },
    ref: { type: String, required: true, maxlength: 120 },
    reason: { type: String, enum: ['delivered', 'return_refund', 'cancelled_after_delivery'], required: true },
    base: { type: Number, required: true },
    bps: { type: Number, required: true },
    amount: { type: Number, required: true },
    orderTotal: { type: Number, default: 0 },
    status: { type: String, enum: COMMISSION_STATUSES, required: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', default: null },
    chargeId: { type: Schema.Types.ObjectId, ref: 'CommissionEntry', default: null },
    at: { type: Date, required: true },
    settledAt: { type: Date, default: null },
    demo: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
schema.index({ storeId: 1, ref: 1 }, { unique: true });
// One commission charge per sub-order, ever.
schema.index({ orderId: 1 }, { unique: true, partialFilterExpression: { kind: 'charge' }, name: 'one_charge_per_order' });
schema.index({ storeId: 1, at: -1, _id: -1 });
schema.index({ storeId: 1, status: 1, channel: 1, at: 1 });
schema.index({ invoiceId: 1 });
schema.index({ status: 1, channel: 1 });
schema.index({ at: -1, _id: -1 });

export const CommissionEntry = model<ICommissionEntry>('CommissionEntry', schema);
export type CommissionEntryLean = ICommissionEntry & { _id: Types.ObjectId };

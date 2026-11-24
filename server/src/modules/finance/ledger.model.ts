import { Schema, Types, model } from 'mongoose';

/**
 * Billing (docs/api-billing.md): `invoice_payment` (debit, pay an invoice from balance), `commission_credit`
 * (credit, reversal of COD commission already billed), `balance_transfer` (credit, a negative balance moved onto
 * a monthly invoice as `balance_recovery`).
 */
export const LEDGER_TYPES = ['sale', 'refund', 'payout', 'payout_reversal', 'invoice_payment', 'commission_credit', 'balance_transfer'] as const;
export type LedgerType = (typeof LEDGER_TYPES)[number];

/**
 * Seller money ledger (Phase 10). Append-only; `ref` is an idempotency key unique per store
 * (`sale:<orderId>`, `refund:<returnId>`, `payout:<payoutId>`, `payout_reversal:<payoutId>`).
 * Amount is signed paisa: credits (sale, payout_reversal) > 0, debits (refund, payout) < 0.
 * Sale credits become withdrawable at `availableAt` (delivered + hold days).
 */
export interface ISellerLedger {
  storeId: Types.ObjectId;
  type: LedgerType;
  amount: number;
  ref: string;
  orderId?: Types.ObjectId;
  orderNumber?: string;
  payoutId?: Types.ObjectId;
  returnId?: Types.ObjectId;
  invoiceId?: Types.ObjectId;
  /** Commission snapshot for sales (bps + amount). */
  commission?: { bps: number; amount: number };
  availableAt: Date;
  at: Date;
  demo: boolean;
  createdAt: Date;
}

const schema = new Schema<ISellerLedger>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    type: { type: String, enum: LEDGER_TYPES, required: true },
    amount: { type: Number, required: true },
    ref: { type: String, required: true, maxlength: 80 },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    orderNumber: String,
    payoutId: { type: Schema.Types.ObjectId, ref: 'Payout' },
    returnId: { type: Schema.Types.ObjectId, ref: 'Return' },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice' },
    commission: { type: { bps: Number, amount: Number, _id: false }, default: undefined },
    availableAt: { type: Date, required: true },
    at: { type: Date, required: true },
    demo: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
schema.index({ storeId: 1, ref: 1 }, { unique: true });
schema.index({ storeId: 1, at: -1, _id: -1 });
schema.index({ storeId: 1, type: 1, at: -1 });

export const SellerLedger = model<ISellerLedger>('SellerLedger', schema);
export type SellerLedgerLean = ISellerLedger & { _id: Types.ObjectId };

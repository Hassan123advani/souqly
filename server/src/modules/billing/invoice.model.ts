import { INVOICE_KINDS, INVOICE_LINE_TYPES, INVOICE_STATUSES, STORE_PLANS, type InvoiceKind, type InvoiceLineType, type InvoiceStatus, type StorePlan } from '@souqly/shared';
import { Schema, model, type Types } from 'mongoose';

export interface IInvoiceLine {
  type: InvoiceLineType;
  description: string;
  amount: number;
  plan?: StorePlan;
  periodStart?: Date;
  periodEnd?: Date;
  entries?: number;
}

/**
 * Seller billing invoice (docs/api-billing.md §4). `renewal` = monthly (fee + COD commission +
 * balance recovery), unique per (storeId, periodStart); `upgrade` = plan upgrade, at most one open
 * per store. amountDue = total − amountPaid − amountWaived (never stored).
 */
export interface IInvoice {
  storeId: Types.ObjectId;
  number: string;
  kind: InvoiceKind;
  status: InvoiceStatus;
  plan: StorePlan;
  periodStart: Date;
  periodEnd: Date;
  lines: IInvoiceLine[];
  total: number;
  amountPaid: number;
  amountWaived: number;
  issuedAt: Date;
  dueDate: Date;
  paidAt?: Date;
  overdueAt?: Date;
  voidedAt?: Date;
  voidReason?: string;
  demo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const lineSchema = new Schema<IInvoiceLine>(
  {
    type: { type: String, enum: INVOICE_LINE_TYPES, required: true },
    description: { type: String, required: true, maxlength: 200 },
    amount: { type: Number, required: true },
    plan: { type: String, enum: STORE_PLANS },
    periodStart: Date,
    periodEnd: Date,
    entries: Number,
  },
  { _id: false },
);

const schema = new Schema<IInvoice>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    number: { type: String, required: true },
    kind: { type: String, enum: INVOICE_KINDS, required: true },
    status: { type: String, enum: INVOICE_STATUSES, default: 'open' },
    plan: { type: String, enum: STORE_PLANS, required: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    lines: { type: [lineSchema], default: [] },
    total: { type: Number, required: true, min: 0 },
    amountPaid: { type: Number, default: 0, min: 0 },
    amountWaived: { type: Number, default: 0, min: 0 },
    issuedAt: { type: Date, required: true },
    dueDate: { type: Date, required: true },
    paidAt: Date,
    overdueAt: Date,
    voidedAt: Date,
    voidReason: { type: String, maxlength: 200 },
    demo: { type: Boolean, default: false },
  },
  { timestamps: true },
);
schema.index({ number: 1 }, { unique: true });
schema.index({ storeId: 1, issuedAt: -1, _id: -1 });
schema.index({ storeId: 1, status: 1, kind: 1 });
schema.index({ status: 1, dueDate: 1 });
schema.index({ issuedAt: -1, _id: -1 });
// Never issue two renewal invoices for the same period of a store.
schema.index({ storeId: 1, periodStart: 1 }, { unique: true, partialFilterExpression: { kind: 'renewal' }, name: 'one_renewal_per_period' });
// At most one open upgrade invoice per store.
schema.index({ storeId: 1 }, { unique: true, partialFilterExpression: { kind: 'upgrade', status: 'open' }, name: 'one_open_upgrade' });

export const Invoice = model<IInvoice>('Invoice', schema);
export type InvoiceLean = IInvoice & { _id: Types.ObjectId };

export const amountDue = (i: Pick<IInvoice, 'total' | 'amountPaid' | 'amountWaived'>) => Math.max(0, i.total - i.amountPaid - i.amountWaived);

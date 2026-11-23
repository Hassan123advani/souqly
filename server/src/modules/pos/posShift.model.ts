import { Schema, Types, model } from 'mongoose';

/** Cash-drawer shift for the offline POS (Phase 10). Money in paisa. */
export interface IPosShift {
  storeId: Types.ObjectId;
  openedBy: Types.ObjectId;
  openingCash: number;
  openedAt: Date;
  status: 'open' | 'closed';
  closedBy?: Types.ObjectId;
  closedAt?: Date;
  countedCash?: number;
  /** opening + cash sales − cash refunds (computed at close). */
  expectedCash?: number;
  /** counted − expected (negative = short). */
  variance?: number;
  cashSales?: number;
  cashRefunds?: number;
  salesCount?: number;
  salesTotal?: number;
  note?: string;
  demo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IPosShift>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    openedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    openingCash: { type: Number, required: true, min: 0 },
    openedAt: { type: Date, required: true },
    status: { type: String, enum: ['open', 'closed'], default: 'open' },
    closedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    closedAt: Date,
    countedCash: Number,
    expectedCash: Number,
    variance: Number,
    cashSales: Number,
    cashRefunds: Number,
    salesCount: Number,
    salesTotal: Number,
    note: { type: String, maxlength: 500 },
    demo: { type: Boolean, default: false },
  },
  { timestamps: true },
);
schema.index({ storeId: 1, openedAt: -1 });
// One open shift per cashier per store.
schema.index({ storeId: 1, openedBy: 1 }, { unique: true, partialFilterExpression: { status: 'open' }, name: 'one_open_shift_per_cashier' });

export const PosShift = model<IPosShift>('PosShift', schema);
export type PosShiftLean = IPosShift & { _id: Types.ObjectId };

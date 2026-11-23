import { Schema, Types, model, type HydratedDocument } from 'mongoose';

export const VOUCHER_SCOPES = ['platform', 'store'] as const;
export const VOUCHER_TYPES = ['percent', 'fixed', 'free_shipping'] as const;

export interface IVoucher {
  code: string;
  scope: (typeof VOUCHER_SCOPES)[number];
  /** Required for store vouchers. Platform vouchers use null so `(scope, storeId, code)` stays unique. */
  storeId: Types.ObjectId | null;
  title?: string;
  type: (typeof VOUCHER_TYPES)[number];
  /** bps for percent, minor units for fixed, unused for free_shipping. */
  value: number;
  minSpend: number;
  maxDiscount?: number;
  startsAt: Date;
  endsAt: Date;
  /** 0 = unlimited. */
  usageLimit: number;
  perUserLimit: number;
  usedCount: number;
  followerOnly: boolean;
  categoryIds: Types.ObjectId[];
  productIds: Types.ObjectId[];
  isActive: boolean;
  demo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const voucherSchema = new Schema<IVoucher>(
  {
    code: { type: String, required: true, uppercase: true, trim: true, maxlength: 32 },
    scope: { type: String, enum: VOUCHER_SCOPES, required: true },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', default: null },
    title: { type: String, maxlength: 120 },
    type: { type: String, enum: VOUCHER_TYPES, required: true },
    value: { type: Number, required: true, min: 0, default: 0 },
    minSpend: { type: Number, min: 0, default: 0 },
    maxDiscount: { type: Number, min: 0 },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    usageLimit: { type: Number, min: 0, default: 0 },
    perUserLimit: { type: Number, min: 0, default: 1 },
    usedCount: { type: Number, min: 0, default: 0 },
    followerOnly: { type: Boolean, default: false },
    categoryIds: { type: [Schema.Types.ObjectId], default: [] },
    productIds: { type: [Schema.Types.ObjectId], default: [] },
    isActive: { type: Boolean, default: true },
    demo: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);
// Code is unique per scope (platform-wide, or within one store).
voucherSchema.index({ scope: 1, storeId: 1, code: 1 }, { unique: true });
voucherSchema.index({ storeId: 1, isActive: 1, endsAt: 1 });
voucherSchema.index({ code: 1 });

export const Voucher = model<IVoucher>('Voucher', voucherSchema);
export type VoucherDoc = HydratedDocument<IVoucher>;

/** One row per (voucher, user, checkout) redemption; counts per-user usage. */
export interface IVoucherUsage {
  voucherId: Types.ObjectId;
  userId: Types.ObjectId;
  checkoutId: Types.ObjectId;
  storeId?: Types.ObjectId | null;
  discount: number;
  demo: boolean;
  createdAt: Date;
}

const voucherUsageSchema = new Schema<IVoucherUsage>(
  {
    voucherId: { type: Schema.Types.ObjectId, ref: 'Voucher', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    checkoutId: { type: Schema.Types.ObjectId, ref: 'Checkout', required: true },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', default: null },
    discount: { type: Number, default: 0 },
    demo: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
voucherUsageSchema.index({ voucherId: 1, userId: 1 });
voucherUsageSchema.index({ voucherId: 1, checkoutId: 1 }, { unique: true });

export const VoucherUsage = model<IVoucherUsage>('VoucherUsage', voucherUsageSchema);

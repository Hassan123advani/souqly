import { ORDER_CHANNELS, ORDER_STATUSES, PAYMENT_METHODS, type OrderChannel, type OrderStatus, type PaymentMethod } from '@souqly/shared';
import { Schema, Types, model, type HydratedDocument } from 'mongoose';

export const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export interface IOrderItem {
  productId: Types.ObjectId;
  variantId: Types.ObjectId;
  title: string;
  slug?: string;
  image?: string;
  options: Record<string, string>;
  sku: string;
  categoryPath: Types.ObjectId[];
  price: number;
  qty: number;
  lineTotal: number;
}

export interface IOrderTimeline {
  status: OrderStatus;
  at: Date;
  by?: Types.ObjectId | null;
  /** 'buyer' | 'seller' | 'system' | 'admin' | 'rider' */
  actor: string;
  note?: string;
}

export interface IAddressSnapshot {
  fullName: string;
  phone: string;
  country: string;
  city: string;
  area?: string;
  line1: string;
  line2?: string;
  postalCode?: string;
}

export interface IOrder {
  storeId: Types.ObjectId;
  checkoutId?: Types.ObjectId | null;
  number: string;
  buyerId: Types.ObjectId;
  items: IOrderItem[];
  subtotal: number;
  shippingFee: number;
  discounts: { store: number; platform: number; shipping: number };
  vouchers: { store?: string; platform?: string };
  total: number;
  commission: { bps: number; amount: number };
  sellerNet: number;
  status: OrderStatus;
  timeline: IOrderTimeline[];
  payment: { method: PaymentMethod; status: PaymentStatus };
  shippingAddress: IAddressSnapshot;
  buyerNote?: string;
  sellerNotes: { by: Types.ObjectId; at: Date; text: string }[];
  channel: OrderChannel;
  cancel?: { by: Types.ObjectId | null; actor: string; reason: string; at: Date };
  tracking?: { courier: string; trackingNumber: string };
  /** sha256 of the 4-digit delivery OTP; `deliveryOtpEnc` is its AES-GCM ciphertext (buyer view only). */
  deliveryOtpHash?: string;
  deliveryOtpEnc?: string;
  riderId?: Types.ObjectId | null;
  invoiceNumber: string;
  stockRestored: boolean;
  demo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const orderSchema = new Schema<IOrder>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    checkoutId: { type: Schema.Types.ObjectId, ref: 'Checkout', default: null },
    number: { type: String, required: true, unique: true },
    buyerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    items: [
      {
        productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
        variantId: { type: Schema.Types.ObjectId, required: true },
        title: { type: String, required: true },
        slug: String,
        image: String,
        options: { type: Schema.Types.Mixed, default: {} },
        sku: { type: String, default: '' },
        categoryPath: { type: [Schema.Types.ObjectId], default: [] },
        price: { type: Number, required: true, min: 0 },
        qty: { type: Number, required: true, min: 1 },
        lineTotal: { type: Number, required: true, min: 0 },
        _id: false,
      },
    ],
    subtotal: { type: Number, required: true, min: 0 },
    shippingFee: { type: Number, default: 0, min: 0 },
    discounts: { store: { type: Number, default: 0 }, platform: { type: Number, default: 0 }, shipping: { type: Number, default: 0 } },
    vouchers: { store: String, platform: String },
    total: { type: Number, required: true, min: 0 },
    commission: { bps: { type: Number, default: 0 }, amount: { type: Number, default: 0 } },
    sellerNet: { type: Number, default: 0 },
    status: { type: String, enum: ORDER_STATUSES, required: true },
    timeline: [
      {
        status: { type: String, enum: ORDER_STATUSES, required: true },
        at: { type: Date, required: true },
        by: { type: Schema.Types.ObjectId, ref: 'User', default: null },
        actor: { type: String, default: 'system' },
        note: String,
        _id: false,
      },
    ],
    payment: {
      method: { type: String, enum: PAYMENT_METHODS, required: true },
      status: { type: String, enum: PAYMENT_STATUSES, default: 'pending' },
    },
    shippingAddress: {
      fullName: String,
      phone: String,
      country: String,
      city: String,
      area: String,
      line1: String,
      line2: String,
      postalCode: String,
    },
    buyerNote: { type: String, maxlength: 500 },
    sellerNotes: [{ by: { type: Schema.Types.ObjectId, ref: 'User' }, at: Date, text: { type: String, maxlength: 1000 }, _id: false }],
    channel: { type: String, enum: ORDER_CHANNELS, default: 'online' },
    cancel: { type: { by: Schema.Types.ObjectId, actor: String, reason: String, at: Date, _id: false }, default: undefined },
    tracking: { type: { courier: String, trackingNumber: String, _id: false }, default: undefined },
    deliveryOtpHash: { type: String, select: false },
    deliveryOtpEnc: { type: String, select: false },
    riderId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    invoiceNumber: { type: String, required: true },
    stockRestored: { type: Boolean, default: false },
    demo: { type: Boolean, default: false, index: true },
  },
  { timestamps: true, minimize: false },
);

orderSchema.index({ storeId: 1, status: 1, createdAt: -1 });
orderSchema.index({ storeId: 1, createdAt: -1 });
orderSchema.index({ buyerId: 1, status: 1, createdAt: -1 });
orderSchema.index({ buyerId: 1, createdAt: -1 });
orderSchema.index({ checkoutId: 1 });

export const Order = model<IOrder>('Order', orderSchema);
export type OrderDoc = HydratedDocument<IOrder>;
export type OrderLean = IOrder & { _id: Types.ObjectId };

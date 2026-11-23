import { DELIVERY_FAIL_REASONS, type DeliveryFailReason } from '@souqly/shared';
import { Schema, Types, model, type HydratedDocument } from 'mongoose';

export const RIDER_LOCATION_TTL_SECONDS = 7 * 24 * 3600;
export const DEFAULT_RIDER_FEE = 12_000; // Rs. 120

// ---------- DeliverySession: one per order (attempt counters and OTP lock survive rider swaps) ----------
export interface IDeliverySession {
  orderId: Types.ObjectId;
  storeId: Types.ObjectId;
  riderId: Types.ObjectId;
  status: 'active' | 'delivered' | 'failed';
  attempts: number;
  startedAt?: Date;
  endedAt?: Date;
  otpAttempts: number;
  otpLockedUntil?: Date | null;
  codCollected: number;
  photo?: { key: string; url: string };
  failReason?: DeliveryFailReason;
  failNote?: string;
  earning: number;
  lastLocation?: { lat: number; lng: number; at: Date } | null;
  demo?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const deliverySessionSchema = new Schema<IDeliverySession>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    riderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['active', 'delivered', 'failed'], default: 'active' },
    attempts: { type: Number, default: 0 },
    startedAt: Date,
    endedAt: Date,
    otpAttempts: { type: Number, default: 0 },
    otpLockedUntil: { type: Date, default: null },
    codCollected: { type: Number, default: 0, min: 0 },
    photo: { type: { key: String, url: String, _id: false }, default: undefined },
    failReason: { type: String, enum: DELIVERY_FAIL_REASONS },
    failNote: { type: String, maxlength: 500 },
    earning: { type: Number, default: 0, min: 0 },
    lastLocation: { type: { lat: Number, lng: Number, at: Date, _id: false }, default: null },
    demo: { type: Boolean, default: false },
  },
  { timestamps: true },
);
deliverySessionSchema.index({ orderId: 1 }, { unique: true });
deliverySessionSchema.index({ storeId: 1, riderId: 1, status: 1 });
deliverySessionSchema.index({ riderId: 1, endedAt: -1 });

export const DeliverySession = model<IDeliverySession>('DeliverySession', deliverySessionSchema);
export type DeliverySessionDoc = HydratedDocument<IDeliverySession>;

// ---------- RiderLocation: raw GPS trail, auto-deleted after 7 days (privacy) ----------
export interface IRiderLocation {
  orderId: Types.ObjectId;
  riderId: Types.ObjectId;
  storeId: Types.ObjectId;
  lat: number;
  lng: number;
  accuracy?: number;
  heading?: number;
  speed?: number;
  at: Date;
  demo?: boolean;
}

const riderLocationSchema = new Schema<IRiderLocation>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    riderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    accuracy: Number,
    heading: Number,
    speed: Number,
    at: { type: Date, required: true, default: () => new Date() },
    demo: { type: Boolean, default: false },
  },
  { versionKey: false },
);
riderLocationSchema.index({ storeId: 1, orderId: 1, at: -1 });
riderLocationSchema.index({ orderId: 1, at: -1 });
riderLocationSchema.index({ at: 1 }, { expireAfterSeconds: RIDER_LOCATION_TTL_SECONDS });

export const RiderLocation = model<IRiderLocation>('RiderLocation', riderLocationSchema);

// ---------- RiderCashEntry: COD cash ledger (collected by rider, settled to the store) ----------
export interface IRiderCashEntry {
  storeId: Types.ObjectId;
  riderId: Types.ObjectId;
  type: 'collected' | 'settled';
  amount: number;
  orderId?: Types.ObjectId;
  orderNumber?: string;
  by: Types.ObjectId;
  demo?: boolean;
  createdAt: Date;
}

const riderCashEntrySchema = new Schema<IRiderCashEntry>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    riderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['collected', 'settled'], required: true },
    amount: { type: Number, required: true, min: 1 },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    orderNumber: String,
    by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    demo: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
riderCashEntrySchema.index({ storeId: 1, riderId: 1, createdAt: -1 });
riderCashEntrySchema.index({ riderId: 1, createdAt: -1 });
// One "collected" row per order, ever.
riderCashEntrySchema.index({ orderId: 1, type: 1 }, { unique: true, partialFilterExpression: { type: 'collected' } });

export const RiderCashEntry = model<IRiderCashEntry>('RiderCashEntry', riderCashEntrySchema);

// ---------- DeliverySettings: per-store rider settings ----------
export interface IDeliverySettings {
  storeId: Types.ObjectId;
  riderFee: number;
}
const deliverySettingsSchema = new Schema<IDeliverySettings>({
  storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
  riderFee: { type: Number, default: DEFAULT_RIDER_FEE, min: 0 },
});
deliverySettingsSchema.index({ storeId: 1 }, { unique: true });

export const DeliverySettings = model<IDeliverySettings>('DeliverySettings', deliverySettingsSchema);

export async function riderFeeFor(storeId: Types.ObjectId): Promise<number> {
  const s = await DeliverySettings.findOne({ storeId }).lean();
  return s?.riderFee ?? DEFAULT_RIDER_FEE;
}

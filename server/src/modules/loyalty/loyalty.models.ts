import { Schema, Types, model } from 'mongoose';

// ---------------- Coins ledger ----------------
export interface ICoinTransaction {
  userId: Types.ObjectId;
  /** Signed: + earned, - spent. */
  amount: number;
  balanceAfter: number;
  /** order | check_in | referral | redeem | redeem_refund | admin | seed */
  reason: string;
  /** Idempotency key (unique). */
  ref: string;
  state: 'pending' | 'done';
  demo: boolean;
  createdAt: Date;
}
const coinSchema = new Schema<ICoinTransaction>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, default: 0 },
    reason: { type: String, required: true, maxlength: 40 },
    ref: { type: String, required: true, maxlength: 200 },
    state: { type: String, enum: ['pending', 'done'], default: 'pending' },
    demo: { type: Boolean, default: false, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
coinSchema.index({ ref: 1 }, { unique: true });
coinSchema.index({ userId: 1, createdAt: -1 });
export const CoinTransaction = model<ICoinTransaction>('CoinTransaction', coinSchema);
export type CoinTransactionLean = ICoinTransaction & { _id: Types.ObjectId };

// ---------------- Daily check-in ----------------
export interface ICheckIn {
  userId: Types.ObjectId;
  /** Calendar day in Asia/Karachi, `YYYY-MM-DD`. */
  day: string;
  streak: number;
  coins: number;
  demo: boolean;
  createdAt: Date;
}
const checkInSchema = new Schema<ICheckIn>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    day: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    streak: { type: Number, required: true, min: 1 },
    coins: { type: Number, required: true, min: 0 },
    demo: { type: Boolean, default: false, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
checkInSchema.index({ userId: 1, day: -1 }, { unique: true });
export const CheckIn = model<ICheckIn>('CheckIn', checkInSchema);

// ---------------- Referral rewards (one per referee) ----------------
export interface IReferralReward {
  refereeId: Types.ObjectId;
  referrerId: Types.ObjectId;
  orderId: Types.ObjectId;
  referrerAmount: number;
  refereeCoins: number;
  demo: boolean;
  createdAt: Date;
}
const referralSchema = new Schema<IReferralReward>(
  {
    refereeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    referrerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    referrerAmount: { type: Number, default: 0 },
    refereeCoins: { type: Number, default: 0 },
    demo: { type: Boolean, default: false, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
referralSchema.index({ refereeId: 1 }, { unique: true });
referralSchema.index({ referrerId: 1, createdAt: -1 });
export const ReferralReward = model<IReferralReward>('ReferralReward', referralSchema);

// ---------------- Gift cards ----------------
export interface IGiftCard {
  code: string;
  amount: number;
  balance: number;
  purchaserId?: Types.ObjectId;
  createdBy?: Types.ObjectId;
  redeemedBy?: Types.ObjectId | null;
  redeemedAt?: Date;
  expiresAt?: Date;
  demo: boolean;
  createdAt: Date;
}
const giftCardSchema = new Schema<IGiftCard>(
  {
    code: { type: String, required: true, uppercase: true, trim: true, maxlength: 40 },
    amount: { type: Number, required: true, min: 1 },
    balance: { type: Number, required: true, min: 0 },
    purchaserId: { type: Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    redeemedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    redeemedAt: Date,
    expiresAt: Date,
    demo: { type: Boolean, default: false, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
giftCardSchema.index({ code: 1 }, { unique: true });
giftCardSchema.index({ redeemedBy: 1, redeemedAt: -1 });
export const GiftCard = model<IGiftCard>('GiftCard', giftCardSchema);

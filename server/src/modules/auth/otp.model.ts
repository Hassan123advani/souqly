import { Schema, Types, model } from 'mongoose';

/**
 * login: phone OTP login (POST /auth/otp/*).
 * reauth: fresh-OTP re-authentication of a passwordless account (sent to its verified phone).
 * phone_change: verifies a new number before it replaces the account phone (POST /account/phone/verify).
 */
export const OTP_PURPOSES = ['login', 'reauth', 'phone_change'] as const;
export type OtpPurpose = (typeof OTP_PURPOSES)[number];

export interface IOtp {
  phone: string;
  purpose: OtpPurpose;
  /** Set for reauth / phone_change codes: only this user may consume them. */
  userId?: Types.ObjectId;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
  createdAt: Date;
}

const otpSchema = new Schema<IOtp>({
  phone: { type: String, required: true },
  purpose: { type: String, enum: OTP_PURPOSES, default: 'login' },
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  codeHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: () => new Date() },
});
otpSchema.index({ phone: 1, purpose: 1, createdAt: -1 });
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Otp = model<IOtp>('Otp', otpSchema);

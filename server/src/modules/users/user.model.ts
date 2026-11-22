import { PLATFORM_ROLES, USER_MODES, type PlatformRole, type UserMode } from '@souqly/shared';
import { Schema, Types, model, type HydratedDocument } from 'mongoose';

export const USER_STATUSES = ['active', 'blocked', 'deleted'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export interface UserPreferences {
  language: 'en' | 'ur' | 'ar';
  currency: 'PKR' | 'SAR' | 'AED' | 'USD';
  theme: 'light' | 'dark' | 'system';
  notifications: { email: boolean; sms: boolean; push: boolean; marketing: boolean };
  privacy: { showProfileInReviews: boolean; personalizedRecommendations: boolean };
}

export interface IUser {
  name: string;
  email?: string;
  /** Only ever set to a phone the user proved by OTP (login or POST /account/phone/verify). */
  phone?: string;
  /** New number awaiting OTP verification; replaces `phone` once verified. */
  pendingPhone?: string;
  passwordHash?: string;
  googleId?: string;
  avatar?: { url: string; key: string };
  emailVerified: boolean;
  phoneVerified: boolean;
  activeMode: UserMode;
  isSeller: boolean;
  platformRole?: PlatformRole;
  status: UserStatus;
  failedLoginCount: number;
  lockUntil?: Date;
  twoFactor: {
    enabled: boolean;
    secretEncrypted?: string;
    pendingSecretEncrypted?: string;
    /** Last accepted TOTP time step (replay protection). */
    lastStep?: number;
    /** sha256 of single-use recovery codes. */
    recoveryCodes?: { hash: string; usedAt?: Date }[];
  };
  preferences: UserPreferences;
  referralCode: string;
  referredBy?: Types.ObjectId;
  coins: number;
  /** Minor units (paisa). */
  walletBalance: number;
  passwordChangeRecommended: boolean;
  lastLoginAt?: Date;
  deletedAt?: Date;
  /** Seed/demo data; removed by `npm run seed:clear`. */
  demo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, trim: true, lowercase: true, maxlength: 254 },
    phone: { type: String, trim: true, maxlength: 20 },
    pendingPhone: { type: String, trim: true, maxlength: 20 },
    passwordHash: { type: String, select: false },
    googleId: { type: String },
    avatar: { url: String, key: String },
    emailVerified: { type: Boolean, default: false },
    phoneVerified: { type: Boolean, default: false },
    activeMode: { type: String, enum: USER_MODES, default: 'buyer' },
    isSeller: { type: Boolean, default: false },
    platformRole: { type: String, enum: PLATFORM_ROLES },
    status: { type: String, enum: USER_STATUSES, default: 'active', index: true },
    failedLoginCount: { type: Number, default: 0 },
    lockUntil: { type: Date },
    twoFactor: {
      enabled: { type: Boolean, default: false },
      secretEncrypted: { type: String, select: false },
      pendingSecretEncrypted: { type: String, select: false },
      lastStep: { type: Number, select: false },
      recoveryCodes: { type: [{ _id: false, hash: String, usedAt: Date }], select: false, default: undefined },
    },
    preferences: {
      language: { type: String, enum: ['en', 'ur', 'ar'], default: 'en' },
      currency: { type: String, enum: ['PKR', 'SAR', 'AED', 'USD'], default: 'PKR' },
      theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
      notifications: {
        email: { type: Boolean, default: true },
        sms: { type: Boolean, default: true },
        push: { type: Boolean, default: true },
        marketing: { type: Boolean, default: false },
      },
      privacy: {
        showProfileInReviews: { type: Boolean, default: true },
        personalizedRecommendations: { type: Boolean, default: true },
      },
    },
    referralCode: { type: String, required: true },
    referredBy: { type: Schema.Types.ObjectId, ref: 'User' },
    coins: { type: Number, default: 0, min: 0 },
    walletBalance: { type: Number, default: 0 },
    passwordChangeRecommended: { type: Boolean, default: false },
    lastLoginAt: { type: Date },
    deletedAt: { type: Date },
    demo: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

// Partial unique indexes: uniqueness only applies when the field is a string (unset / deleted users are ignored).
userSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } });
// Only VERIFIED phones are unique (legacy unverified numbers never block the real owner).
userSchema.index(
  { phone: 1 },
  { name: 'phone_verified_unique', unique: true, partialFilterExpression: { phone: { $type: 'string' }, phoneVerified: true } },
);
userSchema.index({ googleId: 1 }, { unique: true, partialFilterExpression: { googleId: { $type: 'string' } } });
userSchema.index({ referralCode: 1 }, { unique: true });
userSchema.index({ platformRole: 1 }, { partialFilterExpression: { platformRole: { $type: 'string' } } });

export const User = model<IUser>('User', userSchema);
export type UserDoc = HydratedDocument<IUser>;

import type { PlatformRole, UserMode } from '../constants/roles';
import type { AddressInput } from '../schemas/common';
import type { Preferences } from '../schemas/account';

/** API response types for auth/account (see docs/api-auth.md). */
export type MeStore = { id: string; slug: string; name: string; role: string; status: string; logoUrl?: string };

export type MeUser = {
  id: string;
  name: string;
  email: string;
  /** Always a verified number. */
  phone?: string;
  /** New number waiting for OTP confirmation (POST /account/phone/verify). */
  pendingPhone?: string;
  avatarUrl?: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  activeMode: UserMode;
  isSeller: boolean;
  platformRole?: PlatformRole;
  permissions: string[];
  stores: MeStore[];
  passwordChangeRecommended: boolean;
  twoFactorEnabled: boolean;
  preferences: Preferences;
  referralCode: string;
  coins: number;
  /** Minor units. */
  walletBalance: number;
  impersonatedBy?: string;
  createdAt: string;
};

export type Address = AddressInput & { id: string };

export type SessionInfo = { id: string; userAgent: string; ip: string; createdAt: string; lastUsedAt: string; current: boolean };

export type PublicConfig = {
  site: { name: string; tagline: string; maintenance: boolean; announcement?: { text: string; link?: string; tone: string } };
  integrations: {
    googleLogin: boolean;
    cloudStorage: boolean;
    email: boolean;
    sms: boolean;
    webPush: boolean;
    vapidPublicKey?: string;
    payments: { cod: true; jazzcash: boolean; easypaisa: boolean; stripe: boolean; wallet: boolean };
  };
  flags: Record<string, boolean>;
  devMode: boolean;
};

export type ApiError = { error: { code: string; message: string; details?: unknown } };

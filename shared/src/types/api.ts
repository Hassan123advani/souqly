import type { PlanDefinition } from '../constants/plans';
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
  site: {
    name: string;
    tagline: string;
    logoUrl?: string;
    primaryColor?: string;
    seo: { title?: string; description?: string; keywords?: string };
    maintenance: boolean;
    maintenanceMessage?: string;
    announcement?: { text: string; link?: string; tone: string };
    social: Partial<Record<'facebook' | 'instagram' | 'x' | 'youtube' | 'tiktok', string>>;
    supportEmail?: string;
    supportPhone?: string;
  };
  integrations: {
    googleLogin: boolean;
    cloudStorage: boolean;
    email: boolean;
    sms: boolean;
    webPush: boolean;
    /** Socket.io is available. False on serverless deployments (Vercel): clients poll instead. */
    realtime: boolean;
    vapidPublicKey?: string;
    payments: { cod: boolean; jazzcash: boolean; easypaisa: boolean; stripe: boolean; wallet: boolean };
  };
  flags: Record<string, boolean>;
  devMode: boolean;
  /** Seller plans catalog + flat platform commission (docs/api-billing.md §7). Optional for older servers. */
  billing?: { commissionBps: number; plans: PlanDefinition[] };
};

export type ApiError = { error: { code: string; message: string; details?: unknown } };

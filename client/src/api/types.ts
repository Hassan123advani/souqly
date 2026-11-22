import type { AddressInput, CurrencyCode, LanguageCode, PlatformRole, UserMode } from '@souqly/shared';

/** Mirrors docs/api-auth.md `MeUser`. */
export type MeUser = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  activeMode: UserMode;
  isSeller: boolean;
  platformRole?: PlatformRole;
  permissions: string[];
  stores: { id: string; slug: string; name: string; role: string; status: string; logoUrl?: string }[];
  passwordChangeRecommended: boolean;
  twoFactorEnabled: boolean;
  preferences: Preferences;
  referralCode: string;
  coins: number;
  walletBalance: number;
  impersonatedBy?: string;
  createdAt: string;
};

export type Preferences = {
  language: LanguageCode;
  currency: CurrencyCode;
  theme: 'light' | 'dark' | 'system';
  notifications: { email: boolean; sms: boolean; push: boolean; marketing: boolean };
  privacy: { showProfileInReviews: boolean; personalizedRecommendations: boolean };
};

export type PreferencesPatch = Partial<Omit<Preferences, 'notifications' | 'privacy'>> & {
  notifications?: Partial<Preferences['notifications']>;
  privacy?: Partial<Preferences['privacy']>;
};

export type Address = AddressInput & { id: string };

export type SessionInfo = {
  id: string;
  userAgent: string;
  ip: string;
  createdAt: string;
  lastUsedAt: string;
  current: boolean;
};

export type PublicConfig = {
  site: {
    name: string;
    tagline: string;
    maintenance: boolean;
    announcement?: { text: string; link?: string; tone?: string };
  };
  integrations: {
    googleLogin: boolean;
    cloudStorage: boolean;
    email: boolean;
    sms: boolean;
    webPush: boolean;
    vapidPublicKey?: string;
    payments: { cod: boolean; jazzcash: boolean; easypaisa: boolean; stripe: boolean; wallet: boolean };
  };
  flags: Record<string, boolean>;
  devMode: boolean;
};

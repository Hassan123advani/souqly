/** Feature flag defaults. The admin can override them at runtime (stored in the Settings collection). */
export const FEATURE_FLAGS = {
  aiDescriptionHelper: false,
  liveSelling: false,
  groupBuy: false,
  games: false,
  dailyCheckIn: true,
  referrals: true,
  loyaltyCoins: true,
  giftCards: true,
  preOrders: true,
  wholesaleTiers: true,
  affiliateLinks: true,
  chat: true,
  returns: true,
} as const;
export type FeatureFlag = keyof typeof FEATURE_FLAGS;

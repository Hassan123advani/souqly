import { AFFILIATE_BPS, PLATFORM_COMMISSION_BPS } from '@souqly/shared';

/** Basis points → percent number for i18n interpolation (`1500` → `15`). */
export const pctFromBps = (bps: number) => bps / 100;

/** Platform commission and affiliate rates as percents, from the shared source of truth. */
export const COMMISSION_PCT = pctFromBps(PLATFORM_COMMISSION_BPS);
export const AFFILIATE_PCT = pctFromBps(AFFILIATE_BPS);

import { FEATURE_FLAGS, type FeatureFlag } from '@souqly/shared';
import { Setting } from './setting.model';

const TTL_MS = 30_000;
const cache = new Map<string, { value: unknown; at: number }>();

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T | undefined;
  const doc = await Setting.findOne({ key }).lean();
  cache.set(key, { value: doc?.value, at: Date.now() });
  return doc?.value as T | undefined;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await Setting.updateOne({ key }, { $set: { value } }, { upsert: true });
  cache.delete(key);
}

export function clearSettingsCache(): void {
  cache.clear();
}

/** Defaults from @souqly/shared overridden by the `featureFlags` setting (unknown keys are ignored). */
export async function getFeatureFlags(): Promise<Record<FeatureFlag, boolean>> {
  const overrides = (await getSetting<Record<string, unknown>>('featureFlags')) ?? {};
  const flags = { ...FEATURE_FLAGS } as Record<FeatureFlag, boolean>;
  for (const key of Object.keys(flags) as FeatureFlag[]) {
    if (typeof overrides[key] === 'boolean') flags[key] = overrides[key] as boolean;
  }
  return flags;
}

export type SiteSettings = {
  name: string;
  tagline: string;
  logoUrl?: string;
  primaryColor?: string;
  seo: { title?: string; description?: string; keywords?: string };
  maintenance: boolean;
  maintenanceMessage?: string;
  announcement?: { text: string; link?: string; tone: 'info' | 'promo' | 'warning' };
  social: Partial<Record<'facebook' | 'instagram' | 'x' | 'youtube' | 'tiktok', string>>;
  supportEmail?: string;
  supportPhone?: string;
};

export const SITE_DEFAULTS: SiteSettings = { name: 'Souqly', tagline: 'Every shop, one souq.', seo: {}, maintenance: false, social: {} };

export async function getSiteSettings(): Promise<SiteSettings> {
  const s = (await getSetting<Partial<SiteSettings>>('site')) ?? {};
  const { announcement, ...rest } = s;
  return {
    ...SITE_DEFAULTS,
    ...rest,
    seo: { ...(s.seo ?? {}) },
    social: { ...(s.social ?? {}) },
    maintenance: s.maintenance === true,
    ...(announcement?.text ? { announcement } : {}),
  };
}

export type PaymentToggles = { cod: boolean; jazzcash: boolean; easypaisa: boolean; stripe: boolean; wallet: boolean };
export const PAYMENT_TOGGLE_DEFAULTS: PaymentToggles = { cod: true, jazzcash: true, easypaisa: true, stripe: true, wallet: true };

/** Admin on/off switches per payment method (a method is offered only when enabled AND its keys exist). */
export async function getPaymentToggles(): Promise<PaymentToggles> {
  const s = (await getSetting<Partial<PaymentToggles>>('paymentMethods')) ?? {};
  const out = { ...PAYMENT_TOGGLE_DEFAULTS };
  for (const k of Object.keys(out) as (keyof PaymentToggles)[]) if (typeof s[k] === 'boolean') out[k] = s[k] as boolean;
  return out;
}

export type ShippingZone = { name: string; cities: string[]; fee: number; freeAbove?: number; etaDays: number };
export async function getShippingZones(): Promise<ShippingZone[]> {
  return (await getSetting<ShippingZone[]>('shippingZones')) ?? [];
}

export type TaxSettings = { display: 'inclusive' | 'exclusive'; rates: { country: string; bps: number }[] };
export async function getTaxSettings(): Promise<TaxSettings> {
  const s = await getSetting<Partial<TaxSettings>>('tax');
  return { display: s?.display ?? 'inclusive', rates: s?.rates ?? [] };
}

import { Types } from 'mongoose';
import { DEFAULT_SHIPPING, getShippingSettings } from '../seller/storeSettings.service';
import type { StoreShippingRule } from '../orders/pricing';

/**
 * Shipping zones per store (contract: GET/PUT /seller/settings/shipping, owned by Phase 5).
 * Stores without saved settings use the defaults below (D-056): Rs. 150 within the store's city,
 * Rs. 250 elsewhere, free above Rs. 3,000.
 */
export interface ShippingZone {
  name: string;
  cities: string[] | 'all';
  rate: number;
  freeAbove?: number;
  etaDays?: [number, number];
}
export interface ShippingSettings {
  zones: ShippingZone[];
  processingDays?: number;
}

export const DEFAULT_SAME_CITY_RATE = 15_000;
export const DEFAULT_OTHER_CITY_RATE = 25_000;
export const DEFAULT_FREE_ABOVE = 300_000;

const norm = (s?: string | null) => (s ?? '').trim().toLowerCase();

/** Default zones relative to the store's own city. */
export function defaultShippingSettings(storeCity?: string | null): ShippingSettings {
  const zones: ShippingZone[] = [];
  if (storeCity) zones.push({ name: 'Same city', cities: [storeCity], rate: DEFAULT_SAME_CITY_RATE, freeAbove: DEFAULT_FREE_ABOVE, etaDays: [1, 2] });
  zones.push({ name: 'Nationwide', cities: 'all', rate: DEFAULT_OTHER_CITY_RATE, freeAbove: DEFAULT_FREE_ABOVE, etaDays: [3, 5] });
  return { zones, processingDays: 1 };
}

/** Picks the zone for a buyer city: exact city match first, then an `all` zone, then the most expensive zone. */
export function ruleForCity(settings: ShippingSettings, buyerCity?: string | null): StoreShippingRule {
  const city = norm(buyerCity);
  const exact = city ? settings.zones.find((z) => Array.isArray(z.cities) && z.cities.some((c) => norm(c) === city)) : undefined;
  const zone = exact ?? settings.zones.find((z) => z.cities === 'all') ?? [...settings.zones].sort((a, b) => b.rate - a.rate)[0];
  if (!zone) return { rate: DEFAULT_OTHER_CITY_RATE, freeAbove: DEFAULT_FREE_ABOVE };
  return { rate: zone.rate, ...(zone.freeAbove ? { freeAbove: zone.freeAbove } : {}) };
}

/**
 * Loads a store's shipping settings via Phase 5's `getShippingSettings(storeId)`. Stores that never
 * saved settings get the city-relative defaults above (D-056) instead of Phase 5's flat default.
 */
export async function getStoreShippingSettings(store: { _id: Types.ObjectId; address?: { city?: string } }): Promise<ShippingSettings> {
  const saved = await getShippingSettings(store._id);
  // getShippingSettings returns the DEFAULT_SHIPPING object itself when nothing was saved.
  if (saved === DEFAULT_SHIPPING || !saved.zones?.length) return defaultShippingSettings(store.address?.city);
  return saved;
}

export async function shippingRulesFor(
  stores: { _id: Types.ObjectId; address?: { city?: string } }[],
  buyerCity?: string | null,
): Promise<Record<string, StoreShippingRule>> {
  const out: Record<string, StoreShippingRule> = {};
  await Promise.all(
    stores.map(async (s) => {
      out[String(s._id)] = ruleForCity(await getStoreShippingSettings(s), buyerCity);
    }),
  );
  return out;
}

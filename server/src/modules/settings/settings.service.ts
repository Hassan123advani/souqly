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
  maintenance: boolean;
  announcement?: { text: string; link?: string; tone: 'info' | 'promo' | 'warning' };
};

export async function getSiteSettings(): Promise<SiteSettings> {
  const s = (await getSetting<Partial<SiteSettings>>('site')) ?? {};
  return { maintenance: s.maintenance === true, ...(s.announcement?.text ? { announcement: s.announcement } : {}) };
}

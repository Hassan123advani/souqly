import { affiliateCodeSchema } from '@souqly/shared';

const KEY = 'souqly-aff';
/** Attribution window for a clicked affiliate link. */
const TTL_MS = 30 * 24 * 3600_000;

/** Remembers `?aff=CODE` from a shared product link (last click wins). */
export function rememberAffiliate(code: string | null): void {
  if (!code || !affiliateCodeSchema.safeParse(code).success) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ code: code.trim(), at: Date.now() }));
  } catch {
    // storage unavailable: attribution is best effort
  }
}

/** The remembered affiliate code, if still inside the attribution window. */
export function readAffiliate(): string | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return undefined;
    const v = JSON.parse(raw) as { code?: string; at?: number };
    if (!v.code || !v.at || Date.now() - v.at > TTL_MS || !affiliateCodeSchema.safeParse(v.code).success) {
      localStorage.removeItem(KEY);
      return undefined;
    }
    return v.code;
  } catch {
    return undefined;
  }
}

export function clearAffiliate(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

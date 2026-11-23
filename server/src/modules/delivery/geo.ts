/** City driving speed used for ETAs (km/h). */
export const CITY_SPEED_KMH = 25;

const toRad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in km. */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** ETA in whole minutes (≥ 1), or null when either point is unknown. */
export function etaMinutes(from?: { lat: number; lng: number } | null, to?: { lat: number; lng: number } | null): number | null {
  if (!from || !to) return null;
  return Math.max(1, Math.round((haversineKm(from, to) / CITY_SPEED_KMH) * 60));
}

/** `+92300*****67` — keeps the country/operator prefix and the last 2 digits. */
export function maskPhone(phone?: string | null): string {
  if (!phone) return '';
  const p = phone.replace(/\s+/g, '');
  if (p.length <= 6) return '*'.repeat(p.length);
  return `${p.slice(0, 6)}${'*'.repeat(p.length - 8)}${p.slice(-2)}`;
}

/** Start of "today" in Pakistan time (UTC+5, no DST). */
export function startOfTodayPK(now = new Date()): Date {
  const offset = 5 * 3600_000;
  const local = new Date(now.getTime() + offset);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - offset);
}

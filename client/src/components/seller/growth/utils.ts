import { toMinor } from '@souqly/shared';
import type { BadgeTone } from '@/components/ui';

/** `<input type="datetime-local">` value for a date (local time, minutes precision). */
export function toLocalInput(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** ISO string from a datetime-local value ('' → undefined). */
export function fromLocalInput(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Rupees typed by the seller → integer paisa (NaN / negative → null). */
export function rupeesToMinor(v: string | number | undefined): number | null {
  if (v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
  if (!Number.isFinite(n) || n < 0) return null;
  return toMinor(n);
}

/** Paisa → rupee string for an input ('' for 0 when `blankZero`). */
export function minorToInput(minor: number | null | undefined, blankZero = false): string {
  if (minor === null || minor === undefined || (blankZero && minor === 0)) return '';
  return String(minor / 100);
}

export type WindowState = 'active' | 'scheduled' | 'ended' | 'paused';

export function windowState(w: { startsAt?: string | null; endsAt?: string | null; isActive: boolean }, now = Date.now()): WindowState {
  if (w.endsAt && new Date(w.endsAt).getTime() <= now) return 'ended';
  if (!w.isActive) return 'paused';
  if (w.startsAt && new Date(w.startsAt).getTime() > now) return 'scheduled';
  return 'active';
}

export const WINDOW_TONE: Record<WindowState, BadgeTone> = { active: 'success', scheduled: 'info', ended: 'neutral', paused: 'warning' };

/** Default campaign window: from now (rounded up to the next hour) for `days` days. */
export function defaultWindow(days: number): { startsAt: string; endsAt: string } {
  const s = new Date();
  s.setMinutes(0, 0, 0);
  s.setHours(s.getHours() + 1);
  const e = new Date(s.getTime() + days * 24 * 3600_000);
  return { startsAt: toLocalInput(s), endsAt: toLocalInput(e) };
}

/** First Zod issue → readable "field: message" for a toast. */
export function firstIssue(err: { issues: { path: (string | number)[]; message: string }[] }): string {
  const i = err.issues[0];
  if (!i) return '';
  return i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message;
}

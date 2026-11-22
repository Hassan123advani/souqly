import { formatMoney, type CurrencyCode, type LanguageCode } from '@souqly/shared';

/** Intl locale used for dates and numbers per UI language. Pakistan-first for en/ur. */
export const INTL_LOCALE: Record<LanguageCode, string> = {
  en: 'en-PK',
  ur: 'ur-PK',
  ar: 'ar-SA',
};

/** Money is always integer minor units; formatting lives in @souqly/shared. */
export function money(minor: number, currency: CurrencyCode = 'PKR'): string {
  return formatMoney(minor, currency);
}

export function formatDate(value: string | number | Date, lang: LanguageCode, opts?: Intl.DateTimeFormatOptions): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(INTL_LOCALE[lang], opts ?? { dateStyle: 'medium' }).format(d);
}

export function formatDateTime(value: string | number | Date, lang: LanguageCode): string {
  return formatDate(value, lang, { dateStyle: 'medium', timeStyle: 'short' });
}

/** "3 minutes ago" style relative time. */
export function formatRelative(value: string | number | Date, lang: LanguageCode): string {
  const d = value instanceof Date ? value : new Date(value);
  const diffSec = Math.round((d.getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(INTL_LOCALE[lang], { numeric: 'auto' });
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(diffSec, 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), 'day');
  return formatDate(d, lang);
}

export function formatNumber(n: number, lang: LanguageCode): string {
  return new Intl.NumberFormat(INTL_LOCALE[lang]).format(n);
}

/** Initials for avatars: "Ayesha Khan" -> "AK". */
export function initials(name?: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

/** Rough, friendly device label from a user agent string. */
export function describeUserAgent(ua: string): { browser: string; os: string; mobile: boolean } {
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Browser';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad|iOS/.test(ua)
        ? 'iOS'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'Unknown OS';
  return { browser, os, mobile: /Mobile|Android|iPhone/.test(ua) };
}

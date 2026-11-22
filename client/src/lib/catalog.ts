import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { LanguageCode, LocalizedName } from '@souqly/shared';

/** Current UI language as a Souqly language code. */
export function useLang(): LanguageCode {
  const { i18n } = useTranslation();
  const l = i18n.language?.slice(0, 2);
  return l === 'ur' || l === 'ar' ? l : 'en';
}

/** Picks the name in the UI language, falling back to English when a translation is empty. */
export function useLocalized() {
  const lang = useLang();
  return useCallback((name: LocalizedName | undefined | null) => (name ? name[lang] || name.en : ''), [lang]);
}

/** Compact counts: 1.2k, 43k, 1.1M (always Latin digits, like prices). */
export function compactNumber(n: number): string {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

/** Absolute URL for SEO tags and share links. */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${window.location.origin}${path.startsWith('/') ? '' : '/'}${path}`;
}

/** Only same-origin relative links from CMS content are followed in-app; anything else becomes "/". */
export function safeInternalLink(link?: string): string {
  if (!link || !link.startsWith('/') || link.startsWith('//')) return '/';
  return link;
}

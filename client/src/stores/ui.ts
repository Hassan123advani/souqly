import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { LANGUAGES, type CurrencyCode, type LanguageCode } from '@souqly/shared';

export type ThemePref = 'light' | 'dark' | 'system';

type UiState = {
  theme: ThemePref;
  language: LanguageCode;
  currency: CurrencyCode;
  /** Session-only: the user dismissed the "change default password" banner. */
  passwordBannerDismissed: boolean;
  setTheme: (t: ThemePref) => void;
  setLanguage: (l: LanguageCode) => void;
  setCurrency: (c: CurrencyCode) => void;
  dismissPasswordBanner: () => void;
};

function detectLanguage(): LanguageCode {
  if (typeof document !== 'undefined') {
    const l = document.documentElement.lang;
    if (l === 'ur' || l === 'ar' || l === 'en') return l;
  }
  return 'en';
}

/** Persisted as "souqly-ui" — index.html reads the same key before first paint. */
export const useUi = create<UiState>()(
  persist(
    (set) => ({
      theme: 'system',
      language: detectLanguage(),
      currency: 'PKR',
      passwordBannerDismissed: false,
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      setCurrency: (currency) => set({ currency }),
      dismissPasswordBanner: () => set({ passwordBannerDismissed: true }),
    }),
    {
      name: 'souqly-ui',
      partialize: (s) => ({ theme: s.theme, language: s.language, currency: s.currency }),
    },
  ),
);

export function resolveTheme(theme: ThemePref): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme: ThemePref): void {
  document.documentElement.classList.toggle('dark', resolveTheme(theme) === 'dark');
}

export function applyLanguage(lang: LanguageCode): void {
  const meta = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];
  document.documentElement.lang = meta.code;
  document.documentElement.dir = meta.dir;
}

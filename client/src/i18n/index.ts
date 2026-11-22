import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import ur from './locales/ur.json';
import ar from './locales/ar.json';

export const SUPPORTED = ['en', 'ur', 'ar'] as const;

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, ur: { translation: ur }, ar: { translation: ar } },
    fallbackLng: 'en',
    supportedLngs: SUPPORTED,
    nonExplicitSupportedLngs: true,
    // index.html sets <html lang> from the persisted UI store before React boots,
    // so the html tag is the source of truth; the browser language is the fallback.
    detection: { order: ['htmlTag', 'navigator'], caches: [] },
    interpolation: { escapeValue: false },
    returnNull: false,
  });

export default i18n;

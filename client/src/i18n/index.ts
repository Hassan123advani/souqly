import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import ur from './locales/ur.json';
import ar from './locales/ar.json';

export const SUPPORTED = ['en', 'ur', 'ar'] as const;

type Dict = Record<string, unknown>;

/**
 * Feature locale files live in `locales/<area>/<lang>.json` and are deep-merged into the base
 * dictionaries, so parallel feature work never edits the same JSON file.
 */
function deepMerge(target: Dict, src: Dict): Dict {
  for (const [k, v] of Object.entries(src)) {
    const cur = target[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && cur && typeof cur === 'object' && !Array.isArray(cur)) {
      deepMerge(cur as Dict, v as Dict);
    } else {
      target[k] = v;
    }
  }
  return target;
}

const base: Record<(typeof SUPPORTED)[number], Dict> = { en: en as Dict, ur: ur as Dict, ar: ar as Dict };
const areaFiles = import.meta.glob<Dict>('./locales/*/*.json', { eager: true, import: 'default' });
for (const [file, dict] of Object.entries(areaFiles)) {
  const lang = /\/(en|ur|ar)\.json$/.exec(file)?.[1] as keyof typeof base | undefined;
  if (lang) deepMerge(base[lang], dict);
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: base.en }, ur: { translation: base.ur }, ar: { translation: base.ar } },
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

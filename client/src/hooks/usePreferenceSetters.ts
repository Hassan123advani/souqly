import type { CurrencyCode, LanguageCode } from '@souqly/shared';
import { useMe } from '@/api/auth';
import { useUpdatePreferences } from '@/api/account';
import { useUi, type ThemePref } from '@/stores/ui';

/**
 * Theme / language / currency setters used by the header switchers and the Preferences page.
 * Updates the local store immediately; when signed in, also saves to the account (fire-and-forget).
 */
export function usePreferenceSetters() {
  const { data: me } = useMe();
  const update = useUpdatePreferences();
  const save = (patch: Parameters<typeof update.mutate>[0]) => {
    if (me) update.mutate(patch);
  };
  return {
    setTheme: (theme: ThemePref) => {
      useUi.getState().setTheme(theme);
      save({ theme });
    },
    setLanguage: (language: LanguageCode) => {
      useUi.getState().setLanguage(language);
      save({ language });
    },
    setCurrency: (currency: CurrencyCode) => {
      useUi.getState().setCurrency(currency);
      save({ currency });
    },
  };
}

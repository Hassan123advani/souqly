import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Monitor, Moon, Sun } from 'lucide-react';
import { CURRENCIES, LANGUAGES, type CurrencyCode, type LanguageCode } from '@souqly/shared';
import { useMe } from '@/api/auth';
import { useUpdatePreferences } from '@/api/account';
import { getErrorMessage } from '@/api/client';
import type { Preferences, PreferencesPatch } from '@/api/types';
import { ModeSwitch } from '@/components/layout/AccountMenu';
import { PushToggle } from '@/components/notifications/PushToggle';
import { Seo } from '@/components/layout/Seo';
import { Card, CardBody, CardHeader, FormField, RadioGroup, Select, Switch } from '@/components/ui';
import { usePreferenceSetters } from '@/hooks/usePreferenceSetters';
import { useUi, type ThemePref } from '@/stores/ui';

const LANG_FONT: Record<string, string> = { en: 'latin', ur: 'font-urdu', ar: 'font-arabic' };

export default function PreferencesPage() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const update = useUpdatePreferences();
  const { setLanguage, setCurrency, setTheme } = usePreferenceSetters();
  const language = useUi((s) => s.language);
  const currency = useUi((s) => s.currency);
  const theme = useUi((s) => s.theme);
  if (!me) return null;
  const prefs = me.preferences;

  const patch = (body: PreferencesPatch) =>
    update.mutate(body, {
      onSuccess: () => toast.success(t('common.saved')),
      onError: (e) => toast.error(getErrorMessage(e)),
    });

  const notif = (key: keyof Preferences['notifications']) => (
    <Switch
      key={key}
      label={t(`prefs.notifications.${key}`)}
      description={t(`prefs.notifications.${key}Hint`)}
      checked={!!prefs?.notifications?.[key]}
      onCheckedChange={(v) => patch({ notifications: { [key]: v } })}
      className="py-3.5"
    />
  );
  const privacy = (key: keyof Preferences['privacy']) => (
    <Switch
      key={key}
      label={t(`prefs.privacy.${key}`)}
      description={t(`prefs.privacy.${key}Hint`)}
      checked={!!prefs?.privacy?.[key]}
      onCheckedChange={(v) => patch({ privacy: { [key]: v } })}
      className="py-3.5"
    />
  );

  return (
    <>
      <Seo title={t('account.nav.preferences')} noindex />
      <Card>
        <CardHeader title={t('prefs.display.title')} description={t('prefs.display.subtitle')} />
        <CardBody className="space-y-6">
          <RadioGroup
            legend={t('prefs.language')}
            variant="cards"
            value={language}
            onChange={(v) => setLanguage(v as LanguageCode)}
            options={LANGUAGES.map((l) => ({ value: l.code, label: <span className={LANG_FONT[l.code]}>{l.label}</span> }))}
          />
          <RadioGroup
            legend={t('prefs.theme')}
            variant="cards"
            value={theme}
            onChange={(v) => setTheme(v as ThemePref)}
            options={[
              { value: 'light', label: t('theme.light'), icon: <Sun className="size-4" /> },
              { value: 'dark', label: t('theme.dark'), icon: <Moon className="size-4" /> },
              { value: 'system', label: t('theme.system'), icon: <Monitor className="size-4" /> },
            ]}
          />
          <FormField label={t('prefs.currency')} hint={t('prefs.currencyHint')} className="max-w-xs">
            <Select
              value={currency}
              onValueChange={(v) => setCurrency(v as CurrencyCode)}
              options={Object.values(CURRENCIES).map((c) => ({ value: c.code, label: `${c.code} — ${t(`currencies.${c.code}`)}` }))}
            />
          </FormField>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t('prefs.mode.title')} description={t('prefs.mode.subtitle')} />
        <CardBody>
          <ModeSwitch className="max-w-sm" />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t('prefs.notifications.title')} description={t('prefs.notifications.subtitle')} />
        <CardBody className="divide-y divide-border py-1">
          {notif('email')}
          {notif('sms')}
          {notif('push')}
          <PushToggle />
          {notif('marketing')}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t('prefs.privacy.title')} description={t('prefs.privacy.subtitle')} />
        <CardBody className="divide-y divide-border py-1">
          {privacy('showProfileInReviews')}
          {privacy('personalizedRecommendations')}
        </CardBody>
      </Card>
    </>
  );
}

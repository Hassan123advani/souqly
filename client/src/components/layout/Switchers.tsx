import { Check, Languages, Monitor, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LANGUAGES } from '@souqly/shared';
import { usePreferenceSetters } from '@/hooks/usePreferenceSetters';
import { useUi, type ThemePref } from '@/stores/ui';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  IconButton,
} from '@/components/ui';
import { cn } from '@/lib/cn';

const LANG_FONT: Record<string, string> = { en: 'latin', ur: 'font-urdu', ar: 'font-arabic' };

export function LanguageSwitcher({ compact }: { compact?: boolean }) {
  const { t } = useTranslation();
  const language = useUi((s) => s.language);
  const { setLanguage } = usePreferenceSetters();
  const current = LANGUAGES.find((l) => l.code === language) ?? LANGUAGES[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-11 items-center gap-1.5 rounded-pill px-3 text-sm font-semibold text-fg hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          aria-label={t('header.language')}
        >
          <Languages className="size-[18px] text-fg-muted" />
          {!compact && <span className={LANG_FONT[current.code]}>{current.code === 'en' ? 'EN' : current.label}</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-44">
        <DropdownMenuLabel>{t('header.language')}</DropdownMenuLabel>
        {LANGUAGES.map((l) => (
          <DropdownMenuItem key={l.code} onSelect={() => setLanguage(l.code)} lang={l.code} dir={l.dir}>
            <span className={cn('flex-1', LANG_FONT[l.code])}>{l.label}</span>
            {l.code === language && <Check className="!text-primary-700" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const THEMES: { value: ThemePref; icon: typeof Sun }[] = [
  { value: 'light', icon: Sun },
  { value: 'dark', icon: Moon },
  { value: 'system', icon: Monitor },
];

export function ThemeToggle() {
  const { t } = useTranslation();
  const theme = useUi((s) => s.theme);
  const { setTheme } = usePreferenceSetters();
  const Icon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton label={t('header.theme')}>
          <Icon className="size-[18px]" />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-44">
        <DropdownMenuLabel>{t('header.theme')}</DropdownMenuLabel>
        {THEMES.map(({ value, icon: I }) => (
          <DropdownMenuItem key={value} icon={<I />} onSelect={() => setTheme(value)}>
            <span className="flex-1">{t(`theme.${value}`)}</span>
            {value === theme && <Check className="!text-primary-700" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

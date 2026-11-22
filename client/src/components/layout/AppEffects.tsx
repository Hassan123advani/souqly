import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import i18n from '@/i18n';
import { useMe } from '@/api/auth';
import { applyLanguage, applyTheme, useUi } from '@/stores/ui';

/**
 * Global side effects:
 *  - applies theme (incl. live "system" changes) and language/direction to <html>
 *  - adopts the signed-in user's saved preferences once per user
 *  - scrolls to top on route change
 */
export function AppEffects() {
  const theme = useUi((s) => s.theme);
  const language = useUi((s) => s.language);
  const { data: me } = useMe();
  const adoptedFor = useRef<string | null>(null);
  const { pathname } = useLocation();

  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  useEffect(() => {
    applyLanguage(language);
    if (i18n.language !== language) void i18n.changeLanguage(language);
  }, [language]);

  useEffect(() => {
    if (!me || adoptedFor.current === me.id) return;
    adoptedFor.current = me.id;
    const p = me.preferences;
    if (!p) return;
    useUi.setState({ theme: p.theme, language: p.language, currency: p.currency });
  }, [me]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  return null;
}

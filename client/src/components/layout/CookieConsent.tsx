import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Cookie } from 'lucide-react';
import { Button, Switch } from '@/components/ui';
import { setAnalyticsConsent, trackPageView } from '@/lib/analytics';
import { useConsent } from '@/stores/consent';

/** Applies the analytics choice and sends a GA4 `page_view` on every route change (only with consent). */
function AnalyticsTracker() {
  const analytics = useConsent((s) => !!s.choice?.analytics);
  const { pathname, search } = useLocation();

  useEffect(() => {
    void setAnalyticsConsent(analytics);
  }, [analytics]);

  useEffect(() => {
    if (!analytics) return;
    // Let react-helmet-async update the title before reading it.
    const id = window.setTimeout(() => void trackPageView(pathname + search, document.title), 0);
    return () => window.clearTimeout(id);
  }, [analytics, pathname, search]);

  return null;
}

/**
 * Cookie consent banner (non-modal, bottom of the screen; above the mobile bottom nav).
 * Essential cookies (sign-in session, cart, preferences) are always on; analytics is opt-in.
 */
function ConsentBanner() {
  const { t } = useTranslation();
  const { choice, manage, decide, setManage, close } = useConsent();
  const [analytics, setAnalytics] = useState(choice?.analytics ?? false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const bodyId = useId();

  // Reopened from "Cookie settings": move focus into the banner so keyboard users land on it.
  useEffect(() => {
    if (choice) headingRef.current?.focus();
    // Only on mount.
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape' && choice) close();
  };

  return (
    <section
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onKeyDown={onKeyDown}
      className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[60] mx-auto max-w-xl rounded-xl border border-border bg-surface p-4 shadow-pop animate-fade-up sm:p-5 md:inset-x-auto md:bottom-4 md:end-4 md:mx-0 md:w-[min(92vw,30rem)]"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-pill bg-accent-50 text-accent-800 dark:bg-accent-950/30" aria-hidden>
          <Cookie className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={titleId} ref={headingRef} tabIndex={-1} className="text-sm font-bold text-fg focus:outline-none">
            {t('consent.title')}
          </h2>
          <p id={bodyId} className="mt-1 text-sm text-fg-muted">
            {t('consent.body')}{' '}
            <Link to="/privacy" className="font-semibold text-primary-700 underline-offset-4 hover:underline">
              {t('consent.privacyLink')}
            </Link>
          </p>
        </div>
      </div>

      {manage && (
        <div className="mt-4 space-y-3 rounded-lg bg-surface-2 p-3">
          <Switch checked disabled label={t('consent.essential')} description={t('consent.essentialHint')} />
          <Switch checked={analytics} onCheckedChange={setAnalytics} label={t('consent.analytics')} description={t('consent.analyticsHint')} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        {manage ? (
          <>
            {choice && (
              <Button size="sm" variant="ghost" onClick={close}>
                {t('consent.cancel')}
              </Button>
            )}
            <Button size="sm" onClick={() => decide(analytics)}>
              {t('consent.save')}
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="ghost" onClick={() => setManage(true)}>
              {t('consent.manage')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => decide(false)}>
              {t('consent.essentialOnly')}
            </Button>
            <Button size="sm" onClick={() => decide(true)}>
              {t('consent.acceptAll')}
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

export function CookieConsent() {
  const open = useConsent((s) => s.open);
  return (
    <>
      <AnalyticsTracker />
      {open && <ConsentBanner />}
    </>
  );
}

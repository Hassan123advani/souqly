import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowUp, ShieldAlert, Sparkles, WifiOff, X } from 'lucide-react';
import { useMe } from '@/api/auth';
import { usePublicConfig } from '@/api/config';
import { useUi } from '@/stores/ui';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui';

/** Site-wide announcement from /config/public (admin-controlled). Hidden when absent. */
export function AnnouncementBar() {
  const { data } = usePublicConfig();
  const a = data?.site.announcement;
  if (!a?.text) return null;
  const tone =
    a.tone === 'warning'
      ? 'bg-warning-soft text-fg'
      : a.tone === 'promo'
        ? 'bg-gradient-to-r from-sale-600 via-sale-500 to-accent-500 text-white'
        : 'bg-primary-900 text-primary-50 dark:bg-primary-100 dark:text-primary-900';
  const body = (
    <span className="inline-flex items-center gap-2">
      <Sparkles className="size-3.5 shrink-0" aria-hidden />
      {a.text}
    </span>
  );
  const isInternal = a.link?.startsWith('/') && !a.link.startsWith('//');
  return (
    <div className={cn('px-4 py-2 text-center text-xs font-semibold sm:text-sm', tone)}>
      {a.link ? (
        isInternal ? (
          <Link to={a.link} className="underline-offset-4 hover:underline">
            {body}
          </Link>
        ) : (
          <a href={a.link} rel="noopener noreferrer" className="underline-offset-4 hover:underline">
            {body}
          </a>
        )
      ) : (
        body
      )}
    </div>
  );
}

/** First-login nudge: shown while the account still uses a default/temporary password. */
export function SecurityBanner({ adminArea }: { adminArea?: boolean }) {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const dismissed = useUi((s) => s.passwordBannerDismissed);
  const dismiss = useUi((s) => s.dismissPasswordBanner);
  if (!me?.passwordChangeRecommended || dismissed) return null;
  const to = adminArea || me.platformRole ? '/admin/security' : '/account/security';
  return (
    <div role="alert" className="border-b border-sale-200 bg-sale-50 text-sale-900">
      <div className="mx-auto flex w-full max-w-[1320px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6 lg:px-8">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-sale text-sale-fg">
          <ShieldAlert className="size-5" />
        </span>
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-bold">{t('security.bannerTitle')}</p>
          <p className="text-sale-800">{t('security.bannerBody')}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button to={to} size="sm" variant="danger">
            {t('security.bannerCta')}
          </Button>
          <button
            type="button"
            onClick={dismiss}
            className="grid size-9 place-items-center rounded-full text-sale-800 hover:bg-sale-100"
            aria-label={t('security.bannerDismiss')}
            title={t('security.bannerDismiss')}
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function OfflineNotice() {
  const { t } = useTranslation();
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  if (online) return null;
  return (
    <div role="status" className="flex items-center justify-center gap-2 bg-ink-900 px-4 py-2 text-xs font-semibold text-ink-50">
      <WifiOff className="size-3.5" />
      {t('common.offline')}
    </div>
  );
}

export function BackToTop() {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 900);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0 })}
      aria-label={t('common.backToTop')}
      title={t('common.backToTop')}
      className={cn(
        'fixed bottom-20 end-4 z-30 grid size-11 place-items-center rounded-full border border-border bg-surface text-fg shadow-pop transition-all duration-250 ease-souq md:bottom-8 md:end-8',
        show ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0',
      )}
    >
      <ArrowUp className="size-5" />
    </button>
  );
}

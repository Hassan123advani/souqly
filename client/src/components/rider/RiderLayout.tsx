import { Suspense, type ReactNode } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bike, HandCoins, Home, TrendingUp } from 'lucide-react';
import type { RiderMeDTO } from '@souqly/shared';
import { useMe } from '@/api/auth';
import { getErrorCode } from '@/api/client';
import { useRiderMe } from '@/api/delivery';
import { LogoMark } from '@/components/brand/Logo';
import { Seo } from '@/components/layout/Seo';
import { LanguageSwitcher, ThemeToggle } from '@/components/layout/Switchers';
import { Button, EmptyState, ErrorState, PageSpinner } from '@/components/ui';
import { cn } from '@/lib/cn';

export function useRider(): RiderMeDTO {
  return useOutletContext<RiderMeDTO>();
}

function TopBar({ name }: { name?: string }) {
  const { t } = useTranslation();
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-bg/90 backdrop-blur-xl" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="mx-auto flex h-14 w-full max-w-lg items-center gap-2 px-4">
        <Link to="/rider" className="flex min-w-0 items-center gap-2 rounded-md" aria-label={t('rider.home')}>
          <LogoMark className="size-8 shrink-0" title="" />
          <span className="min-w-0">
            <span className="block text-sm font-extrabold leading-tight text-fg">{t('rider.appName')}</span>
            {name && <span className="block truncate text-[11px] leading-tight text-fg-muted">{name}</span>}
          </span>
        </Link>
        <span className="flex-1" />
        <LanguageSwitcher compact />
        <ThemeToggle />
      </div>
    </header>
  );
}

function BottomBar() {
  const { t } = useTranslation();
  const items = [
    { to: '/rider', label: t('rider.nav.home'), icon: Home, end: true },
    { to: '/rider/cash', label: t('rider.nav.cash'), icon: HandCoins },
    { to: '/rider/earnings', label: t('rider.nav.earnings'), icon: TrendingUp },
  ];
  return (
    <nav
      aria-label={t('rider.appName')}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur-xl"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto grid h-16 max-w-lg grid-cols-3">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center justify-center gap-1 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                isActive ? 'text-primary-700' : 'text-fg-muted hover:text-fg',
              )
            }
          >
            <Icon className="size-6" aria-hidden />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

function NotARider() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto grid min-h-[70vh] max-w-lg place-items-center px-4">
      <EmptyState
        icon={<Bike />}
        title={t('rider.notRider.title')}
        description={t('rider.notRider.body')}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button to="/">{t('rider.notRider.shop')}</Button>
            <Button to="/help" variant="outline">
              {t('rider.notRider.help')}
            </Button>
          </div>
        }
      />
    </div>
  );
}

/** Mobile-first shell for the Rider PWA (`/rider`): no marketplace chrome, big touch targets. */
export default function RiderLayout() {
  const { t } = useTranslation();
  const loc = useLocation();
  const meQ = useMe();
  const riderQ = useRiderMe(!!meQ.data);

  let body: ReactNode;
  if (meQ.isPending || (meQ.data && riderQ.isPending)) body = <PageSpinner />;
  else if (meQ.isError) body = <ErrorState error={meQ.error} onRetry={() => void meQ.refetch()} />;
  else if (!meQ.data) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  else if (riderQ.isError)
    body =
      getErrorCode(riderQ.error) === 'NOT_A_RIDER' || getErrorCode(riderQ.error) === 'FORBIDDEN' ? (
        <NotARider />
      ) : (
        <div className="mx-auto max-w-lg px-4 py-10">
          <ErrorState error={riderQ.error} onRetry={() => void riderQ.refetch()} />
        </div>
      );
  else if (riderQ.data)
    body = (
      <Suspense fallback={<PageSpinner />}>
        <Outlet context={riderQ.data} />
      </Suspense>
    );

  const isRider = !!riderQ.data;
  return (
    <div className="min-h-dvh bg-bg text-fg">
      <Seo title={t('rider.appName')} noindex />
      <TopBar name={meQ.data?.name} />
      <main className={cn('mx-auto w-full max-w-lg px-4 pt-4', isRider ? 'pb-28' : 'pb-10')}>{body}</main>
      {isRider && <BottomBar />}
    </div>
  );
}

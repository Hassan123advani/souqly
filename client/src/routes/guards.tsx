import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMe } from '@/api/auth';
import { Store } from 'lucide-react';
import { Button, EmptyState, ErrorState, PageSpinner } from '@/components/ui';
import { useModeToggle } from '@/hooks/useModeToggle';

function useNextParam() {
  const loc = useLocation();
  return encodeURIComponent(loc.pathname + loc.search);
}

/** Only allows same-origin relative paths as post-login redirects (no open redirect). */
export function safeNext(next: string | null | undefined, fallback = '/'): string {
  if (!next) return fallback;
  return next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : fallback;
}

function Gate({ children }: { children: (ctx: ReturnType<typeof useMe>) => ReactNode }) {
  const q = useMe();
  if (q.isPending) return <PageSpinner />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return <>{children(q)}</>;
}

export function RequireAuth({ children }: { children?: ReactNode }) {
  const next = useNextParam();
  return <Gate>{({ data }) => (data ? (children ?? <Outlet />) : <Navigate to={`/login?next=${next}`} replace />)}</Gate>;
}

export function RequireGuest({ children }: { children?: ReactNode }) {
  const loc = useLocation();
  const raw = new URLSearchParams(loc.search).get('next');
  const { data } = useMe();
  // Guests never wait on the session check: the form renders immediately (also when the API is
  // unreachable) and we only redirect once we know a user is signed in.
  if (data) return <Navigate to={safeNext(raw, data.platformRole ? '/admin' : '/')} replace />;
  return <>{children ?? <Outlet />}</>;
}

export function RequirePlatformStaff({ children }: { children?: ReactNode }) {
  const next = useNextParam();
  const { t } = useTranslation();
  return (
    <Gate>
      {({ data }) => {
        if (!data) return <Navigate to={`/login?next=${next}`} replace />;
        if (!data.platformRole) return <ErrorState title={t('errors.FORBIDDEN_TITLE')} error={new Error(t('errors.FORBIDDEN'))} />;
        return children ?? <Outlet />;
      }}
    </Gate>
  );
}

export function RequireSellerMode({ children }: { children?: ReactNode }) {
  const next = useNextParam();
  return (
    <Gate>
      {({ data }) => {
        if (!data) return <Navigate to={`/login?next=${next}`} replace />;
        if (!data.isSeller) return <Navigate to="/seller/onboarding" replace />;
        if (data.activeMode !== 'seller') return <SwitchToSellerPrompt />;
        return children ?? <Outlet />;
      }}
    </Gate>
  );
}

function SwitchToSellerPrompt() {
  const { t } = useTranslation();
  const toggle = useModeToggle();
  return (
    <EmptyState
      className="min-h-[60vh] justify-center"
      icon={<Store />}
      title={t('mode.switchPromptTitle')}
      description={t('mode.switchPromptBody')}
      action={
        <Button loading={toggle.isPending} onClick={() => toggle.switchTo('seller')}>
          {t('mode.switchToSeller')}
        </Button>
      }
    />
  );
}

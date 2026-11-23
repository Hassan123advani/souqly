import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { BadgeCheck, Database, MapPin, Package, Settings2, ShieldCheck, User } from 'lucide-react';
import { useMe, useResendVerification } from '@/api/auth';
import { getErrorMessage } from '@/api/client';
import { Alert, Avatar, Badge, Button, Container } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { useUi } from '@/stores/ui';

export function EmailVerifyReminder() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const resend = useResendVerification();
  if (!me || me.emailVerified) return null;
  return (
    <Alert
      tone="warning"
      title={t('account.verifyEmail.title')}
      action={
        <Button
          size="sm"
          variant="outline"
          loading={resend.isPending}
          disabled={resend.isSuccess}
          onClick={() =>
            resend.mutate(undefined, {
              onSuccess: () => toast.success(t('account.verifyEmail.sent')),
              onError: (e) => toast.error(getErrorMessage(e)),
            })
          }
        >
          {resend.isSuccess ? t('account.verifyEmail.sentShort') : t('account.verifyEmail.resend')}
        </Button>
      }
    >
      {t('account.verifyEmail.body', { email: me.email })}
    </Alert>
  );
}

export default function AccountLayout() {
  const { t } = useTranslation();
  const lang = useUi((s) => s.language);
  const { data: me } = useMe();
  if (!me) return null;
  const nav = [
    { to: 'profile', label: t('account.nav.profile'), icon: User },
    { to: 'orders', label: t('orders.title'), icon: Package },
    { to: 'addresses', label: t('account.nav.addresses'), icon: MapPin },
    { to: 'security', label: t('account.nav.security'), icon: ShieldCheck },
    { to: 'preferences', label: t('account.nav.preferences'), icon: Settings2 },
    { to: 'privacy', label: t('account.nav.privacy'), icon: Database },
  ];
  return (
    <Container className="py-6 sm:py-10">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar src={me.avatarUrl} name={me.name} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-extrabold tracking-tight text-fg sm:text-2xl">{me.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-fg-muted">
            <span className="latin truncate">{me.email}</span>
            {me.emailVerified && (
              <Badge tone="success" size="sm">
                <BadgeCheck className="size-3" />
                {t('account.verified')}
              </Badge>
            )}
            <span className="hidden text-fg-subtle sm:inline">·</span>
            <span className="hidden sm:inline">{t('account.memberSince', { date: formatDate(me.createdAt, lang, { month: 'long', year: 'numeric' }) })}</span>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-10">
        <nav aria-label={t('account.nav.label')} className="no-scrollbar -mx-4 overflow-x-auto px-4 lg:sticky lg:top-24 lg:mx-0 lg:self-start lg:overflow-visible lg:px-0">
          <ul className="flex gap-1 lg:flex-col">
            {nav.map(({ to, label, icon: Icon }) => (
              <li key={to} className="shrink-0">
                <NavLink
                  to={to}
                  className={({ isActive }) =>
                    cn(
                      'flex h-11 items-center gap-3 whitespace-nowrap rounded-md px-3.5 text-sm font-semibold transition-colors',
                      isActive
                        ? 'bg-surface text-primary-800 shadow-card ring-1 ring-border'
                        : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
                    )
                  }
                >
                  <Icon className="size-[18px]" />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 space-y-6">
          <EmailVerifyReminder />
          <Outlet />
        </div>
      </div>
    </Container>
  );
}

import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Ban, Coins, Eye, LogOut, ShieldCheck, Store, UserCheck, Wallet } from 'lucide-react';
import { PERMISSIONS, PLATFORM_ROLES } from '@souqly/shared';
import { useMe } from '@/api/auth';
import { useAdminGet, useAdminMutation, type AdminUserDetail } from '@/api/admin';
import { getErrorMessage } from '@/api/client';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { PageHeader } from '@/components/admin/PageHeader';
import { StatusPill } from '@/components/admin/StatusPill';
import { useAdminCan } from '@/components/admin/useAdminCan';
import { Avatar, Badge, Button, Card, CardHeader, ErrorState, FormField, Input, Select, Skeleton } from '@/components/ui';
import { useLang } from '@/lib/catalog';
import { formatDate, formatDateTime, money } from '@/lib/format';

type Action = 'block' | 'unblock' | 'logout' | 'impersonate' | 'wallet' | 'role';

export default function UserDetailPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const lang = useLang();
  const can = useAdminCan();
  const { data: me } = useMe();
  const q = useAdminGet<AdminUserDetail>(`users/${id}`);
  const post = useAdminMutation('post', ['users']);
  const patch = useAdminMutation('patch', ['users', 'staff']);
  const [action, setAction] = useState<Action | null>(null);
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<'credit' | 'debit'>('credit');
  const [role, setRole] = useState('');
  const u = q.data;

  const done = (msg: string) => () => {
    toast.success(msg);
    setAction(null);
  };
  const fail = (e: unknown) => toast.error(getErrorMessage(e));

  function confirm(reason: string) {
    if (!u || !action) return;
    if (action === 'block') post.mutate({ path: `users/${id}/block`, body: { reason } }, { onSuccess: done(t('admin.users.blocked')), onError: fail });
    if (action === 'unblock') post.mutate({ path: `users/${id}/unblock` }, { onSuccess: done(t('admin.users.unblocked')), onError: fail });
    if (action === 'logout') post.mutate({ path: `users/${id}/logout` }, { onSuccess: done(t('admin.users.loggedOut')), onError: fail });
    if (action === 'impersonate')
      post.mutate(
        { path: `users/${id}/impersonate`, body: { reason } },
        {
          // The response swaps the session cookies: reload into the marketplace as that user.
          onSuccess: () => window.location.assign('/'),
          onError: fail,
        },
      );
    if (action === 'wallet') {
      const minor = Math.round(Number(amount) * 100);
      if (!minor || minor < 0) return void toast.error(t('admin.users.amountInvalid'));
      post.mutate({ path: `users/${id}/wallet-adjust`, body: { amount: direction === 'credit' ? minor : -minor, reason } }, { onSuccess: done(t('admin.users.walletAdjusted')), onError: fail });
    }
    if (action === 'role')
      patch.mutate({ path: `users/${id}/role`, body: { platformRole: role === 'none' ? null : role } }, { onSuccess: done(t('admin.users.roleChanged')), onError: fail });
  }

  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!u)
    return (
      <div className="grid gap-4">
        <Skeleton className="h-16 w-1/2" />
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    );

  const self = u.id === me?.id;
  const manage = can(PERMISSIONS.ADMIN_USERS_MANAGE) && !self;
  const isSuper = me?.platformRole === 'SUPER_ADMIN' && can(PERMISSIONS.ADMIN_STAFF_MANAGE);
  const dialog: Record<Action, { title: string; desc: string; cta: string; tone: 'danger' | 'primary'; reason?: boolean }> = {
    block: { title: t('admin.users.blockTitle', { name: u.name }), desc: t('admin.users.blockDesc'), cta: t('admin.users.block'), tone: 'danger', reason: true },
    unblock: { title: t('admin.users.unblockTitle', { name: u.name }), desc: t('admin.users.unblockDesc'), cta: t('admin.users.unblock'), tone: 'primary' },
    logout: { title: t('admin.users.logoutTitle'), desc: t('admin.users.logoutDesc', { count: u.activeSessions }), cta: t('admin.users.forceLogout'), tone: 'danger' },
    impersonate: { title: t('admin.users.impersonateTitle', { name: u.name }), desc: t('admin.users.impersonateDesc'), cta: t('admin.users.impersonate'), tone: 'danger', reason: true },
    wallet: { title: t('admin.users.walletTitle'), desc: t('admin.users.walletDesc'), cta: t('admin.users.applyAdjust'), tone: 'primary', reason: true },
    role: { title: t('admin.users.roleTitle'), desc: t('admin.users.roleDesc'), cta: t('admin.common.save'), tone: 'danger' },
  };
  const spec = action ? dialog[action] : null;

  return (
    <>
      <PageHeader
        title={u.name}
        crumbs={[{ label: t('admin.nav.users'), to: '/admin/users' }]}
        actions={
          <>
            {can(PERMISSIONS.ADMIN_USERS_IMPERSONATE) && !u.platformRole && u.status === 'active' && !self && (
              <Button variant="outline" size="sm" leftIcon={<Eye className="size-4" />} onClick={() => setAction('impersonate')}>
                {t('admin.users.impersonate')}
              </Button>
            )}
            {manage && (
              <Button variant="outline" size="sm" leftIcon={<LogOut className="size-4" />} onClick={() => setAction('logout')}>
                {t('admin.users.forceLogout')}
              </Button>
            )}
            {manage &&
              !u.platformRole &&
              (u.status === 'blocked' ? (
                <Button size="sm" leftIcon={<UserCheck className="size-4" />} onClick={() => setAction('unblock')}>
                  {t('admin.users.unblock')}
                </Button>
              ) : u.status === 'active' ? (
                <Button size="sm" variant="danger" leftIcon={<Ban className="size-4" />} onClick={() => setAction('block')}>
                  {t('admin.users.block')}
                </Button>
              ) : null)}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <div className="grid content-start gap-4">
          <Card className="p-5">
            <div className="flex items-center gap-3">
              <Avatar name={u.name} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-lg font-bold text-fg">{u.name}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <StatusPill status={u.status} />
                  {u.platformRole && <Badge tone="primary" size="sm">{t(`admin.roles.${u.platformRole}`)}</Badge>}
                  {u.isSeller && <Badge tone="accent" size="sm">{t('admin.users.sellerYes')}</Badge>}
                </div>
              </div>
            </div>
            <dl className="mt-5 grid gap-3 text-sm">
              <Row label={t('admin.users.email')} value={<span dir="ltr">{u.email ?? '—'}</span>} ok={u.emailVerified} />
              <Row label={t('admin.users.phone')} value={<span dir="ltr">{u.phone ?? '—'}</span>} ok={u.phoneVerified} />
              <Row label={t('admin.users.twoFactor')} value={u.twoFactorEnabled ? t('admin.common.on') : t('admin.common.off')} />
              <Row label={t('admin.users.referral')} value={<span className="latin font-mono">{u.referralCode}</span>} />
              <Row label={t('admin.users.joined')} value={formatDate(u.createdAt, lang)} />
              <Row label={t('admin.users.lastLogin')} value={u.lastLoginAt ? formatDateTime(u.lastLoginAt, lang) : '—'} />
              <Row label={t('admin.users.sessions')} value={u.activeSessions} />
            </dl>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <Card className="p-4">
              <Wallet className="size-4 text-primary-700" />
              <p className="mt-2 text-xs font-semibold text-fg-muted">{t('admin.users.wallet')}</p>
              <p className="text-lg font-extrabold text-fg" dir="ltr">
                {money(u.walletBalance)}
              </p>
              {can(PERMISSIONS.ADMIN_FINANCE_MANAGE) && (
                <Button variant="link" size="sm" onClick={() => (setAmount(''), setAction('wallet'))}>
                  {t('admin.users.adjust')}
                </Button>
              )}
            </Card>
            <Card className="p-4">
              <Coins className="size-4 text-accent-700" />
              <p className="mt-2 text-xs font-semibold text-fg-muted">{t('admin.users.coins')}</p>
              <p className="text-lg font-extrabold text-fg tabular">{u.coins}</p>
            </Card>
          </div>

          {isSuper && !self && (
            <Card className="p-5">
              <p className="flex items-center gap-2 text-sm font-bold text-fg">
                <ShieldCheck className="size-4 text-primary-700" />
                {t('admin.users.platformRole')}
              </p>
              <p className="mt-1 text-xs text-fg-muted">{t('admin.users.roleHint')}</p>
              <div className="mt-3 flex gap-2">
                <Select
                  value={role || u.platformRole || 'none'}
                  onValueChange={setRole}
                  options={[{ value: 'none', label: t('admin.users.noRole') }, ...PLATFORM_ROLES.map((r) => ({ value: r, label: t(`admin.roles.${r}`) }))]}
                  className="flex-1"
                />
                <Button disabled={!role || role === (u.platformRole ?? 'none')} onClick={() => setAction('role')}>
                  {t('admin.common.save')}
                </Button>
              </div>
            </Card>
          )}
        </div>

        <div className="grid content-start gap-4">
          <Card>
            <CardHeader title={t('admin.users.orders')} description={t('admin.users.ordersSummary', { count: u.orders.count, total: money(u.orders.totalSpent) })} />
            {!u.orders.recent.length ? (
              <p className="p-5 text-sm text-fg-muted">{t('admin.users.noOrders')}</p>
            ) : (
              <ul className="divide-y divide-border border-t border-border">
                {u.orders.recent.map((o) => (
                  <li key={o.id}>
                    <Link to={`/admin/orders/${o.id}`} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-surface-2">
                      <span className="font-bold text-fg" dir="ltr">
                        {o.number}
                      </span>
                      <StatusPill status={o.status} />
                      <span className="ms-auto text-fg-muted">{formatDate(o.createdAt, lang)}</span>
                      <span className="w-24 text-end font-semibold" dir="ltr">
                        {money(o.total)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title={t('admin.users.stores')} />
            {!u.stores.length ? (
              <p className="p-5 text-sm text-fg-muted">{t('admin.users.noStores')}</p>
            ) : (
              <ul className="divide-y divide-border border-t border-border">
                {u.stores.map((s) => (
                  <li key={s.id}>
                    <Link to={`/admin/stores/${s.id}`} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-surface-2">
                      <Store className="size-4 text-fg-muted" />
                      <span className="font-semibold text-fg">{s.name}</span>
                      <Badge size="sm">{s.role}</Badge>
                      <span className="ms-auto">
                        <StatusPill status={s.status} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {spec && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setAction(null)}
          title={spec.title}
          description={spec.desc}
          confirmLabel={spec.cta}
          tone={spec.tone}
          reasonLabel={spec.reason ? t('admin.common.reason') : undefined}
          reasonRequired={spec.reason}
          loading={post.isPending || patch.isPending}
          onConfirm={confirm}
        >
          {action === 'wallet' && (
            <div className="grid grid-cols-[140px_1fr] gap-2">
              <Select
                value={direction}
                onValueChange={(v) => setDirection(v as 'credit' | 'debit')}
                options={[
                  { value: 'credit', label: t('admin.users.credit') },
                  { value: 'debit', label: t('admin.users.debit') },
                ]}
              />
              <FormField>
                <Input type="number" min={1} step="1" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={t('admin.users.amountRs')} aria-label={t('admin.users.amountRs')} />
              </FormField>
            </div>
          )}
          {action === 'role' && <p className="rounded-md bg-warning-soft p-3 text-sm text-fg">{t('admin.users.roleConfirm', { role: role === 'none' ? t('admin.users.noRole') : t(`admin.roles.${role}`) })}</p>}
        </ConfirmDialog>
      )}
    </>
  );
}

function Row({ label, value, ok }: { label: string; value: ReactNode; ok?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1.5 truncate text-end font-medium text-fg">
        {value}
        {ok !== undefined && <Badge size="sm" tone={ok ? 'success' : 'neutral'}>{ok ? t('admin.users.verified') : t('admin.users.unverified')}</Badge>}
      </dd>
    </div>
  );
}

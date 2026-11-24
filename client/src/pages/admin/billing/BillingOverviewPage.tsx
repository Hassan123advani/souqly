import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertOctagon, Banknote, CalendarSync, Coins, FileClock, HandCoins, PiggyBank, RefreshCw, ShieldCheck, Store, Wallet } from 'lucide-react';
import { PERMISSIONS, STORE_PLANS } from '@souqly/shared';
import { useAdminGet, useAdminMutation } from '@/api/admin';
import { ADMIN_BILLING_GROUPS, type AdminBillingOverview } from '@/api/billing';
import { getErrorMessage } from '@/api/client';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { KpiCard } from '@/components/admin/KpiCard';
import { PageHeader } from '@/components/admin/PageHeader';
import { useAdminCan } from '@/components/admin/useAdminCan';
import { usePlanName } from '@/components/billing/BillingBadge';
import { Button, Card, CardHeader, ErrorState, Skeleton } from '@/components/ui';
import { compactNumber, useLang } from '@/lib/catalog';
import { formatNumber, money } from '@/lib/format';
import { COMMISSION_PCT, pctFromBps } from '@/lib/rates';

const PLAN_COLORS: Record<string, string> = { free: 'rgb(var(--ink-400))', pro: 'rgb(var(--primary-600))', premium: 'rgb(var(--accent-500))' };

export default function BillingOverviewPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const planName = usePlanName();
  const can = useAdminCan();
  const manage = can(PERMISSIONS.ADMIN_BILLING_MANAGE);
  const q = useAdminGet<AdminBillingOverview>('billing/overview');
  const sweep = useAdminMutation<undefined, Record<string, number>>('post', ADMIN_BILLING_GROUPS);
  const [confirmSweep, setConfirmSweep] = useState(false);
  const o = q.data;
  const tick = { fontSize: 11, fill: 'rgb(var(--fg-muted))' };

  const subscribers = o ? STORE_PLANS.map((p) => ({ plan: p, label: planName(p), n: o.subscribers[p] ?? 0 })) : [];
  const commission = o
    ? [
        { key: 'online', label: t('billing.admin.overview.online'), v: o.commission.online, color: 'rgb(var(--primary-600))' },
        { key: 'codPaid', label: t('billing.admin.overview.codPaid'), v: o.commission.codPaid, color: 'rgb(var(--success))' },
        { key: 'codOutstanding', label: t('billing.admin.overview.codOutstanding'), v: o.commission.codOutstanding, color: 'rgb(var(--warning))' },
      ]
    : [];

  return (
    <>
      <PageHeader
        title={t('billing.admin.nav.overview')}
        description={t('billing.admin.overview.subtitle', { pct: o ? pctFromBps(o.commissionBps) : COMMISSION_PCT })}
        crumbs={[{ label: t('admin.nav.finance') }]}
        actions={
          manage && (
            <Button size="sm" variant="outline" leftIcon={<RefreshCw className="size-4" />} onClick={() => setConfirmSweep(true)}>
              {t('billing.admin.overview.runSweep')}
            </Button>
          )
        }
      />
      {q.error ? (
        <Card>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard loading={!o} label={t('billing.admin.overview.sellers')} icon={<Store />} value={o ? formatNumber(o.sellers.registered, lang) : ''} sub={o ? t('billing.admin.overview.approved', { n: o.sellers.approved }) : undefined} />
            <KpiCard loading={!o} label={t('billing.admin.overview.mrr')} icon={<CalendarSync />} value={o ? money(o.mrr) : ''} sub={t('billing.admin.overview.mrrHint')} />
            <KpiCard loading={!o} label={t('billing.admin.overview.subRevenue')} icon={<Wallet />} value={o ? money(o.subscriptionRevenue.thisMonth) : ''} sub={o ? t('billing.admin.overview.allTime', { amount: money(o.subscriptionRevenue.allTime) }) : undefined} />
            <KpiCard loading={!o} label={t('billing.admin.overview.commissionTotal')} icon={<Coins />} value={o ? money(o.commission.total) : ''} />
            <KpiCard loading={!o} label={t('billing.admin.overview.online')} icon={<Banknote />} value={o ? money(o.commission.online) : ''} />
            <KpiCard loading={!o} label={t('billing.admin.overview.codOutstanding')} icon={<HandCoins />} value={o ? money(o.commission.codOutstanding) : ''} sub={o ? t('billing.admin.overview.codPaidSub', { amount: money(o.commission.codPaid) }) : undefined} />
            <KpiCard loading={!o} label={t('billing.admin.overview.payoutsPending')} icon={<PiggyBank />} value={o ? money(o.payoutsPending.amount) : ''} sub={o ? t('billing.admin.overview.requests', { n: o.payoutsPending.count }) : undefined} />
            <KpiCard loading={!o} label={t('billing.admin.overview.invoicesDue')} icon={<FileClock />} value={o ? money(o.invoices.amountDue) : ''} sub={o ? t('billing.admin.overview.openOverdue', { open: o.invoices.open, overdue: o.invoices.overdue }) : undefined} />
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Link to="/admin/billing/payments" className="rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
              <KpiCard loading={!o} label={t('billing.admin.overview.pendingManual')} icon={<ShieldCheck />} value={o ? formatNumber(o.pendingManualPayments, lang) : ''} sub={t('billing.admin.overview.openQueue')} />
            </Link>
            <Link to="/admin/billing/stores?billingStatus=suspended" className="rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
              <KpiCard loading={!o} label={t('billing.admin.overview.suspended')} icon={<AlertOctagon />} value={o ? formatNumber(o.sellers.billingSuspended, lang) : ''} sub={t('billing.admin.overview.viewStores')} />
            </Link>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title={t('billing.admin.overview.subscribers')} />
              <div className="h-64 p-4" dir="ltr">
                {!o ? (
                  <Skeleton className="size-full" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={subscribers} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border" vertical={false} />
                      <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={false} />
                      <YAxis tick={tick} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
                      <Tooltip cursor={{ fill: 'rgb(var(--primary-500) / 0.08)' }} formatter={(v: number) => [formatNumber(v, lang), t('billing.admin.overview.storesLabel')]} />
                      <Bar dataKey="n" radius={[4, 4, 0, 0]} maxBarSize={56}>
                        {subscribers.map((s) => (
                          <Cell key={s.plan} fill={PLAN_COLORS[s.plan]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>
            <Card>
              <CardHeader title={t('billing.admin.overview.commissionSplit')} />
              <div className="h-64 p-4" dir="ltr">
                {!o ? (
                  <Skeleton className="size-full" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={commission} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border" vertical={false} />
                      <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={false} />
                      <YAxis tick={tick} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => compactNumber(v / 100)} />
                      <Tooltip cursor={{ fill: 'rgb(var(--primary-500) / 0.08)' }} formatter={(v: number) => [money(v), t('billing.admin.overview.commissionTotal')]} />
                      <Bar dataKey="v" radius={[4, 4, 0, 0]} maxBarSize={56}>
                        {commission.map((c) => (
                          <Cell key={c.key} fill={c.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>
          </div>
        </>
      )}
      <ConfirmDialog
        open={confirmSweep}
        onOpenChange={setConfirmSweep}
        title={t('billing.admin.overview.runSweep')}
        description={t('billing.admin.overview.sweepBody')}
        confirmLabel={t('billing.admin.overview.runSweep')}
        loading={sweep.isPending}
        onConfirm={() =>
          sweep.mutate(
            { path: 'billing/sweep' },
            {
              onSuccess: (r) => {
                setConfirmSweep(false);
                const summary = Object.entries(r ?? {})
                  .filter(([, n]) => n)
                  .map(([k, n]) => `${k}: ${n}`)
                  .join(', ');
                toast.success(t('billing.admin.overview.sweepDone', { summary: summary || '—' }));
              },
              onError: (e) => toast.error(getErrorMessage(e)),
            },
          )
        }
      />
    </>
  );
}

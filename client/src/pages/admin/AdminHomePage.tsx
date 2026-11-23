import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, ArrowRight, Banknote, CheckCircle2, Coins, ShoppingBag, Store, Users } from 'lucide-react';
import { PERMISSIONS, type Permission } from '@souqly/shared';
import { useMe } from '@/api/auth';
import { useAdminGet, type AdminDashboard } from '@/api/admin';
import { deltaPct, KpiCard } from '@/components/admin/KpiCard';
import { PageHeader } from '@/components/admin/PageHeader';
import { useAdminCan } from '@/components/admin/useAdminCan';
import { Card, CardHeader, ErrorState, Skeleton } from '@/components/ui';
import { compactNumber, useLang, useLocalized } from '@/lib/catalog';
import { cn } from '@/lib/cn';
import { formatDate, formatNumber, money } from '@/lib/format';

const RANGES = [7, 30, 90] as const;
const DAY = 86_400_000;

type Queue = { key: keyof AdminDashboard['pending']; to: string; perm: Permission };
const QUEUES: Queue[] = [
  { key: 'stores', to: '/admin/stores?status=pending', perm: PERMISSIONS.ADMIN_STORES_VIEW },
  { key: 'products', to: '/admin/products', perm: PERMISSIONS.ADMIN_PRODUCTS_MODERATE },
  { key: 'mallRequests', to: '/admin/stores?tab=mall', perm: PERMISSIONS.ADMIN_STORES_VIEW },
  { key: 'disputes', to: '/admin/disputes', perm: PERMISSIONS.ADMIN_DISPUTES_MANAGE },
  { key: 'returns', to: '/admin/disputes?tab=returns', perm: PERMISSIONS.ADMIN_DISPUTES_MANAGE },
  { key: 'reports', to: '/admin/moderation?tab=reports', perm: PERMISSIONS.ADMIN_REVIEWS_MODERATE },
  { key: 'fraudSignals', to: '/admin/moderation?tab=fraud', perm: PERMISSIONS.ADMIN_REVIEWS_MODERATE },
  { key: 'tickets', to: '/admin/support', perm: PERMISSIONS.ADMIN_SUPPORT_MANAGE },
  { key: 'payouts', to: '/admin/finance/payouts', perm: PERMISSIONS.ADMIN_FINANCE_VIEW },
];

/** Fills days without orders with zeros so the chart has a continuous axis. */
function fillSeries(d: AdminDashboard) {
  const map = new Map(d.series.map((s) => [s.date, s]));
  const out: AdminDashboard['series'] = [];
  const end = new Date(d.range.to).getTime();
  for (let t = new Date(d.range.from).getTime(); t <= end + 1; t += DAY) {
    const date = new Date(t).toISOString().slice(0, 10);
    out.push(map.get(date) ?? { date, gmv: 0, orders: 0, commission: 0, signups: 0 });
  }
  return out;
}

export default function AdminHomePage() {
  const { t } = useTranslation();
  const lang = useLang();
  const loc = useLocalized();
  const can = useAdminCan();
  const { data: me } = useMe();
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [metric, setMetric] = useState<'gmv' | 'orders' | 'signups'>('gmv');
  // Anchor "now" once per range change so the query key is stable.
  const r = useMemo(() => {
    const to = Date.now();
    return { from: new Date(to - days * DAY).toISOString(), to: new Date(to).toISOString(), prevFrom: new Date(to - 2 * days * DAY).toISOString() };
  }, [days]);
  const cur = useAdminGet<AdminDashboard>('dashboard', { from: r.from, to: r.to });
  const prev = useAdminGet<AdminDashboard>('dashboard', { from: r.prevFrom, to: r.from });
  const d = cur.data;
  const p = prev.data?.totals;
  const series = useMemo(() => (d ? fillSeries(d).map((s) => ({ ...s, label: formatDate(s.date, lang, { day: 'numeric', month: 'short' }) })) : []), [d, lang]);
  const active = series.filter((s) => s[metric] > 0).length;
  // Sparse daily data reads better as bars than as an interpolated area.
  const useBars = metric !== 'gmv' || active < series.length / 2;
  const queues = QUEUES.filter((q) => can(q.perm));
  const totalPending = d ? queues.reduce((n, q) => n + (d.pending[q.key] ?? 0), 0) : 0;
  const stores = d?.totals.stores ?? {};
  const tick = { fontSize: 11, fill: 'rgb(var(--fg-muted))' };

  return (
    <>
      <PageHeader
        title={t('admin.dash.title', { name: me?.name.split(' ')[0] ?? '' })}
        crumbs={null}
        description={t('admin.dash.subtitle')}
        actions={
          <div className="inline-flex rounded-md border border-border bg-surface p-0.5" role="tablist" aria-label={t('admin.dash.range')}>
            {RANGES.map((n) => (
              <button
                key={n}
                type="button"
                role="tab"
                aria-selected={days === n}
                onClick={() => setDays(n)}
                className={cn('h-8 rounded px-3 text-xs font-bold', days === n ? 'bg-primary text-white' : 'text-fg-muted hover:text-fg')}
              >
                {t('admin.dash.lastDays', { count: n })}
              </button>
            ))}
          </div>
        }
      />

      {cur.error ? (
        <Card>
          <ErrorState error={cur.error} onRetry={() => void cur.refetch()} />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <KpiCard loading={!d} label={t('admin.dash.gmv')} icon={<Banknote />} value={d ? money(d.totals.gmv) : ''} delta={d ? deltaPct(d.totals.gmv, p?.gmv) : undefined} />
            <KpiCard loading={!d} label={t('admin.dash.revenue')} icon={<Coins />} value={d ? money(d.totals.commission) : ''} delta={d ? deltaPct(d.totals.commission, p?.commission) : undefined} />
            <KpiCard loading={!d} label={t('admin.dash.orders')} icon={<ShoppingBag />} value={d ? formatNumber(d.totals.orders, lang) : ''} delta={d ? deltaPct(d.totals.orders, p?.orders) : undefined} />
            <KpiCard
              loading={!d}
              label={t('admin.dash.users')}
              icon={<Users />}
              value={d ? compactNumber(d.totals.users) : ''}
              delta={d ? deltaPct(d.totals.newSignups, p?.newSignups) : undefined}
              sub={d ? t('admin.dash.newSignups', { count: d.totals.newSignups }) : undefined}
            />
            <KpiCard
              loading={!d}
              label={t('admin.dash.stores')}
              icon={<Store />}
              value={d ? formatNumber(stores.approved ?? 0, lang) : ''}
              sub={d ? t('admin.dash.storesSub', { pending: stores.pending ?? 0, suspended: stores.suspended ?? 0 }) : undefined}
            />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_340px]">
            <Card className="p-4 sm:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-bold text-fg">{t('admin.dash.trend')}</h2>
                <div className="inline-flex rounded-md border border-border p-0.5" role="tablist">
                  {(['gmv', 'orders', 'signups'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="tab"
                      aria-selected={metric === m}
                      onClick={() => setMetric(m)}
                      className={cn('h-7 rounded px-2.5 text-xs font-semibold', metric === m ? 'bg-primary-50 text-primary-800' : 'text-fg-muted hover:text-fg')}
                    >
                      {t(`admin.dash.metric.${m}`)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-72 w-full" dir="ltr">
                {!d ? (
                  <Skeleton className="size-full" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    {useBars ? (
                      <BarChart data={series} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border" vertical={false} />
                        <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={false} minTickGap={20} />
                        <YAxis tick={tick} tickLine={false} axisLine={false} width={44} allowDecimals={false} tickFormatter={(v: number) => (metric === 'gmv' ? compactNumber(v / 100) : String(v))} />
                        <Tooltip cursor={{ fill: 'rgb(var(--primary-500) / 0.08)' }} formatter={(v: number) => [metric === 'gmv' ? money(v) : v, t(`admin.dash.metric.${metric}`)]} />
                        <Bar dataKey={metric} fill={metric === 'gmv' ? 'rgb(var(--primary-600))' : 'rgb(var(--accent-500))'} radius={[4, 4, 0, 0]} maxBarSize={28} />
                      </BarChart>
                    ) : (
                      <AreaChart data={series} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="gmvFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="rgb(var(--primary-600))" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="rgb(var(--primary-600))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border" vertical={false} />
                        <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={false} minTickGap={24} />
                        <YAxis tick={tick} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => compactNumber(v / 100)} />
                        <Tooltip formatter={(v: number) => [money(v), t('admin.dash.metric.gmv')]} />
                        <Area type="monotone" dataKey="gmv" stroke="rgb(var(--primary-600))" strokeWidth={2} fill="url(#gmvFill)" />
                      </AreaChart>
                    )}
                  </ResponsiveContainer>
                )}
              </div>
            </Card>

            <Card className="p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-bold text-fg">{t('admin.dash.attention')}</h2>
                {d && (
                  <span className={cn('rounded-pill px-2 py-0.5 text-xs font-bold', totalPending ? 'bg-accent text-ink-900' : 'bg-success-soft text-success')}>
                    {totalPending}
                  </span>
                )}
              </div>
              {!d ? (
                <div className="grid gap-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-10" />)}</div>
              ) : totalPending === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <CheckCircle2 className="size-8 text-success" />
                  <p className="text-sm font-semibold text-fg">{t('admin.dash.allClear')}</p>
                </div>
              ) : (
                <ul className="grid gap-1">
                  {queues.map((q) => {
                    const n = d.pending[q.key] ?? 0;
                    return (
                      <li key={q.key}>
                        <Link
                          to={q.to}
                          className={cn('group flex h-10 items-center gap-3 rounded-md px-2.5 text-sm hover:bg-surface-2', !n && 'opacity-60')}
                        >
                          {n > 0 ? <AlertTriangle className="size-4 text-warning" /> : <CheckCircle2 className="size-4 text-success" />}
                          <span className="flex-1 font-medium text-fg">{t(`admin.dash.queue.${q.key}`)}</span>
                          <span className="tabular font-bold text-fg">{n}</span>
                          <ArrowRight className="flip-rtl size-4 text-fg-subtle group-hover:text-fg" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <TopList
              title={t('admin.dash.topStores')}
              loading={!d}
              rows={(d?.top.stores ?? []).map((s) => ({ id: s.id, label: s.name, to: `/admin/stores/${s.id}`, value: s.gmv, sub: t('admin.dash.ordersCount', { count: s.orders }) }))}
            />
            <TopList
              title={t('admin.dash.topProducts')}
              loading={!d}
              rows={(d?.top.products ?? []).map((s) => ({ id: s.id, label: s.title, value: s.revenue, sub: t('admin.dash.soldCount', { count: s.qty }) }))}
            />
            <TopList title={t('admin.dash.topCategories')} loading={!d} rows={(d?.top.categories ?? []).map((c) => ({ id: c.id, label: loc(c.name), value: c.revenue }))} />
          </div>
        </>
      )}
    </>
  );
}

function TopList({ title, rows, loading }: { title: string; loading: boolean; rows: { id: string; label: string; value: number; sub?: string; to?: string }[] }) {
  const { t } = useTranslation();
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <Card>
      <CardHeader title={title} />
      <div className="p-5">
        {loading ? (
          <div className="grid gap-3">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-8" />)}</div>
        ) : !rows.length ? (
          <p className="py-6 text-center text-sm text-fg-muted">{t('admin.dash.noSales')}</p>
        ) : (
          <ol className="grid gap-3">
            {rows.map((r, i) => (
              <li key={r.id} className="text-sm">
                <div className="flex items-center gap-2">
                  <span className="latin w-4 text-xs font-bold text-fg-subtle">{i + 1}</span>
                  {r.to ? (
                    <Link to={r.to} className="min-w-0 flex-1 truncate font-semibold text-fg hover:text-primary-700">
                      {r.label}
                    </Link>
                  ) : (
                    <span className="min-w-0 flex-1 truncate font-semibold text-fg">{r.label}</span>
                  )}
                  <span className="font-bold text-fg" dir="ltr">
                    {money(r.value)}
                  </span>
                </div>
                <div className="ms-6 mt-1 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-pill bg-surface-2">
                    <div className="h-full rounded-pill bg-primary-500" style={{ width: `${(r.value / max) * 100}%` }} />
                  </div>
                  {r.sub && <span className="text-[11px] text-fg-muted">{r.sub}</span>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Card>
  );
}

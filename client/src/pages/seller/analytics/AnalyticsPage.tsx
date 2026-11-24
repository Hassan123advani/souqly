import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { BarChart3, FileDown, FileSpreadsheet, Lock } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PERMISSIONS } from '@souqly/shared';
import { getErrorMessage } from '@/api/client';
import { useAnalytics, useStoreDownload, type AnalyticsRange, type AnalyticsReport } from '@/api/growth';
import { Seo } from '@/components/layout/Seo';
import { Button, Card, CardHeader, EmptyState, ErrorState, SectionHeader, Skeleton, Tooltip as UiTooltip } from '@/components/ui';
import { StorePermGate, isPlanLimit, usePlanFeature } from '@/components/seller/growth/gates';
import { compactNumber, useLang } from '@/lib/catalog';
import { cn } from '@/lib/cn';
import { formatDate, formatNumber, money } from '@/lib/format';

const RANGES: AnalyticsRange[] = ['7d', '30d', '90d'];
const tick = { fontSize: 11, fill: 'rgb(var(--fg-muted))' };
const COLORS = ['rgb(var(--primary-600))', 'rgb(var(--accent))', 'rgb(var(--sale))', 'rgb(var(--info))', 'rgb(var(--success))', 'rgb(var(--warning))'];

export default function AnalyticsPage() {
  const { t } = useTranslation();
  return (
    <>
      <Seo title={t('seller.nav.analytics')} noindex />
      <StorePermGate perm={PERMISSIONS.STORE_ANALYTICS_VIEW}>
        <AnalyticsView />
      </StorePermGate>
    </>
  );
}

function AnalyticsView() {
  const { t } = useTranslation();
  const [range, setRange] = useState<AnalyticsRange>('30d');
  const q = useAnalytics(range);
  const canExport = usePlanFeature('analyticsExport');
  const dl = useStoreDownload();
  const exportAs = (format: 'csv' | 'pdf') =>
    dl.mutate(
      { url: '/seller/analytics', params: { range, format }, filename: `analytics-${range}.${format}` },
      {
        onSuccess: () => toast.success(t('growth.analytics.exported')),
        onError: (e) => toast.error(isPlanLimit(e) ? t('growth.plan.lockedTitle', { feature: t('growth.plan.features.analyticsExport') }) : getErrorMessage(e)),
      },
    );
  const exportBtn = (format: 'csv' | 'pdf') => {
    const btn = (
      <Button
        size="sm"
        variant="outline"
        disabled={canExport === false}
        loading={dl.isPending && dl.variables?.params?.format === format}
        leftIcon={canExport === false ? <Lock className="size-4" /> : format === 'csv' ? <FileSpreadsheet className="size-4" /> : <FileDown className="size-4" />}
        onClick={() => exportAs(format)}
      >
        {t(`growth.analytics.export.${format}`)}
      </Button>
    );
    return canExport === false ? (
      <UiTooltip content={t('growth.plan.lockedTitle', { feature: t('growth.plan.features.analyticsExport') })}>
        <span tabIndex={0}>{btn}</span>
      </UiTooltip>
    ) : (
      btn
    );
  };

  return (
    <>
      <SectionHeader
        as="h1"
        title={t('seller.nav.analytics')}
        description={t('growth.analytics.subtitle')}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label={t('seller.dash.range')}>
              {RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={range === r}
                  onClick={() => setRange(r)}
                  className={cn('h-8 rounded px-3 text-xs font-semibold', range === r ? 'bg-surface-2 text-fg' : 'text-fg-muted hover:text-fg')}
                >
                  {t(`seller.dash.ranges.${r}`)}
                </button>
              ))}
            </div>
            {exportBtn('csv')}
            {exportBtn('pdf')}
          </div>
        }
      />
      {q.error ? (
        <Card>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </Card>
      ) : !q.data ? (
        <div className="grid gap-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-80" />
          <div className="grid gap-5 lg:grid-cols-2">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        </div>
      ) : (
        <Report report={q.data} fetching={q.isFetching} />
      )}
    </>
  );
}

function Report({ report: r, fetching }: { report: AnalyticsReport; fetching: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  const totals = r.series.reduce((a, s) => ({ sales: a.sales + s.sales, orders: a.orders + s.orders, units: a.units + s.units }), { sales: 0, orders: 0, units: 0 });
  const empty = totals.orders === 0 && r.funnel.visits === 0 && r.funnel.productViews === 0;
  const kpis = [
    { label: t('growth.analytics.kpi.sales'), value: money(totals.sales) },
    { label: t('growth.analytics.kpi.orders'), value: formatNumber(totals.orders, lang) },
    { label: t('growth.analytics.kpi.units'), value: formatNumber(totals.units, lang) },
    { label: t('growth.analytics.kpi.aov'), value: money(totals.orders ? Math.round(totals.sales / totals.orders) : 0) },
  ];
  return (
    <div className={cn('grid gap-5', fetching && 'opacity-70 transition-opacity')}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} className="p-4">
            <p className="text-xs font-semibold text-fg-muted">{k.label}</p>
            <p className="mt-1 text-xl font-extrabold text-fg" dir="ltr">
              {k.value}
            </p>
          </Card>
        ))}
      </div>
      {empty && (
        <Card>
          <EmptyState compact icon={<BarChart3 />} title={t('growth.analytics.emptyTitle')} description={t('growth.analytics.emptyBody')} />
        </Card>
      )}
      <Card>
        <CardHeader title={t('growth.analytics.salesOverTime')} />
        <div className="p-4 sm:p-5">
          <SeriesChart series={r.series} />
        </div>
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title={t('growth.analytics.funnel.title')} description={t('growth.analytics.funnel.hint')} />
          <div className="p-4 sm:p-5">
            <Funnel funnel={r.funnel} />
          </div>
        </Card>
        <Card>
          <CardHeader title={t('growth.analytics.customers.title')} />
          <div className="p-4 sm:p-5">
            <Customers customers={r.customers} channels={r.channels} />
          </div>
        </Card>
      </div>
      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title={t('growth.analytics.top.title')} />
          <TopProducts rows={r.topProducts} />
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title={t('growth.analytics.traffic.title')} description={t('growth.analytics.traffic.hint')} />
          <div className="p-4 sm:p-5">
            <Traffic rows={r.traffic} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function SeriesChart({ series }: { series: AnalyticsReport['series'] }) {
  const { t } = useTranslation();
  const lang = useLang();
  const [metric, setMetric] = useState<'sales' | 'orders' | 'units'>('sales');
  const data = series.map((p) => ({ ...p, label: formatDate(p.date, lang, { day: 'numeric', month: 'short' }) }));
  const isMoney = metric === 'sales';
  return (
    <div>
      <div className="mb-3 inline-flex rounded-md border border-border p-0.5" role="group">
        {(['sales', 'orders', 'units'] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={metric === m}
            onClick={() => setMetric(m)}
            className={cn('h-8 rounded px-3 text-xs font-semibold', metric === m ? 'bg-primary text-primary-fg' : 'text-fg-muted hover:text-fg')}
          >
            {t(`growth.analytics.kpi.${m}`)}
          </button>
        ))}
      </div>
      <div className="h-64 w-full" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border" vertical={false} />
            <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={false} minTickGap={20} />
            <YAxis tick={tick} tickLine={false} axisLine={false} width={48} allowDecimals={false} tickFormatter={(v: number) => compactNumber(isMoney ? v / 100 : v)} />
            <Tooltip formatter={(v: number) => [isMoney ? money(v) : v, t(`growth.analytics.kpi.${metric}`)]} cursor={{ fill: 'rgb(var(--surface-2))' }} />
            <Bar dataKey={metric} fill="rgb(var(--primary-600))" radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Funnel({ funnel }: { funnel: AnalyticsReport['funnel'] }) {
  const { t } = useTranslation();
  const lang = useLang();
  const steps = (['visits', 'productViews', 'addToCart', 'orders'] as const).map((k) => ({ key: k, n: funnel[k] }));
  const top = Math.max(1, ...steps.map((s) => s.n));
  return (
    <ol className="grid gap-3">
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1]!.n : 0;
        const rate = i > 0 && prev > 0 ? Math.round((s.n / prev) * 1000) / 10 : null;
        return (
          <li key={s.key}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-semibold text-fg">{t(`growth.analytics.funnel.${s.key}`)}</span>
              <span className="text-fg-muted">
                <span className="font-bold text-fg">{formatNumber(s.n, lang)}</span>
                {rate !== null && <span dir="ltr"> · {rate}%</span>}
              </span>
            </div>
            <div className="mt-1 h-3 overflow-hidden rounded-pill bg-surface-2">
              <div className="h-full rounded-pill bg-primary transition-[width] duration-400" style={{ width: `${(s.n / top) * 100}%` }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Customers({ customers, channels }: { customers: AnalyticsReport['customers']; channels?: AnalyticsReport['channels'] }) {
  const { t } = useTranslation();
  const lang = useLang();
  const data = [
    { name: t('growth.analytics.customers.new'), value: customers.new },
    { name: t('growth.analytics.customers.returning'), value: customers.returning },
  ];
  const total = customers.new + customers.returning;
  return (
    <div className="grid gap-4 sm:grid-cols-2 sm:items-center">
      {total === 0 ? (
        <p className="text-sm text-fg-muted">{t('growth.analytics.customers.none')}</p>
      ) : (
        <div className="h-44" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2} stroke="none">
                {data.map((d, i) => (
                  <Cell key={d.name} fill={COLORS[i]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
      <ul className="grid gap-2 text-sm">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-2">
            <span className="size-3 rounded-sm" style={{ background: COLORS[i] }} aria-hidden />
            <span className="flex-1 text-fg">{d.name}</span>
            <span className="font-bold text-fg">{formatNumber(d.value, lang)}</span>
          </li>
        ))}
        {channels && (
          <li className="mt-2 border-t border-border pt-2 text-xs text-fg-muted">
            {t('growth.analytics.channels', { online: formatNumber(channels.online, lang), pos: formatNumber(channels.pos, lang) })}
          </li>
        )}
      </ul>
    </div>
  );
}

function TopProducts({ rows }: { rows: AnalyticsReport['topProducts'] }) {
  const { t } = useTranslation();
  const lang = useLang();
  if (!rows.length) return <EmptyState compact icon={<BarChart3 />} title={t('growth.analytics.top.empty')} />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead className="bg-surface-2 text-xs text-fg-muted">
          <tr>
            <th className="px-4 py-2 text-start font-semibold">{t('growth.analytics.top.product')}</th>
            <th className="px-3 py-2 text-end font-semibold">{t('growth.analytics.top.revenue')}</th>
            <th className="px-3 py-2 text-end font-semibold">{t('growth.analytics.top.units')}</th>
            <th className="px-3 py-2 text-end font-semibold">{t('growth.analytics.top.views')}</th>
            <th className="px-3 py-2 text-end font-semibold">{t('growth.analytics.top.conversion')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((p) => (
            <tr key={p.productId}>
              <td className="max-w-[16rem] truncate px-4 py-2.5 font-semibold text-fg">{p.title}</td>
              <td className="px-3 py-2.5 text-end" dir="ltr">
                {money(p.revenue)}
              </td>
              <td className="px-3 py-2.5 text-end">{formatNumber(p.units, lang)}</td>
              <td className="px-3 py-2.5 text-end">{formatNumber(p.views, lang)}</td>
              <td className="px-3 py-2.5 text-end" dir="ltr">
                {p.conversion}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Traffic({ rows }: { rows: AnalyticsReport['traffic'] }) {
  const { t } = useTranslation();
  if (!rows.length) return <p className="text-sm text-fg-muted">{t('growth.analytics.traffic.empty')}</p>;
  const data = rows.slice(0, 8).map((r) => ({ ...r, label: r.source === 'direct' ? t('growth.analytics.traffic.direct') : r.source }));
  return (
    <div className="h-64" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
          <XAxis type="number" tick={tick} tickLine={false} axisLine={false} allowDecimals={false} />
          <YAxis type="category" dataKey="label" tick={tick} tickLine={false} axisLine={false} width={90} />
          <Tooltip formatter={(v: number) => [v, t('growth.analytics.traffic.views')]} cursor={{ fill: 'rgb(var(--surface-2))' }} />
          <Bar dataKey="views" radius={[0, 4, 4, 0]} maxBarSize={20}>
            {data.map((d, i) => (
              <Cell key={d.source} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

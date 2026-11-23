import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Banknote, Coins, Download, ShoppingBag, Undo2 } from 'lucide-react';
import { downloadCsv, useAdminGet, type FinanceReport } from '@/api/admin';
import { getErrorMessage } from '@/api/client';
import { KpiCard } from '@/components/admin/KpiCard';
import { PageHeader } from '@/components/admin/PageHeader';
import { Button, Card, EmptyState, ErrorState, Input, Select, Skeleton } from '@/components/ui';
import { compactNumber } from '@/lib/catalog';
import { money } from '@/lib/format';

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default function FinanceReportsPage() {
  const { t } = useTranslation();
  const [from, setFrom] = useState(() => iso(new Date(Date.now() - 30 * 86_400_000)));
  const [to, setTo] = useState(() => iso(new Date()));
  const [groupBy, setGroupBy] = useState<'day' | 'month'>('day');
  const [busy, setBusy] = useState(false);
  const params = { from: new Date(`${from}T00:00:00`).toISOString(), to: new Date(`${to}T23:59:59`).toISOString(), groupBy };
  const q = useAdminGet<FinanceReport>('finance/report', params);
  const r = q.data;
  const tick = { fontSize: 11, fill: 'rgb(var(--fg-muted))' };

  async function csv() {
    setBusy(true);
    try {
      await downloadCsv('finance/report', params, `finance-${from}-${to}.csv`);
      toast.success(t('admin.common.exported'));
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title={t('admin.nav.reports')}
        description={t('admin.finance.reportsSub')}
        crumbs={[{ label: t('admin.nav.finance') }]}
        actions={
          <Button variant="outline" size="sm" loading={busy} leftIcon={<Download className="size-4" />} onClick={() => void csv()}>
            {t('admin.common.exportCsv')}
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className="w-40" aria-label={t('admin.common.from')} />
        <span className="text-fg-muted">→</span>
        <Input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} className="w-40" aria-label={t('admin.common.to')} />
        <div className="w-36">
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as 'day' | 'month')} options={[{ value: 'day', label: t('admin.finance.byDay') }, { value: 'month', label: t('admin.finance.byMonth') }]} />
        </div>
      </div>
      {q.error ? (
        <Card>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard loading={!r} label={t('admin.dash.gmv')} icon={<Banknote />} value={r ? money(r.totals.gmv) : ''} sub={r ? t('admin.dash.ordersCount', { count: r.totals.orders }) : undefined} />
            <KpiCard loading={!r} label={t('admin.dash.revenue')} icon={<Coins />} value={r ? money(r.totals.commission) : ''} />
            <KpiCard loading={!r} label={t('admin.finance.refunds')} icon={<Undo2 />} value={r ? money(r.totals.refunds) : ''} />
            <KpiCard loading={!r} label={t('admin.finance.payoutsPaid')} icon={<ShoppingBag />} value={r ? money(r.totals.payouts) : ''} />
          </div>
          <Card className="mt-4 p-4 sm:p-5">
            <div className="h-80" dir="ltr">
              {!r ? (
                <Skeleton className="size-full" />
              ) : !r.rows.length ? (
                <EmptyState compact title={t('admin.finance.noData')} />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={r.rows} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border" vertical={false} />
                    <XAxis dataKey="period" tick={tick} tickLine={false} axisLine={false} minTickGap={20} />
                    <YAxis tick={tick} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => compactNumber(v / 100)} />
                    <Tooltip formatter={(v: number, name: string) => [money(v), name]} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar name={t('admin.dash.gmv')} dataKey="gmv" fill="rgb(var(--primary-600))" radius={[4, 4, 0, 0]} maxBarSize={28} />
                    <Bar name={t('admin.dash.revenue')} dataKey="commission" fill="rgb(var(--accent-500))" radius={[4, 4, 0, 0]} maxBarSize={28} />
                    <Line name={t('admin.finance.refunds')} dataKey="refunds" stroke="rgb(var(--sale-500))" strokeWidth={2} dot={false} />
                    <Line name={t('admin.finance.payoutsPaid')} dataKey="payouts" stroke="rgb(var(--primary-900))" strokeDasharray="4 3" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
          {r && r.rows.length > 0 && (
            <Card className="mt-4 overflow-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="bg-surface-2 text-[11px] font-bold uppercase tracking-wide text-fg-muted">
                    <th className="px-4 py-2.5 text-start">{t('admin.finance.period')}</th>
                    <th className="px-4 py-2.5 text-end">{t('admin.dash.orders')}</th>
                    <th className="px-4 py-2.5 text-end">{t('admin.dash.gmv')}</th>
                    <th className="px-4 py-2.5 text-end">{t('admin.dash.revenue')}</th>
                    <th className="px-4 py-2.5 text-end">{t('admin.finance.refunds')}</th>
                    <th className="px-4 py-2.5 text-end">{t('admin.finance.payoutsPaid')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border tabular" dir="ltr">
                  {[...r.rows].reverse().map((x) => (
                    <tr key={x.period}>
                      <td className="px-4 py-2 text-start font-semibold">{x.period}</td>
                      <td className="px-4 py-2 text-end">{x.orders}</td>
                      <td className="px-4 py-2 text-end">{money(x.gmv)}</td>
                      <td className="px-4 py-2 text-end">{money(x.commission)}</td>
                      <td className="px-4 py-2 text-end">{money(x.refunds)}</td>
                      <td className="px-4 py-2 text-end">{money(x.payouts)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </>
  );
}

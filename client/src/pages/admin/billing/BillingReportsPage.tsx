import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Banknote, Coins, Download, FileBarChart, HandCoins, Undo2 } from 'lucide-react';
import { downloadCsv, useAdminGet } from '@/api/admin';
import type { BillingReport, BillingReportRow } from '@/api/billing';
import { getErrorMessage } from '@/api/client';
import { DataTable, type Column } from '@/components/admin/DataTable';
import { KpiCard } from '@/components/admin/KpiCard';
import { PageHeader } from '@/components/admin/PageHeader';
import { PlanBadge } from '@/components/billing/BillingBadge';
import { Button, Input } from '@/components/ui';
import { money } from '@/lib/format';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const NUM_KEYS = ['feesBilled', 'feesPaid', 'waived', 'codCommission', 'onlineCommission', 'reversals', 'outstanding'] as const;
type NumKey = (typeof NUM_KEYS)[number];

/** Per-store billing report over a date window with CSV export (formula-safe on the server). */
export default function BillingReportsPage() {
  const { t } = useTranslation();
  const [from, setFrom] = useState(() => iso(new Date(Date.now() - 30 * 86_400_000)));
  const [to, setTo] = useState(() => iso(new Date()));
  const [busy, setBusy] = useState(false);
  const params = { from: new Date(`${from}T00:00:00`).toISOString(), to: new Date(`${to}T23:59:59`).toISOString() };
  const q = useAdminGet<BillingReport>('billing/report', params);
  const rows = q.data?.rows ?? [];
  const totals = useMemo(() => {
    const out = Object.fromEntries(NUM_KEYS.map((k) => [k, 0])) as Record<NumKey, number>;
    for (const r of rows) for (const k of NUM_KEYS) out[k] += r[k];
    return out;
  }, [rows]);
  const ready = !!q.data && !q.isPlaceholderData;

  async function csv() {
    setBusy(true);
    try {
      await downloadCsv('billing/report', params, `billing-report-${from}-${to}.csv`);
      toast.success(t('admin.common.exported'));
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const amount = (k: NumKey, strong?: boolean) => (r: BillingReportRow) => (
    <span className={`tabular ${strong ? 'font-bold' : ''}`} dir="ltr">
      {money(r[k])}
    </span>
  );
  const columns: Column<BillingReportRow>[] = [
    {
      key: 'store',
      header: t('admin.stores.store'),
      cell: (r) => (
        <Link to={`/admin/billing/stores/${r.storeId}`} className="font-semibold text-fg hover:text-primary-700">
          {r.store || r.storeId.slice(-6)}
        </Link>
      ),
    },
    { key: 'plan', header: t('billing.invoice.plan'), cell: (r) => (r.plan ? <PlanBadge plan={r.plan} /> : '—') },
    ...NUM_KEYS.map((k) => ({ key: k, header: t(`billing.admin.reports.${k}`), align: 'end' as const, cell: amount(k, k === 'outstanding') })),
  ];

  return (
    <>
      <PageHeader
        title={t('billing.admin.nav.reports')}
        description={t('billing.admin.reports.subtitle')}
        crumbs={[{ label: t('admin.nav.finance') }, { label: t('billing.admin.nav.overview'), to: '/admin/billing' }]}
        actions={
          <Button variant="outline" size="sm" loading={busy} leftIcon={<Download className="size-4" />} onClick={() => void csv()}>
            {t('admin.common.exportCsv')}
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className="w-40" aria-label={t('admin.common.from')} />
        <span className="text-fg-muted" aria-hidden>
          →
        </span>
        <Input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} className="w-40" aria-label={t('admin.common.to')} />
      </div>
      {!q.error && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard loading={!ready} label={t('billing.admin.reports.feesBilled')} icon={<FileBarChart />} value={money(totals.feesBilled)} sub={t('billing.admin.reports.paidSub', { amount: money(totals.feesPaid) })} />
          <KpiCard loading={!ready} label={t('billing.admin.reports.codCommission')} icon={<HandCoins />} value={money(totals.codCommission)} />
          <KpiCard loading={!ready} label={t('billing.admin.reports.onlineCommission')} icon={<Coins />} value={money(totals.onlineCommission)} />
          <KpiCard loading={!ready} label={t('billing.admin.reports.reversals')} icon={<Undo2 />} value={money(totals.reversals)} sub={t('billing.admin.reports.outstandingSub', { amount: money(totals.outstanding) })} />
        </div>
      )}
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.storeId}
        isLoading={q.isLoading}
        error={q.error}
        onRetry={() => void q.refetch()}
        empty={{ title: t('admin.finance.noData'), icon: <Banknote /> }}
      />
    </>
  );
}

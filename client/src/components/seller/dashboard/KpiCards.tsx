import { useTranslation } from 'react-i18next';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { KpiValue, SellerDashboard } from '@souqly/shared';
import { Card } from '@/components/ui';
import { compactNumber, useLang } from '@/lib/catalog';
import { cn } from '@/lib/cn';
import { formatNumber, money } from '@/lib/format';

const KEYS = ['sales', 'orders', 'visitors', 'conversion', 'avgOrderValue'] as const;

function Delta({ kpi }: { kpi: KpiValue }) {
  const { t } = useTranslation();
  const d = kpi.deltaPct;
  if (d === null) return <span className="text-xs text-fg-muted">{t('seller.dash.noPrevious')}</span>;
  const Icon = d > 0 ? ArrowUpRight : d < 0 ? ArrowDownRight : Minus;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-bold', d > 0 ? 'text-success' : d < 0 ? 'text-danger' : 'text-fg-muted')}>
      <Icon className="size-3.5" />
      <span dir="ltr">{Math.abs(d).toFixed(d % 1 === 0 ? 0 : 1)}%</span>
      <span className="ms-1 font-medium text-fg-muted">{t('seller.dash.vsPrevious')}</span>
    </span>
  );
}

export function KpiCards({ kpis }: { kpis: SellerDashboard['kpis'] }) {
  const { t } = useTranslation();
  const lang = useLang();
  const fmt = (k: (typeof KEYS)[number], v: number) =>
    k === 'sales' || k === 'avgOrderValue' ? money(v) : k === 'conversion' ? `${v.toFixed(1)}%` : v >= 10_000 ? compactNumber(v) : formatNumber(v, lang);
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {KEYS.map((k, i) => (
        <Card key={k} className={cn('p-4', i === 0 && 'col-span-2 lg:col-span-1')}>
          <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{t(`seller.dash.kpi.${k}`)}</p>
          <p className="mt-1.5 truncate text-xl font-extrabold text-fg sm:text-2xl" dir="ltr">
            {fmt(k, kpis[k].value)}
          </p>
          <div className="mt-1">
            <Delta kpi={kpis[k]} />
          </div>
        </Card>
      ))}
    </div>
  );
}

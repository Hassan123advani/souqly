import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Area, AreaChart, Bar, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { SellerDashboard } from '@souqly/shared';
import { compactNumber, useLang } from '@/lib/catalog';
import { cn } from '@/lib/cn';
import { formatDate, money } from '@/lib/format';

/** Sales (area) or orders (bars) over the selected range. */
export function SalesChart({ series }: { series: SellerDashboard['salesSeries'] }) {
  const { t } = useTranslation();
  const lang = useLang();
  const [metric, setMetric] = useState<'sales' | 'orders'>('sales');
  const data = series.map((p) => ({ ...p, label: formatDate(p.date, lang, { day: 'numeric', month: 'short' }) }));
  const tick = { fontSize: 11, fill: 'rgb(var(--fg-muted))' };
  return (
    <div>
      <div className="mb-3 inline-flex rounded-md border border-border p-0.5" role="tablist">
        {(['sales', 'orders'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={metric === m}
            onClick={() => setMetric(m)}
            className={cn('h-8 rounded px-3 text-xs font-semibold', metric === m ? 'bg-primary text-white' : 'text-fg-muted hover:text-fg')}
          >
            {t(`seller.dash.kpi.${m}`)}
          </button>
        ))}
      </div>
      <div className="h-64 w-full" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          {metric === 'sales' ? (
            <AreaChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgb(var(--primary-600))" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="rgb(var(--primary-600))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border" vertical={false} />
              <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tick={tick} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => compactNumber(v / 100)} />
              <Tooltip formatter={(v: number) => [money(v), t('seller.dash.kpi.sales')]} />
              <Area type="monotone" dataKey="sales" stroke="rgb(var(--primary-600))" strokeWidth={2} fill="url(#salesFill)" />
            </AreaChart>
          ) : (
            <ComposedChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border" vertical={false} />
              <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tick={tick} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
              <Tooltip formatter={(v: number) => [v, t('seller.dash.kpi.orders')]} />
              <Bar dataKey="orders" fill="rgb(var(--accent-500))" radius={[4, 4, 0, 0]} />
            </ComposedChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

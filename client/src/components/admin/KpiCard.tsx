import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Card, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';

/** % change vs the previous period, or null when there is no baseline. */
export function deltaPct(cur: number, prev: number | undefined): number | null {
  if (prev === undefined || prev === 0) return cur === 0 && prev === 0 ? 0 : null;
  return ((cur - prev) / prev) * 100;
}

export function KpiCard({ label, value, delta, icon, sub, loading }: { label: string; value: ReactNode; delta?: number | null; icon: ReactNode; sub?: ReactNode; loading?: boolean }) {
  const { t } = useTranslation();
  const Icon = delta && delta > 0 ? ArrowUpRight : delta && delta < 0 ? ArrowDownRight : Minus;
  return (
    <Card className="relative overflow-hidden p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{label}</p>
        <span className="grid size-8 place-items-center rounded-md bg-primary-50 text-primary-700 [&>svg]:size-4">{icon}</span>
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-28" />
      ) : (
        <p className="mt-1 truncate text-2xl font-extrabold tracking-tight text-fg" dir="ltr">
          {value}
        </p>
      )}
      <div className="mt-1 flex min-h-5 flex-wrap items-center gap-x-2 text-xs">
        {delta !== undefined &&
          (delta === null ? (
            <span className="text-fg-subtle">{t('admin.dash.noBaseline')}</span>
          ) : (
            <span className={cn('inline-flex items-center gap-0.5 font-bold', delta > 0 ? 'text-success' : delta < 0 ? 'text-danger' : 'text-fg-muted')}>
              <Icon className="size-3.5" />
              <span dir="ltr">{Math.abs(delta).toFixed(Math.abs(delta) >= 10 ? 0 : 1)}%</span>
              <span className="ms-1 font-medium text-fg-muted">{t('admin.dash.vsPrev')}</span>
            </span>
          ))}
        {sub && <span className="text-fg-muted">{sub}</span>}
      </div>
    </Card>
  );
}

import { useTranslation } from 'react-i18next';
import { Check, X } from 'lucide-react';
import type { OrderStatus } from '@souqly/shared';
import type { BuyerOrderDetail } from '@/api/orders';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import { useUi } from '@/stores/ui';

const TERMINAL: OrderStatus[] = ['cancelled', 'failed_delivery', 'return_requested', 'returned', 'refunded'];

type Row = { key: string; status: OrderStatus; done: boolean; current: boolean; at: string | null; bad?: boolean; note?: string };

/** Placed → … → Delivered with timestamps; cancelled / failed / return states are appended in red/amber. */
export function TrackingTimeline({ order }: { order: BuyerOrderDetail }) {
  const { t } = useTranslation();
  const lang = useUi((s) => s.language);
  let rows: Row[] = order.trackingSteps.map((s) => ({ key: s.status, ...s }));
  if (TERMINAL.includes(order.status)) {
    const last = [...order.timeline].reverse().find((e) => e.status === order.status);
    // A cancelled order never reaches the remaining happy-path steps: drop them.
    const kept = order.status === 'cancelled' ? rows.filter((r) => r.done) : rows;
    rows = [
      ...kept.map((r) => ({ ...r, current: false })),
      {
        key: order.status,
        status: order.status,
        done: true,
        current: true,
        at: last?.at ?? null,
        bad: order.status === 'cancelled' || order.status === 'failed_delivery',
        note: order.status === 'cancelled' ? order.cancel?.reason : last?.note,
      },
    ];
  }

  return (
    <ol className="relative">
      {rows.map((r, i) => {
        const lastRow = i === rows.length - 1;
        return (
          <li key={r.key} className="relative flex gap-3 pb-5 last:pb-0">
            {!lastRow && (
              <span className={cn('absolute start-[11px] top-6 h-[calc(100%-1.25rem)] w-0.5', rows[i + 1]?.done ? 'bg-primary' : 'bg-border')} aria-hidden />
            )}
            <span
              className={cn(
                'relative z-10 grid size-6 shrink-0 place-items-center rounded-full border-2',
                r.bad ? 'border-danger bg-danger text-white' : r.done ? 'border-primary bg-primary text-primary-fg' : 'border-border-strong bg-surface',
                r.current && !r.bad && 'ring-4 ring-primary/20',
              )}
            >
              {r.bad ? <X className="size-3.5 stroke-[3]" /> : r.done ? <Check className="size-3.5 stroke-[3]" /> : null}
            </span>
            <div className="min-w-0 pt-0.5">
              <p className={cn('text-sm font-semibold', r.bad ? 'text-danger' : r.done ? 'text-fg' : 'text-fg-subtle')}>
                {t(`orders.status.${r.status}`)}
                {r.current && !r.bad && <span className="ms-2 text-xs font-medium text-primary-700">{t('orders.current')}</span>}
              </p>
              {r.at && <p className="text-xs text-fg-subtle">{formatDateTime(r.at, lang)}</p>}
              {r.note && <p className="mt-0.5 text-xs text-fg-muted">{r.note}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

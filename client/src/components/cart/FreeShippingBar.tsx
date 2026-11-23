import { Truck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { money } from '@/lib/format';

/** "Add Rs X more for free shipping" progress for one store. */
export function FreeShippingBar({ remaining, threshold }: { remaining: number; threshold: number }) {
  const { t } = useTranslation();
  if (threshold <= 0) return null;
  const pct = Math.max(0, Math.min(100, Math.round(((threshold - remaining) / threshold) * 100)));
  const done = remaining <= 0;
  return (
    <div className="flex items-center gap-3 rounded-md bg-surface-2 px-3 py-2 text-xs">
      <Truck className={done ? 'size-4 shrink-0 text-success' : 'size-4 shrink-0 text-primary-700'} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-fg">
          {done ? t('cart.freeShippingUnlocked') : t('cart.freeShippingRemaining', { amount: money(remaining) })}
        </p>
        <div
          className="mt-1.5 h-1.5 overflow-hidden rounded-pill bg-border"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label={t('cart.freeShippingProgress')}
        >
          <div className={done ? 'h-full rounded-pill bg-success' : 'h-full rounded-pill bg-accent'} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

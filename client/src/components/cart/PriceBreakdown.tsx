import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { money } from '@/lib/format';

export type Breakdown = {
  itemsSubtotal: number;
  /** `null` = calculated at checkout. */
  shippingTotal: number | null;
  /** Excludes coins (shown on their own row). */
  discountTotal: number;
  coinsDiscount?: number;
  total: number;
  savings?: number;
  count?: number;
};

function Row({ label, value, tone }: { label: ReactNode; value: ReactNode; tone?: 'success' }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <dt className="text-fg-muted">{label}</dt>
      <dd className={cn('latin font-semibold tabular text-fg', tone === 'success' && 'text-success')} dir="ltr">
        {value}
      </dd>
    </div>
  );
}

/** Items / shipping / discounts / total, shared by cart, checkout and order detail. */
export function PriceBreakdown({ b, className }: { b: Breakdown; className?: string }) {
  const { t } = useTranslation();
  return (
    <dl className={cn('space-y-2.5', className)}>
      <Row label={b.count !== undefined ? t('cart.itemsCount', { count: b.count }) : t('cart.items')} value={money(b.itemsSubtotal)} />
      <Row
        label={t('cart.shipping')}
        value={b.shippingTotal === null ? <span className="font-medium text-fg-subtle">{t('cart.shippingAtCheckout')}</span> : b.shippingTotal === 0 ? t('cart.free') : money(b.shippingTotal)}
      />
      {b.discountTotal > 0 && <Row label={t('cart.discounts')} value={`− ${money(b.discountTotal)}`} tone="success" />}
      {!!b.coinsDiscount && b.coinsDiscount > 0 && <Row label={t('cart.coinsDiscount')} value={`− ${money(b.coinsDiscount)}`} tone="success" />}
      <div className="border-t border-dashed border-border pt-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="font-bold text-fg">{t('cart.total')}</dt>
          <dd className="latin text-xl font-extrabold tabular text-fg" dir="ltr">
            {money(b.total)}
          </dd>
        </div>
        {!!b.savings && b.savings > 0 && (
          <p className="mt-1 text-end text-xs font-semibold text-success">{t('cart.youSave', { amount: money(b.savings) })}</p>
        )}
      </div>
    </dl>
  );
}

import { discountPercent, type CurrencyCode } from '@souqly/shared';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { money } from '@/lib/format';
import { useUi } from '@/stores/ui';

type PriceProps = {
  /** Price in integer minor units. */
  amount: number;
  /** Original price in minor units; shown struck-through with a discount chip when higher. */
  compareAt?: number | null;
  currency?: CurrencyCode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showDiscount?: boolean;
  className?: string;
};

const sizes = { sm: 'text-sm', md: 'text-base', lg: 'text-xl', xl: 'text-3xl' };

export function Price({ amount, compareAt, currency, size = 'md', showDiscount = true, className }: PriceProps) {
  const { t } = useTranslation();
  const prefCurrency = useUi((s) => s.currency);
  const cur = currency ?? prefCurrency;
  const pct = discountPercent(amount, compareAt);
  return (
    <span className={cn('latin inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5', className)} dir="ltr">
      <span className={cn('font-extrabold tracking-tight text-fg tabular', sizes[size], pct > 0 && 'text-sale-600')}>
        {money(amount, cur)}
      </span>
      {pct > 0 && compareAt && (
        <>
          <s className="text-xs text-fg-subtle tabular" aria-label={t('price.was', { price: money(compareAt, cur) })}>
            {money(compareAt, cur)}
          </s>
          {showDiscount && (
            <span className="rounded-sm bg-sale-50 px-1.5 py-0.5 text-[11px] font-bold text-sale-700">-{pct}%</span>
          )}
        </>
      )}
    </span>
  );
}

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Zap } from 'lucide-react';
import { Checkbox, Price } from '@/components/ui';
import { ProductImage } from '@/components/product/ProductImage';
import { cn } from '@/lib/cn';
import { QtyStepper } from './QtyStepper';

export type LineView = {
  id: string;
  slug: string;
  title: string;
  image?: string;
  options?: Record<string, string>;
  price: number;
  compareAtPrice?: number;
  qty: number;
  maxQty: number;
  flash?: boolean;
};

/** One cart row. Actions are passed in so the same row serves guest, server and saved lines. */
export function CartLine({
  item,
  selected,
  onSelect,
  onQty,
  issue,
  actions,
  disabled,
  muted,
}: {
  item: LineView;
  selected?: boolean;
  onSelect?: (v: boolean) => void;
  onQty?: (qty: number) => void;
  issue?: ReactNode;
  actions: ReactNode;
  disabled?: boolean;
  muted?: boolean;
}) {
  const { t } = useTranslation();
  const opts = Object.entries(item.options ?? {});
  const soldOut = item.maxQty <= 0;
  return (
    <li className={cn('flex gap-3 py-4 sm:gap-4', muted && 'opacity-70')}>
      {onSelect && (
        <Checkbox
          checked={!!selected}
          disabled={disabled || soldOut}
          onChange={(e) => onSelect(e.target.checked)}
          aria-label={t('cart.selectItem', { title: item.title })}
          className="pt-7"
        />
      )}
      <Link to={`/p/${item.slug}`} className="shrink-0 rounded-md">
        <ProductImage src={item.image} alt={item.title} className="size-20 rounded-md sm:size-24" />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link to={`/p/${item.slug}`} className="line-clamp-2 text-sm font-semibold text-fg hover:text-primary-700">
              {item.title}
            </Link>
            {opts.length > 0 && (
              <p className="mt-0.5 truncate text-xs text-fg-subtle">{opts.map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>
            )}
            {item.flash && (
              <span className="mt-1 inline-flex items-center gap-1 rounded-sm bg-sale-50 px-1.5 py-0.5 text-[11px] font-bold text-sale-700">
                <Zap className="size-3" aria-hidden />
                {t('cart.flash')}
              </span>
            )}
          </div>
          <Price amount={item.price} compareAt={item.compareAtPrice} size="sm" showDiscount={false} className="shrink-0 flex-col items-end" />
        </div>
        {issue && (
          <p className="mt-2 flex items-start gap-1.5 rounded-sm bg-warning-soft px-2 py-1 text-xs font-medium text-warning">
            <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
            <span>{issue}</span>
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          {onQty && !soldOut ? (
            <QtyStepper value={item.qty} max={Math.max(1, item.maxQty)} onChange={onQty} disabled={disabled} />
          ) : (
            <span className="text-xs text-fg-subtle">{soldOut ? t('cart.soldOut') : t('cart.qtyN', { n: item.qty })}</span>
          )}
          <div className="flex items-center gap-1">{actions}</div>
        </div>
      </div>
    </li>
  );
}

export function LineAction({ onClick, children, danger, disabled }: { onClick: () => void; children: ReactNode; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring [&_svg]:size-3.5',
        danger && 'hover:text-danger',
      )}
    >
      {children}
    </button>
  );
}

import { memo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BadgeCheck, HandCoins, Store, Truck, Zap } from 'lucide-react';
import type { ProductCard as ProductCardData } from '@souqly/shared';
import { Price, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { compactNumber } from '@/lib/catalog';
import { ProductImage } from './ProductImage';

export type ProductCardVariant = 'grid' | 'list';

/** Effective selling price and the struck-through reference price (flash price wins). */
export function cardPricing(p: ProductCardData): { price: number; compareAt?: number; pct: number } {
  if (p.flash) {
    const ref = Math.max(p.compareAtPrice ?? 0, p.price);
    return { price: p.flash.price, compareAt: ref, pct: Math.round(((ref - p.flash.price) / ref) * 100) };
  }
  return { price: p.price, compareAt: p.compareAtPrice, pct: p.discountPct };
}

export function MallBadge({ className, size = 'sm' }: { className?: string; size?: 'sm' | 'md' }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-pill bg-primary font-bold text-primary-fg',
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs',
        className,
      )}
      title={t('product.mallTitle')}
    >
      <BadgeCheck className={size === 'sm' ? 'size-3' : 'size-3.5'} aria-hidden />
      {t('product.mall')}
    </span>
  );
}

function Chips({ p, compact }: { p: ProductCardData; compact?: boolean }) {
  const { t } = useTranslation();
  if (!p.freeShipping && !p.cod && !p.preOrder) return null;
  const chip = 'inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] font-semibold';
  return (
    <div className="flex flex-wrap gap-1">
      {p.freeShipping && (
        <span className={cn(chip, 'bg-success-soft text-success')}>
          <Truck className="size-3" aria-hidden />
          {t('product.freeShipping')}
        </span>
      )}
      {p.cod && !compact && (
        <span className={cn(chip, 'bg-surface-2 text-fg-muted')}>
          <HandCoins className="size-3" aria-hidden />
          {t('product.codShort')}
        </span>
      )}
      {p.preOrder && <span className={cn(chip, 'bg-info-soft text-info')}>{t('product.preOrder')}</span>}
    </div>
  );
}

function ProductCardImpl({
  product: p,
  variant = 'grid',
  eager,
  className,
}: {
  product: ProductCardData;
  variant?: ProductCardVariant;
  eager?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const { price, compareAt, pct } = cardPricing(p);
  const href = `/p/${p.slug}`;
  const list = variant === 'list';

  const badges = (
    <div className="pointer-events-none absolute inset-x-2 top-2 flex items-start justify-between gap-1">
      <div className="flex flex-col items-start gap-1">
        {pct > 0 && (
          <span className="rounded-sm bg-sale px-1.5 py-0.5 text-[11px] font-extrabold text-sale-fg shadow-sm tabular" dir="ltr">
            -{pct}%
          </span>
        )}
        {p.flash && (
          <span className="inline-flex items-center gap-0.5 rounded-sm bg-accent px-1.5 py-0.5 text-[10px] font-bold text-accent-fg shadow-sm">
            <Zap className="size-3 fill-current" aria-hidden />
            {t('product.flash')}
          </span>
        )}
      </div>
      {p.isMall && <MallBadge className="shadow-sm" />}
    </div>
  );

  return (
    <article
      className={cn(
        'group relative flex overflow-hidden rounded-lg border border-border bg-surface transition-[box-shadow,transform,border-color] duration-250 ease-souq',
        'hover:-translate-y-0.5 hover:border-border-strong hover:shadow-pop focus-within:shadow-pop',
        list ? 'flex-row' : 'flex-col',
        className,
      )}
    >
      <Link to={href} className={cn('relative block shrink-0', list ? 'w-32 sm:w-44' : 'w-full')} tabIndex={-1} aria-hidden>
        <ProductImage
          src={p.image}
          alt=""
          eager={eager}
          className={cn('aspect-square', list ? 'h-full min-h-32 sm:min-h-44' : 'w-full')}
          imgClassName="group-hover:scale-[1.03]"
        />
        {badges}
        {p.unavailable && (
          <span className="absolute inset-x-0 bottom-0 bg-ink-950/70 px-2 py-1 text-center text-[11px] font-semibold text-white">
            {t('product.unavailable')}
          </span>
        )}
      </Link>

      <div className={cn('flex min-w-0 flex-1 flex-col gap-1.5', list ? 'p-3 sm:p-4' : 'p-3')}>
        <h3 className={cn('font-medium leading-snug text-fg', list ? 'line-clamp-2 text-sm sm:text-base' : 'line-clamp-2 min-h-[2.5rem] text-[13px] sm:text-sm')}>
          <Link to={href} className="outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline">
            {p.title}
          </Link>
        </h3>

        <Price amount={price} compareAt={compareAt} size={list ? 'lg' : 'md'} showDiscount={list} />

        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-fg-muted">
          {p.ratingCount > 0 && (
            <span className="inline-flex items-center gap-1" aria-label={t('rating.label', { value: p.ratingAvg.toFixed(1) })}>
              <svg viewBox="0 0 20 20" className="size-3.5 fill-accent" aria-hidden>
                <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9z" />
              </svg>
              <span className="latin font-semibold text-fg tabular">{p.ratingAvg.toFixed(1)}</span>
              <span className="latin tabular">({compactNumber(p.ratingCount)})</span>
            </span>
          )}
          {p.soldCount > 0 && <span>{t('product.sold', { n: compactNumber(p.soldCount) })}</span>}
        </div>

        {p.stockLeft !== undefined && p.stockLeft > 0 && (
          <p className="text-[11px] font-semibold text-sale-600">{t('product.onlyLeft', { n: p.stockLeft })}</p>
        )}

        <Chips p={p} compact={!list} />

        <p className={cn('mt-auto flex items-center gap-1 truncate pt-0.5 text-[11px] text-fg-subtle', list && 'text-xs')}>
          <Store className="size-3 shrink-0" aria-hidden />
          <span className="truncate">{p.store.name}</span>
        </p>
      </div>
    </article>
  );
}

export const ProductCard = memo(ProductCardImpl);

export function ProductCardListSkeleton() {
  return (
    <div className="flex overflow-hidden rounded-lg border border-border bg-surface" aria-hidden>
      <Skeleton className="aspect-square w-32 shrink-0 rounded-none sm:w-44" />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <Skeleton className="h-3.5 w-4/5" />
        <Skeleton className="h-3.5 w-2/5" />
        <Skeleton className="mt-2 h-5 w-24" />
        <Skeleton className="mt-auto h-3 w-20" />
      </div>
    </div>
  );
}

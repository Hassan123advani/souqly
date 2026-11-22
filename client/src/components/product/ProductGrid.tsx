import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProductCard as ProductCardData } from '@souqly/shared';
import { Button, ProductCardSkeleton } from '@/components/ui';
import { useInView } from '@/hooks/useInView';
import { cn } from '@/lib/cn';
import { ProductCard, ProductCardListSkeleton, type ProductCardVariant } from './ProductCard';

const gridCols = {
  default: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
  wide: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6',
  narrow: 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-4',
};

export type GridDensity = keyof typeof gridCols;

export function ProductGrid({
  products,
  variant = 'grid',
  density = 'default',
  className,
}: {
  products: ProductCardData[];
  variant?: ProductCardVariant;
  density?: GridDensity;
  className?: string;
}) {
  return (
    <ul className={cn(variant === 'list' ? 'grid gap-3 lg:grid-cols-2' : cn('grid gap-2.5 sm:gap-4', gridCols[density]), className)}>
      {products.map((p, i) => (
        <li key={p.id} className="flex animate-fade-in">
          <ProductCard product={p} variant={variant} eager={i < 4} className="w-full" />
        </li>
      ))}
    </ul>
  );
}

export function ProductGridSkeleton({
  count = 10,
  variant = 'grid',
  density = 'default',
  className,
}: {
  count?: number;
  variant?: ProductCardVariant;
  density?: GridDensity;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div role="status" aria-label={t('common.loading')} className={className}>
      <div className={cn(variant === 'list' ? 'grid gap-3 lg:grid-cols-2' : cn('grid gap-2.5 sm:gap-4', gridCols[density]))}>
        {Array.from({ length: count }).map((_, i) =>
          variant === 'list' ? <ProductCardListSkeleton key={i} /> : <ProductCardSkeleton key={i} />,
        )}
      </div>
    </div>
  );
}

/**
 * Infinite-scroll footer: an IntersectionObserver sentinel triggers `onLoadMore` automatically;
 * the button is the accessible / no-JS-observer fallback.
 */
export function LoadMore({
  hasMore,
  loading,
  onLoadMore,
  shown,
  total,
}: {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  shown?: number;
  total?: number;
}) {
  const { t } = useTranslation();
  const { ref, inView } = useInView<HTMLDivElement>('800px');
  useEffect(() => {
    if (inView && hasMore && !loading) onLoadMore();
  }, [inView, hasMore, loading, onLoadMore]);

  return (
    <div ref={ref} className="flex flex-col items-center gap-3 py-8">
      {total !== undefined && shown !== undefined && total > 0 && (
        <p className="text-xs text-fg-subtle">{t('listing.showing', { shown, total })}</p>
      )}
      {hasMore ? (
        <Button variant="outline" onClick={onLoadMore} loading={loading} aria-live="polite">
          {loading ? t('common.loading') : t('listing.loadMore')}
        </Button>
      ) : (
        shown !== undefined &&
        shown > 0 && (
          <p className="inline-flex items-center gap-2 text-xs font-medium text-fg-subtle">
            <span className="h-px w-8 bg-border" aria-hidden />
            {t('listing.end')}
            <span className="h-px w-8 bg-border" aria-hidden />
          </p>
        )
      )}
    </div>
  );
}

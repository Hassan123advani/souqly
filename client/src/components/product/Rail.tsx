import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ProductCard as ProductCardData } from '@souqly/shared';
import { Button, ErrorState, ProductCardSkeleton, SectionHeader } from '@/components/ui';
import { cn } from '@/lib/cn';
import { ProductCard } from './ProductCard';

/**
 * Horizontal scroller with scroll-snap. Arrow buttons appear on desktop when there is more to see;
 * they scroll by ~one viewport and respect RTL (scrollLeft is negative in RTL).
 */
export function Rail({ children, label, className, itemClassName }: { children: ReactNode[]; label: string; className?: string; itemClassName?: string }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const pos = Math.abs(el.scrollLeft);
    setEdges({ start: pos < 4, end: pos + el.clientWidth >= el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [update, children.length]);

  const scroll = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const rtl = getComputedStyle(el).direction === 'rtl';
    el.scrollBy({ left: dir * (rtl ? -1 : 1) * el.clientWidth * 0.85, behavior: 'smooth' });
  };

  const arrow = 'absolute top-[38%] z-10 hidden size-10 -translate-y-1/2 place-items-center rounded-full border border-border bg-surface/95 text-fg shadow-pop backdrop-blur transition hover:bg-surface md:grid disabled:pointer-events-none disabled:opacity-0';

  return (
    <div className={cn('group/rail relative', className)}>
      <ul
        ref={ref}
        onScroll={update}
        aria-label={label}
        className="no-scrollbar -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-2.5 overflow-x-auto px-4 pb-2 sm:mx-0 sm:scroll-px-0 sm:gap-4 sm:px-0"
      >
        {Children.map(children, (child) => (
          <li className={cn('flex shrink-0 snap-start', itemClassName ?? 'w-[42%] sm:w-[30%] md:w-[23%] lg:w-[18.5%] xl:w-[15.8%]')}>
            {child}
          </li>
        ))}
      </ul>
      <button type="button" className={cn(arrow, '-start-4')} onClick={() => scroll(-1)} disabled={edges.start} aria-label={t('listing.prev')}>
        <ChevronLeft className="flip-rtl size-5" />
      </button>
      <button type="button" className={cn(arrow, '-end-4')} onClick={() => scroll(1)} disabled={edges.end} aria-label={t('listing.next')}>
        <ChevronRight className="flip-rtl size-5" />
      </button>
    </div>
  );
}

/** Titled product rail with skeleton, error and (hidden-when-empty) states. */
export function ProductRail({
  title,
  eyebrow,
  products,
  loading,
  error,
  onRetry,
  viewAll,
  className,
  hideWhenEmpty = true,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  products?: ProductCardData[];
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  viewAll?: string;
  className?: string;
  hideWhenEmpty?: boolean;
}) {
  const { t } = useTranslation();
  if (!loading && !error && hideWhenEmpty && !products?.length) return null;
  const label = typeof title === 'string' ? title : t('listing.products');
  return (
    <section className={cn('mt-10 sm:mt-12', className)} aria-busy={loading || undefined}>
      <SectionHeader
        title={title}
        eyebrow={eyebrow}
        action={
          viewAll ? (
            <Button to={viewAll} variant="link" size="sm" rightIcon={<ArrowRight className="flip-rtl size-4" />}>
              {t('listing.viewAll')}
            </Button>
          ) : undefined
        }
      />
      {error ? (
        <ErrorState compact error={error} onRetry={onRetry} className="rounded-lg border border-border bg-surface" />
      ) : loading ? (
        <Rail label={label}>{Array.from({ length: 6 }).map((_, i) => <ProductCardSkeleton key={i} className="w-full" />)}</Rail>
      ) : (
        <Rail label={label}>{(products ?? []).map((p) => <ProductCard key={p.id} product={p} className="w-full" />)}</Rail>
      )}
    </section>
  );
}

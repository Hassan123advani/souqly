import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Zap } from 'lucide-react';
import type { ProductCard } from '@souqly/shared';
import { useFlashSale } from '@/api/catalog';
import { Countdown, Price, ProductCardSkeleton } from '@/components/ui';
import { ProductImage } from '@/components/product/ProductImage';
import { Rail } from '@/components/product/Rail';
import { cardPricing } from '@/components/product/ProductCard';

type FlashItem = ProductCard & { quantityLimit?: number; sold?: number };

function FlashCard({ item }: { item: FlashItem }) {
  const { t } = useTranslation();
  const { price, compareAt, pct } = cardPricing(item);
  const limit = item.quantityLimit ?? 0;
  const sold = item.sold ?? 0;
  const ratio = limit > 0 ? Math.min(1, sold / limit) : 0;
  const left = Math.max(0, limit - sold);
  return (
    <Link
      to={`/p/${item.slug}`}
      className="group flex w-full flex-col overflow-hidden rounded-lg bg-surface shadow-card ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-pop"
    >
      <div className="relative">
        <ProductImage src={item.image} alt={item.title} className="aspect-square" imgClassName="group-hover:scale-[1.03]" />
        {pct > 0 && (
          <span className="absolute start-2 top-2 rounded-sm bg-sale px-1.5 py-0.5 text-[11px] font-extrabold text-sale-fg tabular" dir="ltr">
            -{pct}%
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-2.5">
        <p className="line-clamp-1 text-xs text-fg">{item.title}</p>
        <Price amount={price} compareAt={compareAt} showDiscount={false} size="sm" />
        {limit > 0 && (
          <div className="mt-auto">
            <div
              className="relative h-4 overflow-hidden rounded-pill bg-sale-100"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={limit}
              aria-valuenow={sold}
              aria-label={t('home.flash.soldOf', { sold, limit })}
            >
              <div className="absolute inset-y-0 start-0 rounded-pill bg-gradient-to-r from-accent to-sale rtl:bg-gradient-to-l" style={{ width: `${Math.max(8, ratio * 100)}%` }} />
              <span className="relative block text-center text-[10px] font-bold leading-4 text-ink-900 dark:text-ink-50">
                {ratio >= 0.8 ? t('home.flash.almostGone') : t('home.flash.left', { n: left })}
              </span>
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}

/** Flash sale strip with a live countdown; quantities come from /flash-sales/current. */
export function FlashSaleStrip({ fallback, loading }: { fallback?: { endsAt: string; title: string; items: ProductCard[] } | null; loading?: boolean }) {
  const { t } = useTranslation();
  const flash = useFlashSale();
  const sale = flash.data ?? fallback;
  if (!loading && !flash.isPending && !sale?.items.length) return null;
  if (sale && new Date(sale.endsAt).getTime() <= Date.now() && !loading) return null;
  const items: FlashItem[] = sale?.items ?? [];
  return (
    <section className="mt-8 overflow-hidden rounded-xl bg-gradient-to-br from-sale via-[#C9442F] to-[#E07A2E] p-3 shadow-pop sm:p-5 rtl:bg-gradient-to-bl" aria-labelledby="home-flash">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-1 text-white sm:mb-4">
        <h2 id="home-flash" className="inline-flex items-center gap-2 text-xl font-black tracking-tight sm:text-2xl">
          <span className="grid size-8 place-items-center rounded-full bg-white/15">
            <Zap className="size-4 fill-accent text-accent" aria-hidden />
          </span>
          {t('home.flash.title')}
        </h2>
        {sale && (
          <div className="flex items-center gap-2 text-xs font-semibold sm:text-sm">
            <span className="opacity-90">{t('home.flash.endsIn')}</span>
            <Countdown to={sale.endsAt} onDone={() => void flash.refetch()} className="[&_span.bg-ink-900]:bg-black/35 [&_span.text-sale-600]:text-white" />
          </div>
        )}
      </div>
      <Rail label={t('home.flash.title')} itemClassName="w-[38%] sm:w-[24%] md:w-[19%] lg:w-[15.6%] xl:w-[13.6%]">
        {loading || (flash.isPending && !fallback)
          ? Array.from({ length: 7 }).map((_, i) => <ProductCardSkeleton key={i} className="w-full" />)
          : items.map((it) => <FlashCard key={it.id} item={it} />)}
      </Rail>
    </section>
  );
}

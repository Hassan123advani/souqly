import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, ShoppingCart } from 'lucide-react';
import type { ProductCard, ProductDetail, ProductVariantDTO } from '@souqly/shared';
import { get } from '@/api/client';
import { catalogKeys, useBoughtTogether } from '@/api/catalog';
import { Button, Checkbox, Price, SectionHeader, Skeleton } from '@/components/ui';
import { ProductImage } from '@/components/product/ProductImage';
import { cardPricing } from '@/components/product/ProductCard';
import { useAddToCart, unitPrice } from '@/hooks/useAddToCart';
import { cn } from '@/lib/cn';
import { money } from '@/lib/format';

/**
 * "Frequently bought together": the current product (selected variant) plus up to two companions.
 * Companions are added with their first in-stock variant (D-044).
 */
export function BoughtTogether({ product, variant }: { product: ProductDetail; variant?: ProductVariantDTO }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const addToCart = useAddToCart();
  const { data, isLoading } = useBoughtTogether(product.slug);
  const items = (data ?? []).filter((p) => p.id !== product.id && !p.unavailable).slice(0, 2);
  const [unchecked, setUnchecked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  if (isLoading)
    return (
      <section className="mt-10">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="mt-4 h-40 w-full rounded-lg" />
      </section>
    );
  if (!items.length || !variant) return null;

  const main = unitPrice(product, variant).price;
  const chosen = items.filter((p) => !unchecked.includes(p.id));
  const total = main + chosen.reduce((s, p) => s + cardPricing(p).price, 0);

  async function addAll() {
    setBusy(true);
    try {
      addToCart(product, variant!, 1, { silent: true });
      let added = 1;
      for (const c of chosen) {
        const detail = await qc.fetchQuery({ queryKey: catalogKeys.product(c.slug), queryFn: () => get<ProductDetail>(`/products/${c.slug}`), staleTime: 60_000 });
        const v = detail.variants.find((x) => x.isActive && x.stock > 0);
        if (v) {
          addToCart(detail, v, 1, { silent: true });
          added++;
        }
      }
      toast.success(t('pdp.addedAll', { n: added }));
    } catch {
      toast.error(t('errors.GENERIC'));
    } finally {
      setBusy(false);
    }
  }

  const all: (ProductCard & { main?: boolean })[] = [
    {
      id: product.id,
      slug: product.slug,
      title: product.title,
      image: variant.images?.[0] ?? product.images[0]?.url ?? '',
      price: main,
      discountPct: 0,
      ratingAvg: product.ratingAvg,
      ratingCount: product.ratingCount,
      soldCount: product.soldCount,
      freeShipping: product.freeShipping,
      cod: product.cod,
      isMall: product.store.isMall,
      store: { slug: product.store.slug, name: product.store.name },
      main: true,
    },
    ...items,
  ];

  return (
    <section className="mt-10" aria-labelledby="fbt-title">
      <SectionHeader title={<span id="fbt-title">{t('pdp.boughtTogether')}</span>} />
      <div className="flex flex-col gap-5 rounded-lg border border-border bg-surface p-4 sm:p-5 lg:flex-row lg:items-center">
        <ul className="flex flex-1 items-center gap-2 overflow-x-auto sm:gap-3">
          {all.map((p, i) => (
            <li key={p.id} className="flex items-center gap-2 sm:gap-3">
              {i > 0 && <Plus className="size-5 shrink-0 text-fg-subtle" aria-hidden />}
              <Link to={`/p/${p.slug}`} className={cn('block w-24 shrink-0 sm:w-32', unchecked.includes(p.id) && 'opacity-40')}>
                <ProductImage src={p.image} alt={p.title} className="aspect-square rounded-md border border-border" />
              </Link>
            </li>
          ))}
        </ul>
        <div className="space-y-2 lg:w-80">
          {all.map((p) => (
            <Checkbox
              key={p.id}
              checked={p.main || !unchecked.includes(p.id)}
              disabled={p.main}
              onChange={() => setUnchecked((u) => (u.includes(p.id) ? u.filter((x) => x !== p.id) : [...u, p.id]))}
              label={
                <span className="flex gap-2">
                  <span className="line-clamp-1 font-normal">
                    {p.main && <span className="font-semibold">{t('pdp.thisItem')} </span>}
                    {p.title}
                  </span>
                  <span className="latin shrink-0 font-bold tabular" dir="ltr">
                    {money(p.main ? main : cardPricing(p).price)}
                  </span>
                </span>
              }
            />
          ))}
          <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
            <div>
              <p className="text-xs text-fg-muted">{t('pdp.totalFor', { n: chosen.length + 1 })}</p>
              <Price amount={total} size="lg" />
            </div>
            <Button onClick={() => void addAll()} loading={busy} leftIcon={<ShoppingCart className="size-4" />}>
              {t('pdp.addAll')}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

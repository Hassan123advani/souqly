import { useTranslation } from 'react-i18next';
import { Truck } from 'lucide-react';
import type { CheckoutPreview } from '@/api/cart';
import { ProductImage } from '@/components/product/ProductImage';
import { StoreHeader } from '@/components/cart/StoreHeader';
import { money } from '@/lib/format';
import { Step } from './Step';

/** Per-store shipping, items and an optional note to the seller. */
export function ReviewStep({
  n,
  preview,
  notes,
  onNote,
}: {
  n: number;
  preview: CheckoutPreview;
  notes: Record<string, string>;
  onNote: (storeId: string, text: string) => void;
}) {
  const { t } = useTranslation();
  const byStore = new Map(preview.stores.map((s) => [s.storeId, s]));
  const groups = preview.groups.filter((g) => g.items.some((i) => i.selected));
  return (
    <Step n={n} title={t('checkout.review', { count: groups.length })}>
      <div className="space-y-5">
        {groups.map((g, idx) => {
          const s = byStore.get(g.store.id);
          const items = g.items.filter((i) => i.selected);
          return (
            <section key={g.store.id} className={idx ? 'border-t border-border pt-5' : undefined}>
              <StoreHeader
                store={g.store}
                trailing={<span className="text-xs font-semibold text-fg-subtle">{t('checkout.packageN', { n: idx + 1, total: groups.length })}</span>}
              />
              <ul className="mt-3 space-y-3">
                {items.map((i) => (
                  <li key={i.id} className="flex items-center gap-3">
                    <ProductImage src={i.image} alt={i.title} className="size-14 shrink-0 rounded-md" />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-sm font-medium text-fg">{i.title}</p>
                      <p className="truncate text-xs text-fg-subtle">
                        {Object.values(i.options).join(' · ')}
                        {Object.keys(i.options).length ? ' · ' : ''}
                        {t('cart.qtyN', { n: i.qty })}
                      </p>
                    </div>
                    <span className="latin shrink-0 text-sm font-semibold tabular text-fg" dir="ltr">
                      {money(i.lineTotal)}
                    </span>
                  </li>
                ))}
              </ul>
              {s && (
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-surface-2 px-3 py-2 text-xs">
                  <span className="flex items-center gap-1.5 font-semibold text-fg">
                    <Truck className="size-4 text-primary-700" aria-hidden />
                    {t('checkout.standardDelivery')}
                  </span>
                  <span className="latin text-fg-muted" dir="ltr">
                    {s.shippingFee === 0 ? t('cart.free') : money(s.shippingFee)}
                    {s.shippingBase > s.shippingFee && <s className="ms-1.5 text-fg-subtle">{money(s.shippingBase)}</s>}
                  </span>
                  {s.storeDiscount > 0 && <span className="text-success">{t('checkout.storeDiscount', { amount: money(s.storeDiscount) })}</span>}
                  <span className="ms-auto font-bold text-fg">
                    {t('checkout.storeTotal')} <span className="latin tabular" dir="ltr">{money(s.total)}</span>
                  </span>
                </div>
              )}
              <label className="mt-3 block">
                <span className="sr-only">{t('checkout.noteFor', { store: g.store.name })}</span>
                <textarea
                  value={notes[g.store.id] ?? ''}
                  onChange={(e) => onNote(g.store.id, e.target.value)}
                  maxLength={500}
                  rows={2}
                  placeholder={t('checkout.notePlaceholder')}
                  className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm placeholder:text-fg-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                />
              </label>
            </section>
          );
        })}
      </div>
    </Step>
  );
}

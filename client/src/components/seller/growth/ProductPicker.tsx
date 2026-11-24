import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search, X } from 'lucide-react';
import type { SellerProduct } from '@souqly/shared';
import { useSellerProduct, useSellerProducts } from '@/api/seller';
import { IconButton, Input, Skeleton, Spinner } from '@/components/ui';
import { useDebounced } from '@/hooks/useDebounced';
import { money } from '@/lib/format';

/** Cheapest active variant price of a seller product (minor units). */
export function minPrice(p: Pick<SellerProduct, 'variants'>): number {
  const prices = p.variants.filter((v) => v.isActive).map((v) => v.price);
  return prices.length ? Math.min(...prices) : (p.variants[0]?.price ?? 0);
}

/** Search-as-you-type over this store's products; picking one calls `onAdd`. */
export function ProductSearchAdd({ onAdd, exclude = [], disabled }: { onAdd: (p: SellerProduct) => void; exclude?: string[]; disabled?: boolean }) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const dq = useDebounced(q.trim(), 300);
  const list = useSellerProducts({ q: dq || undefined });
  const rows = (list.data?.pages.flatMap((p) => p.data) ?? []).filter((p) => !exclude.includes(p.id) && p.status !== 'archived').slice(0, 8);
  return (
    <div className="relative">
      <Input
        type="search"
        value={q}
        disabled={disabled}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={t('growth.picker.search')}
        aria-label={t('growth.picker.search')}
        startIcon={<Search className="size-4" />}
      />
      {open && !disabled && (
        <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-border bg-surface shadow-pop">
          {list.isLoading ? (
            <div className="grid place-items-center p-4">
              <Spinner />
            </div>
          ) : list.error ? (
            <p className="p-3 text-sm text-danger">{t('growth.picker.error')}</p>
          ) : !rows.length ? (
            <p className="p-3 text-sm text-fg-muted">{t('growth.picker.none')}</p>
          ) : (
            <ul role="listbox" aria-label={t('growth.picker.results')}>
              {rows.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onAdd(p);
                      setQ('');
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2 text-start hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
                  >
                    <span className="size-9 shrink-0 overflow-hidden rounded bg-surface-2">
                      {p.images[0] && <img src={p.images[0].url} alt="" className="size-full object-cover" loading="lazy" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-1 text-sm font-semibold text-fg">{p.title}</span>
                      <span className="text-xs text-fg-muted" dir="ltr">
                        {money(minPrice(p))}
                      </span>
                    </span>
                    <Plus className="size-4 text-fg-muted" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Product title by id (cached per product). */
export function ProductName({ id, className }: { id: string; className?: string }) {
  const { t } = useTranslation();
  const p = useSellerProduct(id);
  if (p.isLoading) return <Skeleton className="inline-block h-4 w-32 align-middle" />;
  return <span className={className}>{p.data?.title ?? t('growth.picker.unknown')}</span>;
}

/** Removable chips for a list of chosen product ids. */
export function ProductChips({ ids, onRemove }: { ids: string[]; onRemove?: (id: string) => void }) {
  const { t } = useTranslation();
  if (!ids.length) return <p className="text-xs text-fg-muted">{t('growth.picker.noneChosen')}</p>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {ids.map((id) => (
        <li key={id} className="inline-flex max-w-full items-center gap-1 rounded-pill border border-border bg-surface-2 py-0.5 pe-1 ps-2.5 text-xs">
          <ProductName id={id} className="line-clamp-1" />
          {onRemove && (
            <IconButton label={t('seller.common.remove')} size="sm" variant="ghost" className="size-6" onClick={() => onRemove(id)}>
              <X className="size-3" />
            </IconButton>
          )}
        </li>
      ))}
    </ul>
  );
}

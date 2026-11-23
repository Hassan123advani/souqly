import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import type { ProductCard } from '@souqly/shared';
import { api } from '@/api/client';
import { Input, Spinner } from '@/components/ui';
import { useDebounced } from '@/hooks/useDebounced';
import { money } from '@/lib/format';

/** Searches published products (public catalog search) and reports the picked one. */
export function ProductPicker({ onPick, exclude = [] }: { onPick: (p: ProductCard) => void; exclude?: string[] }) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 300);
  const res = useQuery({
    queryKey: ['admin', 'product-picker', dq],
    queryFn: async () => (await api.get<{ data: ProductCard[] }>('/products', { params: { q: dq, limit: 8 } })).data.data,
    enabled: dq.length >= 2,
  });
  const rows = (res.data ?? []).filter((p) => !exclude.includes(p.id));
  return (
    <div className="relative">
      <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('admin.common.searchProducts')} aria-label={t('admin.common.searchProducts')} startIcon={<Search className="size-4" />} endAdornment={res.isFetching ? <Spinner className="size-4" /> : undefined} />
      {dq.length >= 2 && !res.isFetching && (
        <ul className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-md border border-border bg-surface shadow-pop">
          {!rows.length ? (
            <li className="px-3 py-4 text-center text-sm text-fg-muted">{t('admin.common.noResults')}</li>
          ) : (
            rows.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => (onPick(p), setQ(''))} className="flex w-full items-center gap-3 px-3 py-2 text-start text-sm hover:bg-surface-2">
                  <img src={p.image} alt="" className="size-9 rounded object-cover" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{p.title}</span>
                    <span className="text-xs text-fg-muted">{p.store.name}</span>
                  </span>
                  <span className="font-semibold" dir="ltr">
                    {money(p.price)}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

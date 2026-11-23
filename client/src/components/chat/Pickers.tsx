import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import type { OrderDTO, OrderStatus } from '@souqly/shared';
import { useProductList } from '@/api/catalog';
import { useMyOrdersWithStore } from '@/api/chat';
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge';
import { ProductImage } from '@/components/product/ProductImage';
import { EmptyState, ErrorState, Input, Modal, Skeleton } from '@/components/ui';
import { useDebounced } from '@/hooks/useDebounced';
import { cn } from '@/lib/cn';
import { useLang } from '@/lib/catalog';
import { formatDate, money } from '@/lib/format';
import type { DraftProduct } from './ChatWithSeller';

function ListSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

/** Pick one of the store's products to send as a card. */
export function ProductPicker({
  open,
  onOpenChange,
  storeSlug,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  storeSlug: string;
  onPick: (p: DraftProduct) => void;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const term = useDebounced(q.trim(), 300);
  const list = useProductList(term ? { q: term } : {}, { path: `/stores/${storeSlug}/products`, facets: false, enabled: open });
  const items = list.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={t('chat.pickProduct')} size="md">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('chat.searchProducts')} startIcon={<Search className="size-4" />} />
      <div className="mt-3 max-h-[50dvh] space-y-1.5 overflow-y-auto">
        {list.isPending ? (
          <ListSkeleton />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} compact />
        ) : items.length === 0 ? (
          <EmptyState compact title={t('chat.noProducts')} />
        ) : (
          items.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPick({ id: p.id, title: p.title, slug: p.slug, image: p.image, price: p.flash?.price ?? p.price })}
              className="flex w-full items-center gap-3 rounded-md p-2 text-start hover:bg-surface-2 focus-visible:bg-surface-2"
            >
              <ProductImage src={p.image} alt="" className="size-12 shrink-0 rounded-sm" />
              <span className="line-clamp-2 flex-1 text-sm text-fg">{p.title}</span>
              <span className="latin shrink-0 text-sm font-bold tabular">{money(p.flash?.price ?? p.price)}</span>
            </button>
          ))
        )}
      </div>
    </Modal>
  );
}

/** Pick one of my orders with this store to send as a card. */
export function OrderPicker({
  open,
  onOpenChange,
  storeSlug,
  highlight,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  storeSlug: string;
  highlight?: string;
  onPick: (o: OrderDTO) => void;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const q = useMyOrdersWithStore(storeSlug, open);
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={t('chat.pickOrder')} size="md">
      <div className="max-h-[55dvh] space-y-1.5 overflow-y-auto">
        {q.isPending ? (
          <ListSkeleton />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} compact />
        ) : !q.data.length ? (
          <EmptyState compact title={t('chat.noOrders')} />
        ) : (
          q.data.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => onPick(o)}
              className={cn(
                'flex w-full items-center gap-3 rounded-md border p-3 text-start hover:bg-surface-2',
                o.number === highlight ? 'border-primary bg-primary-50/50' : 'border-transparent',
              )}
            >
              <ProductImage src={o.items[0]?.image ?? ''} alt="" className="size-12 shrink-0 rounded-sm" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-fg">{t('chat.orderN', { n: o.number })}</span>
                <span className="block text-xs text-fg-muted">{formatDate(o.createdAt, lang)}</span>
              </span>
              <span className="flex flex-col items-end gap-1">
                <OrderStatusBadge status={o.status as OrderStatus} />
                <span className="latin text-sm font-bold tabular">{money(o.total)}</span>
              </span>
            </button>
          ))
        )}
      </div>
    </Modal>
  );
}

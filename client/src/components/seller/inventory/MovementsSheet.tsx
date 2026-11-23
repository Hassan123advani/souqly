import { useTranslation } from 'react-i18next';
import { History } from 'lucide-react';
import type { InventoryRow } from '@souqly/shared';
import { useMovements } from '@/api/seller';
import { EmptyState, ErrorState, LoadMore, Sheet, Skeleton } from '@/components/ui';
import { useLang } from '@/lib/catalog';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';

/** Stock movement history for one product (all its variants). */
export function MovementsSheet({ row, onClose }: { row: InventoryRow | null; onClose: () => void }) {
  const { t } = useTranslation();
  const lang = useLang();
  const q = useMovements(row?.productId);
  const items = q.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <Sheet open={!!row} onOpenChange={(o) => !o && onClose()} title={t('seller.inventory.history')}>
      <div className="p-4">
        {row && <p className="mb-3 text-sm font-semibold text-fg">{row.title}</p>}
        {q.error ? (
          <ErrorState compact error={q.error} onRetry={() => void q.refetch()} />
        ) : q.isLoading ? (
          <div className="grid gap-2">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : !items.length ? (
          <EmptyState compact icon={<History />} title={t('seller.inventory.noHistory')} />
        ) : (
          <ol className="grid gap-2">
            {items.map((m) => (
              <li key={m.id} className={cn('rounded-md border border-border p-3', m.variantId === row?.variantId && 'border-primary-200 bg-primary-50/40')}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-fg">{t(`seller.inventory.reasons.${m.reason}`, m.reason)}</span>
                  <span className={cn('text-sm font-extrabold', m.delta > 0 ? 'text-success' : 'text-danger')} dir="ltr">
                    {m.delta > 0 ? `+${m.delta}` : m.delta}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-fg-muted">
                  {formatDateTime(m.createdAt, lang)} · {t('seller.inventory.balance', { n: m.balanceAfter })}
                </p>
                {m.note && <p className="mt-1 text-xs text-fg">{m.note}</p>}
              </li>
            ))}
          </ol>
        )}
        <LoadMore hasMore={!!q.hasNextPage} loading={q.isFetchingNextPage} onLoadMore={() => void q.fetchNextPage()} />
      </div>
    </Sheet>
  );
}

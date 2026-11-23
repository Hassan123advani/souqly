import { useTranslation } from 'react-i18next';
import { ArrowDownLeft, ArrowUpRight, ReceiptText } from 'lucide-react';
import { EmptyState, ErrorState, LoadMore, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useLang } from '@/lib/catalog';
import { formatDateTime } from '@/lib/format';

export type TxRow = { id: string; amount: number; balanceAfter: number; reason: string; createdAt: string };

/** Ledger list used by wallet (money) and coins. `format` renders amounts. */
export function TxList({
  rows,
  format,
  pending,
  error,
  onRetry,
  hasMore,
  loadingMore,
  onMore,
}: {
  rows: TxRow[];
  format: (n: number) => string;
  pending: boolean;
  error: unknown;
  onRetry: () => void;
  hasMore: boolean;
  loadingMore: boolean;
  onMore: () => void;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  if (pending)
    return (
      <div className="space-y-3 p-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  if (error) return <ErrorState error={error} onRetry={onRetry} compact className="m-4" />;
  if (!rows.length) return <EmptyState compact className="m-4" icon={<ReceiptText className="size-6" />} title={t('wallet.noTx')} />;
  return (
    <>
      <ul className="divide-y divide-border">
        {rows.map((r) => {
          const credit = r.amount > 0;
          return (
            <li key={r.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <span className={cn('grid size-9 shrink-0 place-items-center rounded-full', credit ? 'bg-success-soft text-success' : 'bg-surface-2 text-fg-muted')}>
                {credit ? <ArrowDownLeft className="size-4" aria-hidden /> : <ArrowUpRight className="size-4" aria-hidden />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-fg">{t(`wallet.reasons.${r.reason}`, { defaultValue: r.reason.replace(/_/g, ' ') })}</p>
                <p className="text-xs text-fg-muted">{formatDateTime(r.createdAt, lang)}</p>
              </div>
              <div className="text-end">
                <p className={cn('latin text-sm font-bold tabular', credit ? 'text-success' : 'text-fg')}>
                  {credit ? '+' : '−'}
                  {format(Math.abs(r.amount))}
                </p>
                <p className="latin text-[11px] text-fg-subtle tabular">{t('wallet.balanceAfter', { v: format(r.balanceAfter) })}</p>
              </div>
            </li>
          );
        })}
      </ul>
      <LoadMore hasMore={hasMore} loading={loadingMore} onLoadMore={onMore} className="pb-4" />
    </>
  );
}

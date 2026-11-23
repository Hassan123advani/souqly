import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Inbox } from 'lucide-react';
import { Card, EmptyState, ErrorState, LoadMore, Select, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';

export type Column<T> = { key: string; header: ReactNode; cell: (row: T) => ReactNode; className?: string; align?: 'start' | 'end' | 'center' };

type Props<T> = {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onRowClick?: (row: T) => void;
  empty?: { title: string; description?: string; icon?: ReactNode };
  className?: string;
};

/** Dense, sticky-header admin table with skeleton / empty / error states and cursor "load more". */
export function DataTable<T>({ rows, columns, rowKey, isLoading, error, onRetry, hasMore, loadingMore, onLoadMore, onRowClick, empty, className }: Props<T>) {
  const { t } = useTranslation();
  if (error) return <Card><ErrorState error={error} onRetry={onRetry} /></Card>;
  const align = (a?: Column<T>['align']) => (a === 'end' ? 'text-end' : a === 'center' ? 'text-center' : 'text-start');
  return (
    <Card className={cn('overflow-hidden', className)}>
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    'sticky top-0 z-10 border-b border-border bg-surface-2/95 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-fg-muted backdrop-blur',
                    align(c.align),
                    c.className,
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 8 }, (_, i) => (
                  <tr key={i}>
                    {columns.map((c) => (
                      <td key={c.key} className="border-b border-border px-4 py-3.5">
                        <Skeleton className="h-4 w-full max-w-[160px]" />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((r) => (
                  <tr
                    key={rowKey(r)}
                    onClick={onRowClick ? () => onRowClick(r) : undefined}
                    className={cn('transition-colors hover:bg-surface-2/60', onRowClick && 'cursor-pointer')}
                  >
                    {columns.map((c) => (
                      <td key={c.key} className={cn('border-b border-border px-4 py-3 align-middle', align(c.align), c.className)}>
                        {c.cell(r)}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
        {!isLoading && !rows.length && (
          <EmptyState compact icon={empty?.icon ?? <Inbox />} title={empty?.title ?? t('admin.common.empty')} description={empty?.description} />
        )}
      </div>
      {onLoadMore && <LoadMore hasMore={!!hasMore} loading={loadingMore} onLoadMore={onLoadMore} className="border-t border-border py-3" />}
    </Card>
  );
}

/** Select with an "All" entry mapped to `''` (Radix Select forbids empty item values). */
export function FilterSelect({ value, onChange, options, allLabel, className, label }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; allLabel: string; className?: string; label?: string }) {
  return (
    <div className={cn('w-44', className)} aria-label={label}>
      <Select value={value || '__all'} onValueChange={(v) => onChange(v === '__all' ? '' : v)} options={[{ value: '__all', label: allLabel }, ...options]} />
    </div>
  );
}

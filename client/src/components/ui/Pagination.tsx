import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { Button } from './Button';

/** Page-number pagination (used by admin tables). */
export function Pagination({
  page,
  pageCount,
  onPageChange,
  className,
}: {
  page: number;
  pageCount: number;
  onPageChange: (p: number) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  if (pageCount <= 1) return null;
  const pages: (number | '…')[] = [];
  for (let i = 1; i <= pageCount; i++) {
    if (i === 1 || i === pageCount || Math.abs(i - page) <= 1) pages.push(i);
    else if (pages[pages.length - 1] !== '…') pages.push('…');
  }
  return (
    <nav aria-label={t('pagination.label')} className={cn('flex items-center justify-center gap-1', className)}>
      <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label={t('pagination.prev')}>
        <ChevronLeft className="flip-rtl size-4" />
      </Button>
      {pages.map((p, i) =>
        p === '…' ? (
          <span key={`e${i}`} className="px-2 text-fg-subtle">
            …
          </span>
        ) : (
          <Button
            key={p}
            size="sm"
            variant={p === page ? 'primary' : 'ghost'}
            aria-current={p === page ? 'page' : undefined}
            onClick={() => onPageChange(p)}
            className="latin min-w-9 tabular"
          >
            {p}
          </Button>
        ),
      )}
      <Button variant="ghost" size="sm" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)} aria-label={t('pagination.next')}>
        <ChevronRight className="flip-rtl size-4" />
      </Button>
    </nav>
  );
}

/** Cursor-pagination "Load more" (matches the API's `meta.nextCursor`). */
export function LoadMore({
  hasMore,
  loading,
  onLoadMore,
  className,
}: {
  hasMore: boolean;
  loading?: boolean;
  onLoadMore: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  if (!hasMore) return null;
  return (
    <div className={cn('flex justify-center py-6', className)}>
      <Button variant="outline" loading={loading} onClick={onLoadMore}>
        {t('pagination.loadMore')}
      </Button>
    </div>
  );
}

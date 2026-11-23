import { useTranslation } from 'react-i18next';
import { Activity } from 'lucide-react';
import { useActivity } from '@/api/seller';
import { EmptyState, ErrorState, LoadMore, Skeleton } from '@/components/ui';
import { useLang } from '@/lib/catalog';
import { formatDateTime } from '@/lib/format';

/** Store-scoped audit log (cursor paginated). Action codes are shown humanised when no translation exists. */
export function ActivityTab() {
  const { t } = useTranslation();
  const lang = useLang();
  const q = useActivity();
  const items = q.data?.pages.flatMap((p) => p.data) ?? [];
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (q.isLoading) return <Skeleton className="h-40" />;
  if (!items.length) return <EmptyState compact icon={<Activity />} title={t('seller.activity.empty')} />;
  return (
    <>
      <ol className="divide-y divide-border">
        {items.map((a) => (
          <li key={a.id} className="flex items-start gap-3 py-3">
            <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-fg">
                <span className="font-semibold">{a.actor?.name ?? t('seller.activity.system')}</span>{' '}
                {t(`seller.activity.actions.${a.action.replace(/\./g, '_')}`, a.action.replace(/[._]/g, ' '))}
              </p>
              <p className="text-xs text-fg-muted">{formatDateTime(a.createdAt, lang)}</p>
            </div>
          </li>
        ))}
      </ol>
      <LoadMore hasMore={!!q.hasNextPage} loading={q.isFetchingNextPage} onLoadMore={() => void q.fetchNextPage()} />
    </>
  );
}

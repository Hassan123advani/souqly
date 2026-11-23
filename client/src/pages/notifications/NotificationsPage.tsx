import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Bell, CheckCheck, Trash2 } from 'lucide-react';
import type { NotificationDTO } from '@souqly/shared';
import { getErrorMessage } from '@/api/client';
import { useDeleteNotification, useMarkAllRead, useMarkRead, useNotifications, useUnreadCount } from '@/api/notifications';
import { Button, Card, EmptyState, ErrorState, IconButton, Skeleton } from '@/components/ui';
import { Seo } from '@/components/layout/Seo';
import { NotificationRow, safeLink } from '@/components/notifications/NotificationItem';
import { PillTabs } from '@/components/returns/PillTabs';

type Filter = 'all' | 'unread';

export default function NotificationsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const q = useNotifications({ unread: filter === 'unread' });
  const { data: unread = 0 } = useUnreadCount();
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const remove = useDeleteNotification();
  const rows = q.data?.pages.flatMap((p) => p.data) ?? [];

  function open(n: NotificationDTO) {
    if (!n.readAt) markRead.mutate(n.id);
    const link = safeLink(n.link);
    if (link) navigate(link);
  }

  return (
    <div className="space-y-4">
      <Seo title={t('notifications.title')} noindex />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-extrabold tracking-tight text-fg">{t('notifications.title')}</h2>
        <Button
          size="sm"
          variant="outline"
          leftIcon={<CheckCheck className="size-4" />}
          disabled={!unread}
          loading={markAll.isPending}
          onClick={() => markAll.mutate(undefined, { onSuccess: () => toast.success(t('notifications.allRead')), onError: (e) => toast.error(getErrorMessage(e)) })}
        >
          {t('notifications.markAll')}
        </Button>
      </div>
      <PillTabs<Filter>
        label={t('notifications.title')}
        value={filter}
        onChange={setFilter}
        tabs={[
          { key: 'all', label: t('notifications.filterAll') },
          { key: 'unread', label: t('notifications.filterUnread'), count: unread },
        ]}
      />
      <Card className="overflow-hidden">
        {q.isPending ? (
          <div className="space-y-3 p-4" aria-busy>
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-md" />
            ))}
          </div>
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : !rows.length ? (
          <EmptyState icon={<Bell />} title={filter === 'unread' ? t('notifications.emptyUnread') : t('notifications.empty')} description={t('notifications.emptyBody')} />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((n) => (
              <li key={n.id} className={n.readAt ? '' : 'bg-primary-50/40 dark:bg-primary-950/20'}>
                <div className="flex items-start gap-2 px-4 py-3">
                  <button type="button" className="min-w-0 flex-1 rounded-md text-start focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" onClick={() => open(n)}>
                    <NotificationRow n={n} />
                  </button>
                  <IconButton
                    size="sm"
                    label={t('notifications.delete')}
                    disabled={remove.isPending && remove.variables === n.id}
                    onClick={() => remove.mutate(n.id, { onError: (e) => toast.error(getErrorMessage(e)) })}
                  >
                    <Trash2 className="size-4" />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {q.hasNextPage && (
        <div className="flex justify-center">
          <Button variant="outline" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
            {t('notifications.loadMore')}
          </Button>
        </div>
      )}
    </div>
  );
}

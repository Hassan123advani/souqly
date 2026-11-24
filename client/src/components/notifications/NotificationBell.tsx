import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Bell, CheckCheck } from 'lucide-react';
import type { NotificationDTO } from '@souqly/shared';
import { useMe } from '@/api/auth';
import { useRealtime } from '@/api/config';
import { useIngestNotification, useMarkAllRead, useMarkRead, useNotifications, useUnreadCount } from '@/api/notifications';
import { getErrorMessage } from '@/api/client';
import {
  Button,
  CountBadge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  ErrorState,
  IconButton,
  Skeleton,
} from '@/components/ui';
import { acquireSocket, releaseSocket } from '@/lib/socket';
import { NotificationRow, safeLink } from './NotificationItem';

/** Socket listener: new notifications update the badge/lists and show a toast. */
function LiveNotifications() {
  const { t } = useTranslation();
  const ingest = useIngestNotification();
  const navigate = useNavigate();
  useEffect(() => {
    const s = acquireSocket();
    const onNew = (n: NotificationDTO) => {
      ingest(n);
      const link = safeLink(n.link);
      toast(n.title, {
        description: n.body,
        action: link ? { label: t('notifications.view'), onClick: () => navigate(link) } : undefined,
      });
    };
    s.on('notification:new', onNew);
    return () => {
      s.off('notification:new', onNew);
      releaseSocket();
    };
  }, [ingest, navigate, t]);
  return null;
}

/** Polling fallback (no realtime): when the polled unread count rises, refresh the cached lists. */
function PolledNotifications({ count }: { count: number }) {
  const qc = useQueryClient();
  const prev = useRef(count);
  useEffect(() => {
    if (count > prev.current) void qc.invalidateQueries({ queryKey: ['notifications', 'list'] });
    prev.current = count;
  }, [count, qc]);
  return null;
}

/** Header bell: unread badge + dropdown with the latest 8 notifications. */
export function NotificationBell() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const [open, setOpen] = useState(false);
  const { data: count = 0 } = useUnreadCount();
  const { live, poll } = useRealtime();
  const list = useNotifications({ limit: 8, enabled: open && !!me });
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const navigate = useNavigate();
  if (!me) return null;
  const rows = list.data?.pages[0]?.data ?? [];

  function openOne(n: NotificationDTO) {
    if (!n.readAt) markRead.mutate(n.id);
    const link = safeLink(n.link);
    if (link) navigate(link);
  }

  return (
    <>
      {live && <LiveNotifications />}
      {poll && <PolledNotifications count={count} />}
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <span className="relative inline-flex">
          <DropdownMenuTrigger asChild>
            <IconButton label={count ? t('notifications.bellUnread', { count }) : t('notifications.title')}>
              <Bell className="size-[18px]" />
            </IconButton>
          </DropdownMenuTrigger>
          <CountBadge count={count > 99 ? 99 : count} />
        </span>
        <DropdownMenuContent className="w-[min(92vw,380px)] p-0">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <p className="text-sm font-bold text-fg">{t('notifications.title')}</p>
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<CheckCheck className="size-4" />}
              disabled={!count}
              loading={markAll.isPending}
              onClick={() => markAll.mutate(undefined, { onError: (e) => toast.error(getErrorMessage(e)) })}
            >
              {t('notifications.markAll')}
            </Button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto p-1.5">
            {list.isPending ? (
              <div className="space-y-2 p-2" aria-busy>
                {Array.from({ length: 3 }, (_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-md" />
                ))}
              </div>
            ) : list.isError ? (
              <ErrorState compact error={list.error} onRetry={() => void list.refetch()} />
            ) : rows.length === 0 ? (
              <EmptyState compact icon={<Bell />} title={t('notifications.empty')} description={t('notifications.emptyBody')} />
            ) : (
              rows.map((n) => (
                <DropdownMenuItem key={n.id} onSelect={() => openOne(n)} className="items-start [&_svg]:text-primary-700">
                  <NotificationRow n={n} compact />
                </DropdownMenuItem>
              ))
            )}
          </div>
          <DropdownMenuSeparator className="mx-0 my-0" />
          <Link to="/account/notifications" className="block px-4 py-3 text-center text-sm font-semibold text-primary-700 hover:bg-surface-2" onClick={() => setOpen(false)}>
            {t('notifications.viewAll')}
          </Link>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

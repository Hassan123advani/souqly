import { useCallback } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import type { NotificationDTO } from '@souqly/shared';
import { api, del, get, post } from './client';
import { useMe } from './auth';
import { useRealtime } from './config';

type Page = { data: NotificationDTO[]; meta?: { nextCursor: string | null } };

export const notificationKeys = {
  all: ['notifications'] as const,
  count: ['notifications', 'count'] as const,
  list: (unread: boolean, limit: number) => ['notifications', 'list', unread ? 'unread' : 'all', limit] as const,
};

export function useUnreadCount() {
  const { data: me } = useMe();
  const { poll } = useRealtime();
  return useQuery({
    queryKey: notificationKeys.count,
    queryFn: () => get<{ count: number }>('/notifications/unread-count'),
    enabled: !!me,
    // Socket pushes new rows, so this is only a safety net; without realtime it is the update path.
    refetchInterval: poll ? 30_000 : 120_000,
    select: (d) => d.count,
  });
}

export function useNotifications({ unread = false, limit = 20, enabled = true }: { unread?: boolean; limit?: number; enabled?: boolean } = {}) {
  return useInfiniteQuery({
    queryKey: notificationKeys.list(unread, limit),
    queryFn: async ({ pageParam }) => {
      const res = await api.get<Page>('/notifications', {
        params: { limit, ...(unread ? { unread: 1 } : {}), ...(pageParam ? { cursor: pageParam } : {}) },
      });
      return res.data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
    enabled,
  });
}

/** Patches every cached notification list in place (no refetch flicker). */
function patchLists(qc: ReturnType<typeof useQueryClient>, fn: (rows: NotificationDTO[]) => NotificationDTO[]) {
  qc.setQueriesData<InfiniteData<Page>>({ queryKey: ['notifications', 'list'] }, (old) =>
    old ? { ...old, pages: old.pages.map((p) => ({ ...p, data: fn(p.data) })) } : old,
  );
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => post<NotificationDTO>(`/notifications/${id}/read`),
    onSuccess: (n) => {
      patchLists(qc, (rows) => rows.map((r) => (r.id === n.id ? n : r)));
      void qc.invalidateQueries({ queryKey: notificationKeys.count });
    },
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => post<{ updated: number }>('/notifications/read-all'),
    onSuccess: () => {
      const now = new Date().toISOString();
      patchLists(qc, (rows) => rows.map((r) => (r.readAt ? r : { ...r, readAt: now })));
      qc.setQueryData(notificationKeys.count, { count: 0 });
      void qc.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useDeleteNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => del(`/notifications/${id}`),
    onSuccess: (_v, id) => {
      patchLists(qc, (rows) => rows.filter((r) => r.id !== id));
      void qc.invalidateQueries({ queryKey: notificationKeys.count });
    },
  });
}

/** Called by the socket listener: prepend to cached lists and bump the badge. */
export function useIngestNotification() {
  const qc = useQueryClient();
  return useCallback((n: NotificationDTO) => {
    qc.setQueriesData<InfiniteData<Page>>({ queryKey: ['notifications', 'list'] }, (old) => {
      if (!old?.pages.length || old.pages[0]!.data.some((r) => r.id === n.id)) return old;
      const [first, ...rest] = old.pages;
      return { ...old, pages: [{ ...first!, data: [n, ...first!.data] }, ...rest] };
    });
    qc.setQueryData<{ count: number }>(notificationKeys.count, (old) => ({ count: (old?.count ?? 0) + 1 }));
  }, [qc]);
}

// ---- Web push ----
export type PushSubscriptionBody = { endpoint: string; keys: { p256dh: string; auth: string }; expirationTime?: number | null };

export function savePushSubscription(body: PushSubscriptionBody) {
  return post<unknown>('/push/subscriptions', body);
}
export function deletePushSubscription(endpoint: string) {
  return del('/push/subscriptions', { data: { endpoint } });
}

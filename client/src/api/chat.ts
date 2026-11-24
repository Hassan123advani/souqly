import { useEffect, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import type { ConversationDTO, MessageCreateInput, MessageDTO, OrderDTO } from '@souqly/shared';
import { useActiveStoreId } from '@/components/seller/useActiveStore';
import { acquireSocket, releaseSocket } from '@/lib/socket';
import { useMe } from './auth';
import { api } from './client';
import { useRealtime } from './config';
import { flatPages, getPage, nextCursor, storeCfg, type Page } from './social';

/** `buyer` = my conversations with stores; `store` = the Seller Center inbox of the active store. */
export type ChatSide = 'buyer' | 'store';

function useScope(side: ChatSide) {
  const sid = useActiveStoreId();
  const storeId = side === 'store' ? sid : undefined;
  return {
    base: side === 'store' ? '/seller/chat' : '/chat',
    cfg: storeCfg(storeId),
    key: side === 'store' ? (['chat', 'store', storeId] as const) : (['chat', 'buyer'] as const),
    ready: side === 'buyer' || !!storeId,
  };
}

/** Polling cadences used when realtime (Socket.io) is unavailable. */
const POLL_MESSAGES_MS = 4_000;
const POLL_LIST_MS = 15_000;
const POLL_UNREAD_MS = 30_000;

export const chatKeys = {
  all: ['chat'] as const,
  buyerUnread: ['chat', 'buyer', 'unread'] as const,
};

export function useConversations(side: ChatSide) {
  const s = useScope(side);
  const { poll } = useRealtime();
  return useInfiniteQuery({
    queryKey: [...s.key, 'list'],
    queryFn: ({ pageParam }) => getPage<ConversationDTO>(`${s.base}/conversations`, { cursor: pageParam, limit: 30 }, s.cfg),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    enabled: s.ready,
    refetchInterval: poll ? POLL_LIST_MS : false,
  });
}

/** One conversation (thread header). The cached list row, when present, is shown while it loads. */
export function useConversation(side: ChatSide, convId: string | undefined, placeholder?: ConversationDTO) {
  const s = useScope(side);
  return useQuery({
    queryKey: [...s.key, 'conversation', convId],
    queryFn: async () => (await api.get<{ data: ConversationDTO }>(`${s.base}/conversations/${convId}`, s.cfg)).data.data,
    enabled: s.ready && !!convId,
    placeholderData: placeholder,
    staleTime: 60_000,
  });
}

export function useMessages(side: ChatSide, convId: string | undefined) {
  const s = useScope(side);
  const { poll } = useRealtime();
  return useInfiniteQuery({
    queryKey: [...s.key, 'messages', convId],
    // Pages come newest-first; the thread reverses them for display.
    queryFn: ({ pageParam }) => getPage<MessageDTO>(`${s.base}/conversations/${convId}/messages`, { cursor: pageParam, limit: 30 }, s.cfg),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    enabled: s.ready && !!convId,
    // Without a socket, poll while the thread is open (the observer unmounts when it closes).
    refetchInterval: poll ? POLL_MESSAGES_MS : false,
  });
}

function upsertMessage(qc: QueryClient, key: readonly unknown[], msg: MessageDTO) {
  qc.setQueryData<InfiniteData<Page<MessageDTO>>>(key, (d) => {
    if (!d?.pages.length) return d;
    if (d.pages.some((p) => p.data.some((m) => m.id === msg.id))) return d;
    const [first, ...rest] = d.pages;
    return { ...d, pages: [{ ...first!, data: [msg, ...first!.data] }, ...rest] };
  });
}

export function useSendMessage(side: ChatSide, convId: string) {
  const s = useScope(side);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: MessageCreateInput) =>
      (await api.post<{ data: MessageDTO }>(`${s.base}/conversations/${convId}/messages`, body, s.cfg)).data.data,
    onSuccess: (msg) => {
      upsertMessage(qc, [...s.key, 'messages', convId], msg);
      void qc.invalidateQueries({ queryKey: [...s.key, 'list'] });
    },
  });
}

export function useMarkRead(side: ChatSide) {
  const s = useScope(side);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (convId: string) => api.post(`${s.base}/conversations/${convId}/read`, undefined, s.cfg),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...s.key, 'list'] });
      void qc.invalidateQueries({ queryKey: [...s.key, 'unread'] });
    },
  });
}

export function useStartConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { storeSlug: string; productId?: string }) =>
      (await api.post<{ data: ConversationDTO }>('/chat/conversations', body)).data.data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['chat', 'buyer', 'list'] }),
  });
}

export function useQuickReplies(enabled: boolean) {
  const s = useScope('store');
  return useQuery({
    queryKey: [...s.key, 'quick-replies'],
    queryFn: async () => (await api.get<{ data: string[] }>('/seller/chat/quick-replies', s.cfg)).data.data,
    enabled: enabled && s.ready,
    staleTime: 5 * 60_000,
  });
}

/** Unread conversations count for a side; refreshed live by `chat:conversation` socket events (polled without realtime). */
export function useChatUnread(side: ChatSide, allowed = true) {
  const { data: me } = useMe();
  const s = useScope(side);
  const qc = useQueryClient();
  const { live, poll } = useRealtime();
  const enabled = allowed && !!me && s.ready;
  const q = useQuery({
    queryKey: [...s.key, 'unread'],
    queryFn: async () => (await api.get<{ data: { unread: number } }>(`${s.base}/unread`, s.cfg)).data.data.unread,
    enabled,
    staleTime: poll ? POLL_UNREAD_MS / 2 : 60_000,
    refetchInterval: poll ? POLL_UNREAD_MS : false,
  });
  useEffect(() => {
    if (!enabled || !live) return;
    const socket = acquireSocket();
    const onConv = () => {
      void qc.invalidateQueries({ queryKey: [...s.key, 'unread'] });
      void qc.invalidateQueries({ queryKey: [...s.key, 'list'] });
    };
    socket.on('chat:conversation', onConv);
    return () => {
      socket.off('chat:conversation', onConv);
      releaseSocket();
    };
  }, [enabled, live, qc, s.key.join('/')]);
  return q.data ?? 0;
}

/**
 * Live thread: joins `conv:{id}`, merges `chat:message` into the cache, tracks the other side's
 * typing indicator and read receipts. Returns `{ otherTyping, setTyping }`.
 * Without realtime, `useMessages` polls instead: `onIncoming` fires for messages from the other
 * side that appear after the thread opened, and typing is never shown or sent.
 */
export function useChatRoom(side: ChatSide, convId: string | undefined, onIncoming?: (m: MessageDTO) => void) {
  const s = useScope(side);
  const qc = useQueryClient();
  const { live, poll } = useRealtime();
  const [otherTyping, setOtherTyping] = useState(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout>>();
  const sentTyping = useRef<{ on: boolean; at: number }>({ on: false, at: 0 });
  const socketRef = useRef<ReturnType<typeof acquireSocket> | null>(null);
  const incoming = useRef(onIncoming);
  incoming.current = onIncoming;
  const keyStr = s.key.join('/');

  // Polling mode: detect newly arrived messages from the other side (same query, no extra fetch).
  const polled = useMessages(side, poll ? convId : undefined);
  const newestPolled = polled.data?.pages[0]?.data[0];
  const seenNewest = useRef<{ convId: string; id: string } | null>(null);
  useEffect(() => {
    if (!poll || !convId || !newestPolled) return;
    const prev = seenNewest.current;
    seenNewest.current = { convId, id: newestPolled.id };
    // The first page of a thread is history, not an incoming message.
    if (!prev || prev.convId !== convId || prev.id === newestPolled.id) return;
    if (newestPolled.senderSide !== side) incoming.current?.(newestPolled);
  }, [poll, convId, side, newestPolled]);

  useEffect(() => {
    if (!convId || !s.ready || !live) return;
    const socket = acquireSocket();
    socketRef.current = socket;
    const msgKey = [...s.key, 'messages', convId];
    const join = () => socket.emit('chat:join', { conversationId: convId });
    join();
    socket.on('connect', join);
    const onMessage = (m: MessageDTO) => {
      if (m.conversationId !== convId) return;
      upsertMessage(qc, msgKey, m);
      if (m.senderSide !== side) {
        setOtherTyping(false);
        incoming.current?.(m);
      }
    };
    const onTyping = (p: { conversationId: string; side: ChatSide; typing: boolean }) => {
      if (p.conversationId !== convId || p.side === side) return;
      setOtherTyping(p.typing);
      clearTimeout(typingTimer.current);
      if (p.typing) typingTimer.current = setTimeout(() => setOtherTyping(false), 6000);
    };
    const onRead = (p: { conversationId: string; side: ChatSide; at: string }) => {
      if (p.conversationId !== convId || p.side === side) return;
      qc.setQueryData<InfiniteData<Page<MessageDTO>>>(msgKey, (d) =>
        d ? { ...d, pages: d.pages.map((pg) => ({ ...pg, data: pg.data.map((m) => (m.senderSide === side && !m.readAt ? { ...m, readAt: p.at } : m)) })) } : d,
      );
    };
    socket.on('chat:message', onMessage);
    socket.on('chat:typing', onTyping);
    socket.on('chat:read', onRead);
    return () => {
      socket.emit('chat:leave', { conversationId: convId });
      socket.off('connect', join);
      socket.off('chat:message', onMessage);
      socket.off('chat:typing', onTyping);
      socket.off('chat:read', onRead);
      clearTimeout(typingTimer.current);
      setOtherTyping(false);
      socketRef.current = null;
      releaseSocket();
    };
  }, [convId, side, keyStr, s.ready, live, qc]);

  /** Throttled: "typing" at most every 2s, "stopped" once. */
  const setTyping = (typing: boolean) => {
    const sock = socketRef.current;
    if (!sock || !convId) return;
    const now = Date.now();
    const st = sentTyping.current;
    if (typing && st.on && now - st.at < 2000) return;
    if (!typing && !st.on) return;
    sentTyping.current = { on: typing, at: now };
    sock.emit('chat:typing', { conversationId: convId, typing });
  };

  return { otherTyping, setTyping };
}

/** Lightweight order row for the order-card picker. */
export type PickerOrder = { id: string; number: string; status: string; total: number; image?: string; createdAt: string };

/**
 * Orders between this conversation's buyer and store, newest first (max 50).
 * Buyer: `GET /orders?store=<id>`; store: `GET /seller/chat/conversations/:id/orders`.
 */
export function useConversationOrders(side: ChatSide, convId: string, storeId: string | undefined, enabled: boolean) {
  const s = useScope(side);
  return useQuery({
    queryKey: [...s.key, 'conversation', convId, 'orders'],
    queryFn: async (): Promise<PickerOrder[]> => {
      if (side === 'store') return (await api.get<{ data: PickerOrder[] }>(`/seller/chat/conversations/${convId}/orders`, s.cfg)).data.data;
      const page = await getPage<OrderDTO>('/orders', { store: storeId, limit: 50 });
      return page.data.map((o) => ({ id: o.id, number: o.number, status: o.status, total: o.total, image: o.items[0]?.image, createdAt: o.createdAt }));
    },
    enabled: enabled && s.ready && (side === 'store' || !!storeId),
    staleTime: 60_000,
  });
}

export { flatPages };

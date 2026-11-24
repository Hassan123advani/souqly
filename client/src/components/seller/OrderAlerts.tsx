import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { PERMISSIONS, type OrderDTO } from '@souqly/shared';
import { useMe } from '@/api/auth';
import { api } from '@/api/client';
import { useRealtime } from '@/api/config';
import { useSellerSettings } from '@/api/seller';
import { acquireSocket, playChime, releaseSocket } from '@/lib/socket';
import { money } from '@/lib/format';
import { useActiveStore, useActiveStoreId } from './useActiveStore';
import { useCan } from './usePermissions';
import { useSellerPrefs } from './useSellerPrefs';

type OrderEvent = { storeId?: string; order?: { storeId?: string } };
type NewOrder = OrderEvent & { id: string; number: string; total: number; itemCount: number; createdAt: string };

/** Store the event belongs to (newer servers send `storeId`; older ones only nest it). */
const eventStoreId = (p: OrderEvent | undefined) => p?.storeId ?? p?.order?.storeId;

/** The store's saved `newOrderSound` (when this member may read settings) wins over the local mute preference. */
function useOrderSoundSync() {
  const can = useCan();
  const q = useSellerSettings('notifications', can(PERMISSIONS.STORE_SETTINGS_MANAGE));
  const sound = q.data?.newOrderSound;
  useEffect(() => {
    if (typeof sound === 'boolean') useSellerPrefs.getState().setMuted(!sound);
  }, [sound]);
}

const POLL_MS = 20_000;
/** Order ids already seen per store, kept across remounts so a polled order alerts only once. */
const seenByStore = new Map<string, Set<string>>();

/**
 * Polling fallback (no realtime): fetches the active store's latest orders every ~20 s and alerts
 * for ids not seen before. The first response is only a baseline (existing orders never chime).
 * POS sales are excluded, matching the socket which only announces checkout orders.
 */
function usePolledNewOrders(storeId: string | undefined, enabled: boolean, onNew: (o: NewOrder, storeId: string) => void) {
  const q = useQuery({
    queryKey: ['seller', storeId ?? 'none', 'orders', 'alerts'],
    queryFn: async () =>
      (await api.get<{ data: OrderDTO[] }>('/seller/orders', { params: { limit: 10 }, headers: { 'x-store-id': storeId! } })).data.data,
    enabled: enabled && !!storeId,
    refetchInterval: POLL_MS,
    staleTime: POLL_MS / 2,
  });
  useEffect(() => {
    if (!storeId || !q.data) return;
    const seen = seenByStore.get(storeId);
    const ids = q.data.filter((o) => o.channel !== 'pos');
    if (!seen) {
      seenByStore.set(storeId, new Set(ids.map((o) => o.id)));
      return;
    }
    // Oldest first, so several new orders toast in the order they were placed.
    for (const o of [...ids].reverse()) {
      if (seen.has(o.id)) continue;
      seen.add(o.id);
      onNew({ id: o.id, number: o.number, total: o.total, itemCount: o.items.reduce((a, i) => a + i.qty, 0), createdAt: o.createdAt, storeId }, storeId);
    }
  }, [q.data, storeId, onNew]);
}

/** Listens for live `order:new` / `order:updated` events (or polls without realtime) while the Seller Center is open. */
export function OrderAlerts() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const activeId = useActiveStoreId();
  const navigate = useNavigate();
  const { live, poll } = useRealtime();
  const storeIds = (me?.stores ?? []).map((st) => st.id).join(',');
  useOrderSoundSync();

  const refresh = useCallback(
    (storeId: string) => {
      void qc.invalidateQueries({ queryKey: ['seller', storeId, 'orders'] });
      void qc.invalidateQueries({ queryKey: ['seller', storeId, 'dashboard'] });
    },
    [qc],
  );

  /** Chime (unless muted) + toast with a "View" action, then refresh that store's orders. */
  const announce = useCallback(
    (o: NewOrder, sid: string) => {
      if (!useSellerPrefs.getState().muted) playChime();
      toast.success(t('seller.alerts.newOrder', { number: o.number }), {
        description: t('seller.alerts.newOrderBody', { count: o.itemCount, total: money(o.total) }),
        action: {
          label: t('seller.alerts.view'),
          onClick: () => {
            // The order lives in another store: switch the Seller Center to it first.
            if (sid !== activeId) {
              useActiveStore.getState().setStoreId(sid);
              void qc.invalidateQueries({ queryKey: ['seller'] });
            }
            navigate(`/seller/orders/${o.id}`);
          },
        },
      });
      refresh(sid);
    },
    [t, activeId, qc, navigate, refresh],
  );

  usePolledNewOrders(activeId, poll, announce);

  useEffect(() => {
    if (!live) return;
    const s = acquireSocket();
    const mine = new Set(storeIds ? storeIds.split(',') : []);
    const onUpdated = (p?: OrderEvent) => {
      const sid = eventStoreId(p);
      if (sid && !mine.has(sid)) return;
      if (activeId) refresh(sid ?? activeId);
    };
    const onNew = (o: NewOrder) => {
      const sid = eventStoreId(o) ?? activeId;
      // Only stores this user belongs to (the server should never send others, but stay strict).
      if (!sid || !mine.has(sid)) return;
      announce(o, sid);
    };
    s.on('order:new', onNew);
    s.on('order:updated', onUpdated);
    return () => {
      s.off('order:new', onNew);
      s.off('order:updated', onUpdated);
      releaseSocket();
    };
  }, [live, activeId, storeIds, refresh, announce]);

  return null;
}

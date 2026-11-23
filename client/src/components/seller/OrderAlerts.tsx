import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { PERMISSIONS } from '@souqly/shared';
import { useMe } from '@/api/auth';
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

/** Listens for live `order:new` / `order:updated` events while the Seller Center is open. */
export function OrderAlerts() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const activeId = useActiveStoreId();
  const navigate = useNavigate();
  const storeIds = (me?.stores ?? []).map((st) => st.id).join(',');
  useOrderSoundSync();

  useEffect(() => {
    const s = acquireSocket();
    const mine = new Set(storeIds ? storeIds.split(',') : []);
    const refresh = (storeId: string) => {
      void qc.invalidateQueries({ queryKey: ['seller', storeId, 'orders'] });
      void qc.invalidateQueries({ queryKey: ['seller', storeId, 'dashboard'] });
    };
    const onUpdated = (p?: OrderEvent) => {
      const sid = eventStoreId(p);
      if (sid && !mine.has(sid)) return;
      if (activeId) refresh(sid ?? activeId);
    };
    const onNew = (o: NewOrder) => {
      const sid = eventStoreId(o) ?? activeId;
      // Only stores this user belongs to (the server should never send others, but stay strict).
      if (!sid || !mine.has(sid)) return;
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
    };
    s.on('order:new', onNew);
    s.on('order:updated', onUpdated);
    return () => {
      s.off('order:new', onNew);
      s.off('order:updated', onUpdated);
      releaseSocket();
    };
  }, [qc, activeId, storeIds, t, navigate]);

  return null;
}

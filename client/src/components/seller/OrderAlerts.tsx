import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { PERMISSIONS } from '@souqly/shared';
import { useSellerKey, useSellerSettings } from '@/api/seller';
import { acquireSocket, playChime, releaseSocket } from '@/lib/socket';
import { money } from '@/lib/format';
import { useCan } from './usePermissions';
import { useSellerPrefs } from './useSellerPrefs';

type NewOrder = { id: string; number: string; total: number; itemCount: number; createdAt: string };

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
  const key = useSellerKey();
  const navigate = useNavigate();
  const storeKey = key[1];
  useOrderSoundSync();

  useEffect(() => {
    const s = acquireSocket();
    const refresh = () => {
      void qc.invalidateQueries({ queryKey: ['seller', storeKey, 'orders'] });
      void qc.invalidateQueries({ queryKey: ['seller', storeKey, 'dashboard'] });
    };
    const onNew = (o: NewOrder) => {
      if (!useSellerPrefs.getState().muted) playChime();
      toast.success(t('seller.alerts.newOrder', { number: o.number }), {
        description: t('seller.alerts.newOrderBody', { count: o.itemCount, total: money(o.total) }),
        action: { label: t('seller.alerts.view'), onClick: () => navigate(`/seller/orders/${o.id}`) },
      });
      refresh();
    };
    s.on('order:new', onNew);
    s.on('order:updated', refresh);
    return () => {
      s.off('order:new', onNew);
      s.off('order:updated', refresh);
      releaseSocket();
    };
  }, [qc, storeKey, t, navigate]);

  return null;
}

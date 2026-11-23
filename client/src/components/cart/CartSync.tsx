import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useMe } from '@/api/auth';
import { cartKey, cartUnits, serverAddItem, serverMerge, useServerCart } from '@/api/cart';
import { getErrorMessage } from '@/api/client';
import { registerServerAdder, useCart } from '@/stores/cart';

/**
 * Keeps the cart store in step with the session: on login the guest lines are merged into the
 * server cart once (then removed locally), adds go to the server, and the badge count follows
 * whichever cart is active. Renders nothing.
 */
export function CartSync() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: me, isPending } = useMe();
  const userId = me?.id;
  const mode = useCart((s) => s.mode);
  const setServer = useCart((s) => s.setServer);
  const syncedFor = useRef<string | null>(null);

  useEffect(() => {
    if (isPending) return;
    if (!userId) {
      registerServerAdder(null);
      syncedFor.current = null;
      setServer('guest', 0);
      qc.removeQueries({ queryKey: cartKey });
      return;
    }
    if (syncedFor.current === userId) return;
    syncedFor.current = userId;
    const local = useCart.getState().items;
    void (async () => {
      if (local.length) {
        try {
          await serverMerge(qc, local.map(({ productId, variantId, qty }) => ({ productId, variantId, qty })));
          // Remove only what was merged; anything added meanwhile stays.
          const { remove } = useCart.getState();
          for (const i of local) remove(i.productId, i.variantId);
        } catch (e) {
          toast.error(t('cart.mergeFailed'), { description: getErrorMessage(e) });
        }
      }
      registerServerAdder(async (item) => {
        try {
          await serverAddItem(qc, item);
        } catch (e) {
          toast.error(getErrorMessage(e));
        }
      });
      setServer('server');
    })();
  }, [isPending, userId, qc, setServer, t]);

  const { data: cart } = useServerCart(mode === 'server');
  useEffect(() => {
    if (mode === 'server' && cart) setServer('server', cartUnits(cart));
  }, [cart, mode, setServer]);

  return null;
}

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useMe } from '@/api/auth';
import { cartKey, cartUnits, serverAddItem, serverMerge, useServerCart } from '@/api/cart';
import { getErrorMessage } from '@/api/client';
import { beginMerge, endMerge, registerServerAdder, useCart, type CartItem, type ServerAdder } from '@/stores/cart';

/**
 * Keeps the cart store in step with the session: on login the guest lines are merged into the
 * server cart once (then removed locally), adds go to the server, and the badge count follows
 * whichever cart is active. Adds made during the merge are queued and sent to the server after
 * it; a failed merge is retried once the next time the window regains focus. Renders nothing.
 */
export function CartSync() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: me, isPending } = useMe();
  const userId = me?.id;
  const mode = useCart((s) => s.mode);
  const setServer = useCart((s) => s.setServer);
  const syncedFor = useRef<string | null>(null);
  const cancelRetry = useRef<(() => void) | null>(null);

  useEffect(() => () => cancelRetry.current?.(), []);

  useEffect(() => {
    if (isPending) return;
    if (!userId) {
      cancelRetry.current?.();
      registerServerAdder(null);
      syncedFor.current = null;
      setServer('guest', 0);
      qc.removeQueries({ queryKey: cartKey });
      return;
    }
    if (syncedFor.current === userId) return;
    syncedFor.current = userId;

    /** Merges guest lines into the server cart and removes exactly those lines locally. */
    const merge = async (lines: CartItem[]): Promise<boolean> => {
      try {
        await serverMerge(qc, lines.map(({ productId, variantId, qty }) => ({ productId, variantId, qty })));
        const { remove } = useCart.getState();
        for (const i of lines) remove(i.productId, i.variantId);
        return true;
      } catch (e) {
        toast.error(t('cart.mergeFailed'), { description: getErrorMessage(e) });
        return false;
      }
    };
    const add: ServerAdder = async (item) => {
      try {
        await serverAddItem(qc, item);
      } catch (e) {
        toast.error(getErrorMessage(e));
      }
    };

    const local = useCart.getState().items;
    void (async () => {
      let merged = true;
      if (local.length) {
        beginMerge();
        merged = await merge(local);
      }
      const queued = endMerge();
      // Signed out while merging: stay in guest mode.
      if (syncedFor.current !== userId) return;
      registerServerAdder(add);
      setServer('server');
      for (const item of queued) void add(item);
      if (merged) return;

      const onFocus = () => {
        cancelRetry.current?.();
        const rest = useCart.getState().items;
        if (syncedFor.current === userId && rest.length) void merge(rest);
      };
      cancelRetry.current?.();
      window.addEventListener('focus', onFocus);
      cancelRetry.current = () => {
        window.removeEventListener('focus', onFocus);
        cancelRetry.current = null;
      };
    })();
  }, [isPending, userId, qc, setServer, t]);

  const { data: cart } = useServerCart(mode === 'server');
  useEffect(() => {
    if (mode === 'server' && cart) setServer('server', cartUnits(cart));
  }, [cart, mode, setServer]);

  return null;
}

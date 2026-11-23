import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { BellRing, TrendingDown } from 'lucide-react';
import type { AlertType } from '@souqly/shared';
import { useMe } from '@/api/auth';
import { useAlerts, useToggleAlert } from '@/api/social';
import { socialError } from '@/components/social/errors';
import { useAuthGate } from '@/components/social/useAuthGate';
import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';

/**
 * PDP stock/price alerts: "Notify me" when the selected variant is out of stock, and a price-drop
 * toggle otherwise. Alerts are per product (+ variant when one is selected).
 */
export function AlertToggles({ productId, variantId, outOfStock }: { productId: string; variantId?: string; outOfStock: boolean }) {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const alerts = useAlerts(!!me);
  const toggle = useToggleAlert();
  const gate = useAuthGate();
  const type: AlertType = outOfStock ? 'back_in_stock' : 'price_drop';
  const active = !!alerts.data?.some((a) => a.productId === productId && a.type === type && (a.type === 'price_drop' || !a.variantId || a.variantId === variantId));

  const flip = () =>
    gate(() =>
      toggle.mutate(
        { on: !active, productId, type, ...(type === 'back_in_stock' && variantId ? { variantId } : {}) },
        {
          onSuccess: () => toast.success(t(active ? 'wishlist.alerts.off' : `wishlist.alerts.on_${type}`)),
          onError: (e) => toast.error(socialError(e)),
        },
      ),
    );

  if (outOfStock)
    return (
      <Button block variant={active ? 'outline' : 'secondary'} size="lg" loading={toggle.isPending} onClick={flip} leftIcon={<BellRing className="size-5" />}>
        {active ? t('wishlist.alerts.notifying') : t('wishlist.alerts.notifyMe')}
      </Button>
    );

  return (
    <button
      type="button"
      onClick={flip}
      disabled={toggle.isPending}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-xs font-semibold transition-colors',
        active ? 'border-primary-100 bg-primary-50 text-primary-800' : 'border-border text-fg-muted hover:border-border-strong hover:text-fg',
      )}
    >
      <TrendingDown className="size-3.5" aria-hidden />
      {active ? t('wishlist.alerts.priceOn') : t('wishlist.alerts.priceOff')}
    </button>
  );
}

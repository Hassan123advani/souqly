import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { RotateCcw } from 'lucide-react';
import { useReorder } from '@/api/orders';
import { Button, type ButtonProps } from '@/components/ui';
import { featureError } from '@/components/cart/errors';

/** Adds the order's still-available items back to the cart and offers to open it. */
export function ReorderButton({ number, size = 'md', variant = 'outline' }: { number: string; size?: ButtonProps['size']; variant?: ButtonProps['variant'] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const reorder = useReorder();
  return (
    <Button
      size={size}
      variant={variant}
      leftIcon={<RotateCcw className="size-4" />}
      loading={reorder.isPending}
      onClick={() =>
        reorder.mutate(number, {
          onSuccess: ({ meta }) => {
            if (!meta.added) return void toast.error(t('orders.reorderNone'));
            toast.success(t('orders.reorderAdded', { count: meta.added }), {
              description: meta.skipped ? t('orders.reorderSkipped', { count: meta.skipped }) : undefined,
              action: { label: t('cart.view'), onClick: () => navigate('/cart') },
            });
          },
          onError: (e) => toast.error(featureError(e, 'orders.errors')),
        })
      }
    >
      {t('orders.reorder')}
    </Button>
  );
}

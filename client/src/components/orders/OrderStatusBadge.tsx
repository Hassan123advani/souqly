import { useTranslation } from 'react-i18next';
import type { OrderStatus } from '@souqly/shared';
import { Badge, type BadgeTone } from '@/components/ui';

const TONES: Record<OrderStatus, BadgeTone> = {
  pending_payment: 'warning',
  placed: 'info',
  confirmed: 'info',
  packed: 'primary',
  shipped: 'primary',
  out_for_delivery: 'accent',
  delivered: 'success',
  cancelled: 'danger',
  failed_delivery: 'danger',
  return_requested: 'warning',
  returned: 'neutral',
  refunded: 'neutral',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useTranslation();
  return (
    <Badge size="sm" tone={TONES[status]}>
      {t(`orders.status.${status}`)}
    </Badge>
  );
}

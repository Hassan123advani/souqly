import { useTranslation } from 'react-i18next';
import { Badge, type BadgeTone } from '@/components/ui';

const TONES: Record<string, BadgeTone> = {
  pending_payment: 'neutral',
  placed: 'accent',
  confirmed: 'info',
  packed: 'info',
  shipped: 'primary',
  out_for_delivery: 'primary',
  delivered: 'success',
  cancelled: 'danger',
  failed_delivery: 'danger',
  return_requested: 'warning',
  returned: 'warning',
  refunded: 'neutral',
};

/** Seller Center order status pill. */
export function SellerOrderStatus({ status, className }: { status: string; className?: string }) {
  const { t } = useTranslation();
  return (
    <Badge tone={TONES[status] ?? 'neutral'} size="sm" className={className}>
      {t(`seller.orderStatus.${status}`, status)}
    </Badge>
  );
}

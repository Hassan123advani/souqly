import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, MapPin, Package } from 'lucide-react';
import type { RiderDeliveryDTO } from '@souqly/shared';
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge';
import { cn } from '@/lib/cn';
import { money } from '@/lib/format';

export function DeliveryCard({ d }: { d: RiderDeliveryDTO }) {
  const { t } = useTranslation();
  const live = d.status === 'out_for_delivery';
  return (
    <Link
      to={`/rider/d/${d.orderId}`}
      className={cn(
        'block rounded-lg border bg-surface p-4 shadow-card transition-colors active:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring',
        live ? 'border-primary/50 ring-1 ring-primary/30' : 'border-border',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="latin text-base font-extrabold text-fg" dir="ltr">
          {d.number}
        </span>
        <OrderStatusBadge status={d.status} />
        <ChevronRight className="ms-auto size-5 text-fg-subtle rtl:rotate-180" aria-hidden />
      </div>
      <p className="mt-2 flex items-start gap-1.5 text-sm text-fg">
        <MapPin className="mt-0.5 size-4 shrink-0 text-primary-700" aria-hidden />
        <span className="line-clamp-2">
          <span className="font-semibold">{d.buyer.name}</span> · {[d.address.area, d.address.city].filter(Boolean).join(', ')}
        </span>
      </p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
          <Package className="size-4" aria-hidden />
          {t('rider.itemsCount', { count: d.itemsCount })} · {d.store.name}
        </span>
        {d.codAmount > 0 && d.status !== 'delivered' ? (
          <span className="rounded-pill bg-accent-50 px-2.5 py-1 text-sm font-extrabold text-accent-800" dir="ltr">
            {t('rider.cod')} {money(d.codAmount)}
          </span>
        ) : d.status === 'shipped' || d.status === 'out_for_delivery' ? (
          <span className="rounded-pill bg-success-soft px-2.5 py-1 text-xs font-bold text-success">{t('rider.prepaid')}</span>
        ) : null}
      </div>
    </Link>
  );
}

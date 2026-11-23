import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import type { OrderDTO } from '@souqly/shared';
import { Card } from '@/components/ui';
import { ProductImage } from '@/components/product/ProductImage';
import { StoreHeader } from '@/components/cart/StoreHeader';
import { formatDate, money } from '@/lib/format';
import { useUi } from '@/stores/ui';
import { OrderStatusBadge } from './OrderStatusBadge';

/** One sub-order in "My orders": store, item thumbnails, status, total and actions. */
export function OrderCard({ order: o, actions }: { order: OrderDTO; actions?: ReactNode }) {
  const { t } = useTranslation();
  const lang = useUi((s) => s.language);
  const units = o.items.reduce((n, i) => n + i.qty, 0);
  const first = o.items[0];
  return (
    <Card className="p-4 sm:p-5">
      <StoreHeader store={o.store} trailing={<OrderStatusBadge status={o.status} />} />
      <Link
        to={`/account/orders/${o.number}`}
        className="mt-3 flex items-center gap-3 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
      >
        <div className="flex shrink-0 -space-x-3 rtl:space-x-reverse">
          {o.items.slice(0, 4).map((i, k) => (
            <ProductImage key={k} src={i.image} alt={i.title} className="size-16 rounded-md ring-2 ring-surface" />
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-1 text-sm font-semibold text-fg">{first?.title}</p>
          <p className="mt-0.5 text-xs text-fg-subtle">
            {o.items.length > 1 ? t('orders.andMore', { count: o.items.length - 1 }) : t('orders.itemsN', { count: units })}
          </p>
          <p className="latin mt-0.5 text-xs text-fg-subtle" dir="ltr">
            {o.number}
          </p>
        </div>
      </Link>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p className="text-xs text-fg-muted">
          {formatDate(o.createdAt, lang)} · {t('orders.totalN', { count: units })}{' '}
          <span className="latin text-sm font-extrabold tabular text-fg" dir="ltr">
            {money(o.total)}
          </span>
        </p>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </Card>
  );
}

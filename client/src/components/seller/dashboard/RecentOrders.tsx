import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShoppingBag } from 'lucide-react';
import type { SellerDashboard } from '@souqly/shared';
import { EmptyState } from '@/components/ui';
import { useLang } from '@/lib/catalog';
import { formatRelative, money } from '@/lib/format';
import { SellerOrderStatus } from '../OrderStatusBadge';

export function RecentOrders({ orders }: { orders: SellerDashboard['recentOrders'] }) {
  const { t } = useTranslation();
  const lang = useLang();
  if (!orders.length) return <EmptyState compact icon={<ShoppingBag />} title={t('seller.dash.noOrders')} description={t('seller.dash.noOrdersBody')} />;
  return (
    <ul className="divide-y divide-border">
      {orders.map((o) => (
        <li key={o.id}>
          <Link to={`/seller/orders/${o.id}`} className="flex items-center gap-3 px-1 py-3 hover:bg-surface-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-fg" dir="ltr">
                {o.number}
              </p>
              <p className="text-xs text-fg-muted">
                {t('seller.orders.items', { count: o.itemCount })} · {formatRelative(o.createdAt, lang)}
              </p>
            </div>
            <SellerOrderStatus status={o.status} />
            <span className="w-24 text-end text-sm font-bold text-fg" dir="ltr">
              {money(o.total)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

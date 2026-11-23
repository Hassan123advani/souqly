import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Package } from 'lucide-react';
import { BUYER_ORDER_TABS } from '@souqly/shared';
import { useBuyerOrders, type BuyerOrderTab } from '@/api/orders';
import { Button, Card, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { Seo } from '@/components/layout/Seo';
import { OrderCard } from '@/components/orders/OrderCard';
import { ReorderButton } from '@/components/orders/ReorderButton';
import { cn } from '@/lib/cn';

const TABS = Object.keys(BUYER_ORDER_TABS) as BuyerOrderTab[];

function OrdersSkeleton() {
  return (
    <div className="space-y-4" aria-busy>
      {[0, 1, 2].map((k) => (
        <Card key={k} className="space-y-3 p-5">
          <Skeleton className="h-6 w-44" />
          <div className="flex gap-3">
            <Skeleton className="size-16 rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

export default function OrdersPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') as BuyerOrderTab | null;
  const tab: BuyerOrderTab = raw && TABS.includes(raw) ? raw : 'to_ship';
  const q = useBuyerOrders(tab);
  const counts = q.data?.pages[0]?.meta?.counts;
  const orders = q.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <div className="space-y-4">
      <Seo title={t('orders.title')} noindex />
      <h2 className="text-xl font-extrabold tracking-tight text-fg">{t('orders.title')}</h2>
      <div role="tablist" aria-label={t('orders.title')} className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {TABS.map((k) => {
          const on = k === tab;
          const n = counts?.[k];
          return (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setParams({ tab: k }, { replace: true })}
              className={cn(
                'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-pill border px-3.5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring',
                on ? 'border-primary bg-primary text-primary-fg' : 'border-border bg-surface text-fg-muted hover:text-fg',
              )}
            >
              {t(`orders.tabs.${k}`)}
              {!!n && (
                <span className={cn('latin rounded-pill px-1.5 text-[11px] tabular', on ? 'bg-white/20' : 'bg-surface-2')}>{n}</span>
              )}
            </button>
          );
        })}
      </div>

      <div role="tabpanel">
        {q.isPending ? (
          <OrdersSkeleton />
        ) : q.isError ? (
          <Card>
            <ErrorState error={q.error} onRetry={() => void q.refetch()} />
          </Card>
        ) : !orders.length ? (
          <Card>
            <EmptyState
              icon={<Package />}
              title={t(`orders.empty.${tab}`)}
              description={t('orders.emptyBody')}
              action={<Button to="/">{t('cart.startShopping')}</Button>}
            />
          </Card>
        ) : (
          <div className="space-y-4">
            {orders.map((o) => (
              <OrderCard
                key={o.id}
                order={o}
                actions={
                  <>
                    {(o.status === 'delivered' || o.status === 'cancelled') && <ReorderButton number={o.number} size="sm" />}
                    <Button size="sm" variant={['shipped', 'out_for_delivery'].includes(o.status) ? 'primary' : 'outline'} to={`/account/orders/${o.number}`}>
                      {['shipped', 'out_for_delivery'].includes(o.status) ? t('orders.track') : t('orders.details')}
                    </Button>
                  </>
                }
              />
            ))}
            {q.hasNextPage && (
              <div className="flex justify-center">
                <Button variant="outline" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
                  {t('orders.loadMore')}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { PERMISSIONS, type SellerDashboard } from '@souqly/shared';
import { useMe } from '@/api/auth';
import { useDashboard, useSellerStore } from '@/api/seller';
import { Seo } from '@/components/layout/Seo';
import { Badge, Button, Card, CardHeader, ErrorState, SectionHeader, Skeleton } from '@/components/ui';
import { ChecklistCard } from '@/components/seller/dashboard/ChecklistCard';
import { HealthGauge } from '@/components/seller/dashboard/HealthGauge';
import { KpiCards } from '@/components/seller/dashboard/KpiCards';
import { RecentOrders } from '@/components/seller/dashboard/RecentOrders';
import { SalesChart } from '@/components/seller/dashboard/SalesChart';
import { SellerTour } from '@/components/seller/dashboard/SellerTour';
import { TodoCard } from '@/components/seller/dashboard/TodoCard';
import { cn } from '@/lib/cn';

const RANGES: SellerDashboard['range'][] = ['7d', '30d', '90d'];

export default function SellerHomePage() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const { data: store } = useSellerStore();
  const [range, setRange] = useState<SellerDashboard['range']>('30d');
  const canView = !!store?.myPermissions.includes(PERMISSIONS.STORE_DASHBOARD);
  const dash = useDashboard(range, canView);
  const d = dash.data;

  return (
    <>
      <Seo title={t('nav.sellerCenter')} noindex />
      <SellerTour />
      <SectionHeader
        as="h1"
        eyebrow={store?.name}
        title={t('seller.home.greeting', { name: me?.name.split(' ')[0] ?? '' })}
        description={t('seller.dash.subtitle')}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {store && <Badge tone={store.status === 'approved' ? 'success' : 'warning'}>{t(`storeStatus.${store.status}`, store.status)}</Badge>}
            {store?.myPermissions.includes(PERMISSIONS.STORE_PRODUCTS_MANAGE) && (
              <Button to="/seller/products/new" size="sm" leftIcon={<Plus className="size-4" />}>
                {t('seller.products.add')}
              </Button>
            )}
          </div>
        }
      />
      <div className="grid gap-5">
        {store && <ChecklistCard checklist={store.checklist} />}
        {!canView ? null : dash.error ? (
          <ErrorState error={dash.error} onRetry={() => void dash.refetch()} />
        ) : !d ? (
          <DashboardSkeleton />
        ) : (
          <>
            <KpiCards kpis={d.kpis} />
            <div className="grid gap-5 xl:grid-cols-3">
              <Card className={cn('xl:col-span-2', dash.isFetching && 'opacity-70 transition-opacity')}>
                <CardHeader
                  title={t('seller.dash.performance')}
                  action={
                    <div className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label={t('seller.dash.range')}>
                      {RANGES.map((r) => (
                        <button
                          key={r}
                          type="button"
                          aria-pressed={range === r}
                          onClick={() => setRange(r)}
                          className={cn('h-8 rounded px-3 text-xs font-semibold', range === r ? 'bg-surface-2 text-fg' : 'text-fg-muted hover:text-fg')}
                        >
                          {t(`seller.dash.ranges.${r}`)}
                        </button>
                      ))}
                    </div>
                  }
                />
                <div className="p-4 sm:p-5">
                  <SalesChart series={d.salesSeries} />
                </div>
              </Card>
              <Card>
                <CardHeader title={t('seller.dash.todoTitle')} />
                <div className="px-4 py-2">
                  <TodoCard todo={d.todo} />
                </div>
              </Card>
            </div>
            <div className="grid gap-5 xl:grid-cols-3">
              <Card className="xl:col-span-2">
                <CardHeader
                  title={t('seller.dash.recentOrders')}
                  action={
                    <Button to="/seller/orders" size="sm" variant="ghost">
                      {t('seller.common.viewAll')}
                    </Button>
                  }
                />
                <div className="px-4 py-1">
                  <RecentOrders orders={d.recentOrders} />
                </div>
              </Card>
              <Card>
                <CardHeader title={t('seller.dash.health')} description={t('seller.dash.healthHint')} />
                <div className="p-5">
                  <HealthGauge health={d.healthScore} />
                </div>
              </Card>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className={cn('h-28', i === 0 && 'col-span-2 lg:col-span-1')} />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <Skeleton className="h-80 xl:col-span-2" />
        <Skeleton className="h-80" />
      </div>
    </>
  );
}

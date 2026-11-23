import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Ban } from 'lucide-react';
import { PERMISSIONS, STORE_ROLES } from '@souqly/shared';
import { useSellerStore } from '@/api/seller';
import { Alert, Card, EmptyState, ErrorState, PageSpinner, SectionHeader } from '@/components/ui';
import { BusinessCard, PayoutCard } from './forms/AccountForms';
import { OrderAlerts } from './OrderAlerts';

/**
 * Wraps every Seller Center page: shows status banners and
 * replaces the pages with a resubmit / suspended screen when the store cannot operate.
 */
export default function SellerFrame() {
  const { t } = useTranslation();
  const { data: store, isLoading, error, refetch } = useSellerStore();

  if (isLoading) return <PageSpinner />;
  if (error || !store) return <ErrorState error={error} onRetry={() => void refetch()} />;

  if (store.status === 'suspended') {
    return (
      <Card>
        <EmptyState icon={<Ban />} title={t('seller.status.suspendedTitle')} description={t('seller.status.suspendedBody')} />
      </Card>
    );
  }

  if (store.status === 'rejected') {
    const isOwner = store.myRole === STORE_ROLES[0];
    return (
      <div className="mx-auto grid max-w-3xl gap-5">
        <SectionHeader as="h1" eyebrow={store.name} title={t('seller.status.rejectedTitle')} description={t('seller.status.rejectedBody')} />
        <Alert tone="danger" title={t('seller.status.reason')}>
          {store.rejectionReason ?? '-'}
        </Alert>
        <BusinessCard store={store} canEdit={isOwner} startOpen={isOwner} />
        <PayoutCard store={store} canEdit={store.myPermissions.includes(PERMISSIONS.STORE_FINANCE_MANAGE)} />
      </div>
    );
  }

  return (
    <>
      {store.myPermissions.includes(PERMISSIONS.STORE_ORDERS_VIEW) && <OrderAlerts />}
      {store.status === 'pending' && (
        <Alert tone="warning" title={t('seller.status.pendingTitle')} className="mb-5">
          {t('seller.status.pendingBody')}
        </Alert>
      )}
      <Outlet />
    </>
  );
}

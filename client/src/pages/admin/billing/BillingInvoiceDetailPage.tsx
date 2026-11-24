import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PERMISSIONS } from '@souqly/shared';
import { useAdminGet } from '@/api/admin';
import type { InvoiceDetail } from '@/api/billing';
import { PageHeader } from '@/components/admin/PageHeader';
import { useAdminCan } from '@/components/admin/useAdminCan';
import { WaiveDialog } from '@/components/billing/AdminBillingDialogs';
import { BillingBadge } from '@/components/billing/BillingBadge';
import { CommissionTable, InvoiceFacts, InvoiceLines, PaymentList } from '@/components/billing/InvoiceView';
import { Alert, Button, Card, CardBody, ErrorState, Skeleton } from '@/components/ui';

export default function BillingInvoiceDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const can = useAdminCan();
  const manage = can(PERMISSIONS.ADMIN_BILLING_MANAGE);
  const q = useAdminGet<InvoiceDetail>(`billing/invoices/${id}`);
  const [waive, setWaive] = useState(false);
  const inv = q.data;
  const crumbs = [{ label: t('admin.nav.finance') }, { label: t('billing.admin.nav.invoices'), to: '/admin/billing/invoices' }];

  if (q.error) {
    return (
      <>
        <PageHeader title={t('billing.admin.nav.invoices')} crumbs={crumbs} />
        <Card>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </Card>
      </>
    );
  }
  if (!inv) {
    return (
      <div className="grid gap-4" aria-busy="true">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  const payable = (inv.status === 'open' || inv.status === 'overdue') && inv.amountDue > 0;

  return (
    <>
      <PageHeader
        title={t('billing.invoice.title', { number: inv.number })}
        description={
          inv.store && (
            <Link to={`/admin/billing/stores/${inv.store.id}`} className="font-semibold text-primary-700 hover:underline">
              {inv.store.name}
            </Link>
          )
        }
        crumbs={crumbs}
        actions={
          <>
            <BillingBadge status={inv.status} />
            {manage && payable && (
              <Button size="sm" variant="outline" onClick={() => setWaive(true)}>
                {t('billing.admin.waive.confirm')}
              </Button>
            )}
          </>
        }
      />
      <div className="grid gap-5">
        {inv.pendingPayment && (
          <Alert
            tone="warning"
            title={t('billing.admin.invoices.pendingPayment')}
            action={
              inv.pendingPayment.method === 'manual' && (
                <Button to="/admin/billing/payments" size="sm" variant="outline" className="shrink-0 self-center">
                  {t('billing.admin.overview.openQueue')}
                </Button>
              )
            }
          >
            {t(`billing.method.${inv.pendingPayment.method}`)}
          </Alert>
        )}
        <Card>
          <CardBody>
            <InvoiceFacts invoice={inv} />
          </CardBody>
        </Card>
        <InvoiceLines invoice={inv} />
        {(inv.commissions.length > 0 || inv.lines.some((l) => l.type === 'commission')) && <CommissionTable entries={inv.commissions} orderHref={(e) => `/admin/orders/${e.orderId}`} />}
        <PaymentList payments={inv.payments} />
      </div>
      {waive && <WaiveDialog invoice={inv} onClose={() => setWaive(false)} />}
    </>
  );
}

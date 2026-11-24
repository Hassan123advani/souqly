import { useTranslation } from 'react-i18next';
import { PERMISSIONS } from '@souqly/shared';
import { useBillingSummary } from '@/api/billing';
import { Alert, Button } from '@/components/ui';
import { useCan } from '@/components/seller/usePermissions';
import { money } from '@/lib/format';

/**
 * Billing suspension of the acting store, read from `GET /seller/billing/summary` (finance viewers only).
 * `undefined` = unknown (loading, or the member cannot view billing — the API still refuses publishes).
 */
export function useBillingSuspension() {
  const can = useCan();
  const view = can(PERMISSIONS.STORE_FINANCE_VIEW);
  const q = useBillingSummary(view);
  if (!view || !q.data) return { suspended: undefined, summary: undefined };
  return { suspended: q.data.subscription.billingStatus === 'suspended', summary: q.data };
}

/** Prominent banner across the Seller Center while the store is suspended for billing. */
export function BillingSuspendedBanner() {
  const { t } = useTranslation();
  const { suspended, summary } = useBillingSuspension();
  if (!suspended || !summary) return null;
  const s = summary.subscription.suspension;
  const due = summary.outstanding.overdue || summary.outstanding.amountDue;
  const to = s?.invoiceId ? `/seller/billing/invoices/${s.invoiceId}` : '/seller/billing/invoices?status=overdue';
  return (
    <Alert
      tone="danger"
      className="mb-5"
      title={t('billing.suspended.title')}
      action={
        <Button to={to} size="sm" variant="danger" className="shrink-0 self-center">
          {t('billing.suspended.payNow')}
        </Button>
      }
    >
      {s?.reason === 'admin' ? t('billing.suspended.adminBody', { note: s.note ?? '—' }) : t('billing.suspended.overdueBody', { amount: money(due) })}
    </Alert>
  );
}

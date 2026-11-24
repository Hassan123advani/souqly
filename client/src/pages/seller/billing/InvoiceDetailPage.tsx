import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowLeft, Download } from 'lucide-react';
import { useInvoice, useInvoicePdf } from '@/api/billing';
import { getErrorMessage } from '@/api/client';
import { BillingBadge } from '@/components/billing/BillingBadge';
import { CommissionTable, InvoiceFacts, InvoiceLines, PaymentList } from '@/components/billing/InvoiceView';
import { PayInvoicePanel } from '@/components/billing/PayInvoicePanel';
import { Button, Card, CardBody, ErrorState, Skeleton } from '@/components/ui';

export default function BillingInvoiceDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const q = useInvoice(id);
  const pdf = useInvoicePdf();
  const inv = q.data;

  const back = (
    <Button to="/seller/billing/invoices" variant="ghost" size="sm" leftIcon={<ArrowLeft className="flip-rtl size-4" />}>
      {t('billing.tabs.invoices')}
    </Button>
  );
  if (q.error) {
    return (
      <>
        {back}
        <Card className="mt-3">
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </Card>
      </>
    );
  }
  if (!inv) {
    return (
      <div className="grid gap-4" aria-busy="true">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-3">
        {back}
        <h2 className="latin min-w-0 flex-1 truncate text-xl font-extrabold text-fg">{t('billing.invoice.title', { number: inv.number })}</h2>
        <BillingBadge status={inv.status} />
        <Button
          variant="outline"
          size="sm"
          leftIcon={<Download className="size-4" />}
          loading={pdf.isPending}
          onClick={() => pdf.mutate({ id: inv.id, number: inv.number }, { onError: (e) => toast.error(getErrorMessage(e)) })}
        >
          {t('billing.invoice.pdf')}
        </Button>
      </div>
      <PayInvoicePanel invoice={inv} />
      <Card>
        <CardBody>
          <InvoiceFacts invoice={inv} />
        </CardBody>
      </Card>
      <InvoiceLines invoice={inv} />
      {(inv.commissions.length > 0 || inv.lines.some((l) => l.type === 'commission')) && (
        <CommissionTable entries={inv.commissions} orderHref={(e) => `/seller/orders/${e.orderId}`} />
      )}
      <PaymentList payments={inv.payments} />
    </div>
  );
}

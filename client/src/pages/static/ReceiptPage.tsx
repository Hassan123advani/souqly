import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Printer, ReceiptText } from 'lucide-react';
import { getErrorStatus } from '@/api/client';
import { usePublicReceipt } from '@/api/growth';
import { Logo } from '@/components/brand/Logo';
import { Seo } from '@/components/layout/Seo';
import { Button, Card, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { ReceiptPaper } from '@/components/seller/pos/ReceiptPaper';

/** Public digital receipt for in-store (POS) sales: `/r/:token` (signed token, items + totals only). */
export default function ReceiptPage() {
  const { t } = useTranslation();
  const { token } = useParams();
  const q = usePublicReceipt(token);
  return (
    <main className="min-h-dvh bg-bg px-4 py-8">
      <Seo title={t('growth.pos.receipt.publicTitle')} noindex />
      <style>{'@media print { .no-print { display: none !important; } body { background: #fff; } }'}</style>
      <div className="mx-auto grid max-w-md gap-4">
        <div className="no-print flex items-center justify-between">
          <Logo />
          {q.data && (
            <Button size="sm" variant="outline" leftIcon={<Printer className="size-4" />} onClick={() => window.print()}>
              {t('growth.pos.receipt.print')}
            </Button>
          )}
        </div>
        {q.error ? (
          <Card>
            {getErrorStatus(q.error) === 404 ? (
              <EmptyState icon={<ReceiptText />} title={t('growth.pos.receipt.notFound')} description={t('growth.pos.receipt.notFoundBody')} />
            ) : (
              <ErrorState error={q.error} onRetry={() => void q.refetch()} />
            )}
          </Card>
        ) : !q.data ? (
          <Skeleton className="h-[28rem]" />
        ) : (
          <Card className="overflow-hidden py-4">
            <ReceiptPaper r={{ ...q.data, number: q.data.receiptNumber || q.data.number }} width={80} />
          </Card>
        )}
      </div>
    </main>
  );
}

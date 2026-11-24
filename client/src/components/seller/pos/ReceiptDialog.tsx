import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertTriangle, Copy, MessageCircle, Printer } from 'lucide-react';
import { usePosReceipt } from '@/api/growth';
import { Alert, Button, Modal, Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { QueuedSale } from './posDb';
import { ReceiptPaper, type ReceiptData } from './ReceiptPaper';

const PRINT_ID = 'pos-print-receipt';

/** Print only the receipt, at the chosen paper width. */
function printCss(width: 58 | 80) {
  return `@media print {
  body * { visibility: hidden !important; }
  #${PRINT_ID}, #${PRINT_ID} * { visibility: visible !important; }
  #${PRINT_ID} { position: fixed; top: 0; inset-inline-start: 0; width: ${width}mm; margin: 0; }
  @page { size: ${width}mm auto; margin: 0; }
}`;
}

export function ReceiptDialog({ sale, onClose }: { sale: QueuedSale | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [width, setWidth] = useState<58 | 80>(() => (localStorage.getItem('souqly-pos-paper') === '58' ? 58 : 80));
  const orderId = sale?.status === 'synced' ? sale.result?.orderId : undefined;
  const server = usePosReceipt(orderId);
  const setPaper = (w: 58 | 80) => {
    setWidth(w);
    localStorage.setItem('souqly-pos-paper', String(w));
  };

  if (!sale) return null;
  const local = sale.receipt;
  const data: ReceiptData = server.data
    ? { ...server.data, number: server.data.receiptNumber || server.data.number }
    : { ...local, number: sale.result?.number ?? local.clientId.slice(0, 8).toUpperCase() };
  const url = server.data?.digitalReceiptUrl;
  const phone = (server.data?.customer?.phone ?? local.customer?.phone ?? '').replace(/[^\d]/g, '');
  const copy = () =>
    url &&
    navigator.clipboard.writeText(url).then(
      () => toast.success(t('common.copied')),
      () => toast.error(t('share.copyFailed')),
    );

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={t('growth.pos.receipt.title')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.close')}
          </Button>
          <Button leftIcon={<Printer className="size-4" />} onClick={() => window.print()}>
            {t('growth.pos.receipt.print')}
          </Button>
        </>
      }
    >
      <style>{printCss(width)}</style>
      <div className="grid gap-3">
        <div className="inline-flex self-start rounded-md border border-border p-0.5" role="group" aria-label={t('growth.pos.receipt.paper')}>
          {([58, 80] as const).map((w) => (
            <button
              key={w}
              type="button"
              aria-pressed={width === w}
              onClick={() => setPaper(w)}
              className={cn('h-8 rounded px-3 text-xs font-semibold', width === w ? 'bg-surface-2 text-fg' : 'text-fg-muted hover:text-fg')}
            >
              {w} mm
            </button>
          ))}
        </div>
        {sale.status === 'pending' && <Alert tone="info">{t('growth.pos.receipt.pending')}</Alert>}
        {sale.status === 'error' && (
          <Alert tone="danger" title={t('growth.pos.receipt.failed')}>
            {sale.result?.error?.message}
          </Alert>
        )}
        {(server.data?.stockConflict || sale.result?.stockConflict) && (
          <Alert tone="warning">
            <span className="inline-flex items-center gap-1">
              <AlertTriangle className="size-4" /> {t('growth.pos.receipt.stockConflict')}
            </span>
          </Alert>
        )}
        <div className="max-h-[50vh] overflow-auto rounded-md border border-border bg-ink-100 py-3">
          {orderId && server.isLoading ? (
            <div className="grid place-items-center p-6">
              <Spinner />
            </div>
          ) : (
            <ReceiptPaper id={PRINT_ID} r={data} width={width} qr={server.data?.qr} />
          )}
        </div>
        {url && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" leftIcon={<Copy className="size-4" />} onClick={() => void copy()}>
              {t('growth.pos.receipt.copyLink')}
            </Button>
            {phone && (
              <Button
                size="sm"
                variant="outline"
                leftIcon={<MessageCircle className="size-4" />}
                href={`https://wa.me/${phone}?text=${encodeURIComponent(t('growth.pos.receipt.whatsapp', { url }))}`}
                target="_blank"
              >
                {t('growth.pos.receipt.sendWhatsapp')}
              </Button>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

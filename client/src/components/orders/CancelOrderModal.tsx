import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useCancelOrder } from '@/api/orders';
import { Button, Modal } from '@/components/ui';
import { featureError } from '@/components/cart/errors';
import { cn } from '@/lib/cn';

const REASONS = ['changed_mind', 'better_price', 'wrong_item', 'delivery_too_long', 'other'] as const;

/** Reason picker + optional details; sends the translated reason text to the API. */
export function CancelOrderModal({ number, open, onOpenChange }: { number: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation();
  const cancel = useCancelOrder(number);
  const [reason, setReason] = useState<(typeof REASONS)[number] | null>(null);
  const [details, setDetails] = useState('');
  const text = reason === 'other' ? details.trim() : reason ? `${t(`orders.cancelReasons.${reason}`)}${details.trim() ? ` — ${details.trim()}` : ''}` : '';
  const valid = text.length >= 3;

  const submit = () =>
    cancel.mutate(text.slice(0, 300), {
      onSuccess: () => {
        toast.success(t('orders.cancelled'));
        onOpenChange(false);
      },
      onError: (e) => toast.error(featureError(e, 'orders.errors')),
    });

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t('orders.cancelTitle')}
      description={t('orders.cancelBody')}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('orders.keepOrder')}
          </Button>
          <Button variant="danger" disabled={!valid} loading={cancel.isPending} onClick={submit}>
            {t('orders.confirmCancel')}
          </Button>
        </>
      }
    >
      <fieldset className="space-y-2">
        <legend className="sr-only">{t('orders.cancelReason')}</legend>
        {REASONS.map((r) => (
          <label
            key={r}
            className={cn(
              'flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 text-sm transition-colors',
              reason === r ? 'border-primary bg-primary-50/60' : 'border-border hover:border-border-strong',
            )}
          >
            <input type="radio" name="cancel-reason" className="size-4 accent-primary" checked={reason === r} onChange={() => setReason(r)} />
            {t(`orders.cancelReasons.${r}`)}
          </label>
        ))}
      </fieldset>
      <textarea
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        maxLength={200}
        rows={3}
        placeholder={reason === 'other' ? t('orders.cancelDetailsRequired') : t('orders.cancelDetails')}
        aria-label={t('orders.cancelDetails')}
        className="mt-3 w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm placeholder:text-fg-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
      />
    </Modal>
  );
}

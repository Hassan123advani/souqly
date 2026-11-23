import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Ban, PackageCheck, ThumbsUp, Truck } from 'lucide-react';
import { canTransition, type OrderDTO } from '@souqly/shared';
import { getErrorMessage } from '@/api/client';
import { useOrderStatus, type StatusChange } from '@/api/seller';
import { Button, FormField, Input, Modal, Select, Textarea } from '@/components/ui';

const COURIERS = ['TCS', 'Leopards', 'M&P', 'Trax', 'PostEx', 'BlueEx', 'Pakistan Post', 'Other'];

/** Confirm → Pack → Ship (courier + tracking) / Cancel (reason). Only valid transitions are offered. */
export function OrderActions({ order }: { order: OrderDTO }) {
  const { t } = useTranslation();
  const m = useOrderStatus();
  const [dialog, setDialog] = useState<'ship' | 'cancel' | null>(null);
  const [courier, setCourier] = useState(COURIERS[0]!);
  const [tracking, setTracking] = useState('');
  const [reason, setReason] = useState('');

  const run = (b: StatusChange) =>
    m.mutate(
      { id: order.id, ...b },
      {
        onSuccess: () => {
          toast.success(t(`seller.orders.done.${b.to}`));
          setDialog(null);
        },
        onError: (e) => toast.error(getErrorMessage(e)),
      },
    );

  const can = (to: StatusChange['to']) => canTransition(order.status, to);
  if (!(['confirmed', 'packed', 'shipped', 'cancelled'] as const).some(can)) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {can('confirmed') && (
        <Button leftIcon={<ThumbsUp className="size-4" />} loading={m.isPending} onClick={() => run({ to: 'confirmed' })}>
          {t('seller.orders.actions.confirm')}
        </Button>
      )}
      {can('packed') && (
        <Button leftIcon={<PackageCheck className="size-4" />} loading={m.isPending} onClick={() => run({ to: 'packed' })}>
          {t('seller.orders.actions.pack')}
        </Button>
      )}
      {can('shipped') && (
        <Button leftIcon={<Truck className="size-4" />} onClick={() => setDialog('ship')}>
          {t('seller.orders.actions.ship')}
        </Button>
      )}
      {can('cancelled') && (
        <Button variant="ghost" leftIcon={<Ban className="size-4" />} onClick={() => setDialog('cancel')}>
          {t('seller.orders.actions.cancel')}
        </Button>
      )}

      <Modal
        open={dialog === 'ship'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t('seller.orders.shipTitle')}
        description={t('seller.orders.shipBody')}
        footer={
          <Button loading={m.isPending} disabled={tracking.trim().length < 3} onClick={() => run({ to: 'shipped', tracking: { courier, trackingNumber: tracking.trim() } })}>
            {t('seller.orders.actions.ship')}
          </Button>
        }
      >
        <div className="grid gap-4">
          <FormField label={t('seller.orders.courier')}>
            <Select value={courier} onValueChange={setCourier} options={COURIERS.map((c) => ({ value: c, label: c }))} />
          </FormField>
          <FormField label={t('seller.orders.trackingNumber')} required>
            <Input dir="ltr" value={tracking} onChange={(e) => setTracking(e.target.value)} maxLength={60} autoFocus />
          </FormField>
        </div>
      </Modal>

      <Modal
        open={dialog === 'cancel'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t('seller.orders.cancelTitle')}
        description={t('seller.orders.cancelBody')}
        footer={
          <Button variant="danger" loading={m.isPending} disabled={reason.trim().length < 3} onClick={() => run({ to: 'cancelled', reason: reason.trim() })}>
            {t('seller.orders.actions.cancel')}
          </Button>
        }
      >
        <FormField label={t('seller.orders.cancelReason')} required>
          <Textarea rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
        </FormField>
      </Modal>
    </div>
  );
}

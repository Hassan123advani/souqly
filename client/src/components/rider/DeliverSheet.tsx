import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CheckCircle2, Lock } from 'lucide-react';
import { deliverSchema, type DeliverInput, type RiderDeliveryDTO } from '@souqly/shared';
import { getErrorCode, getErrorDetails, getErrorMessage } from '@/api/client';
import { useDeliverOrder, type UploadedImage } from '@/api/delivery';
import { Alert, Button, Checkbox, FormField, OtpInput, Sheet } from '@/components/ui';
import { PhotoPicker } from '@/components/returns/PhotoPicker';
import { formatDateTime, money } from '@/lib/format';
import { useUi } from '@/stores/ui';

/** Hand-over: 4-digit buyer code, COD confirmation and an optional proof photo. */
export function DeliverSheet({ d, open, onOpenChange, onDone }: { d: RiderDeliveryDTO; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const { t } = useTranslation();
  const lang = useUi((s) => s.language);
  const deliver = useDeliverOrder(d.orderId);
  const [photo, setPhoto] = useState<UploadedImage[]>([]);
  const [cashOk, setCashOk] = useState(false);
  const [attemptsLeft, setAttemptsLeft] = useState(d.otpAttemptsLeft);
  const [otpError, setOtpError] = useState<string | null>(null);
  const form = useForm<DeliverInput>({ resolver: zodResolver(deliverSchema), defaultValues: { otp: '' } });
  const lockedUntil = d.otpLockedUntil && new Date(d.otpLockedUntil) > new Date() ? d.otpLockedUntil : null;
  const cod = d.codAmount > 0;

  // Reset only when the sheet opens (a refetch after a wrong code must keep the error visible).
  useEffect(() => {
    if (!open) return;
    form.reset({ otp: '' });
    setOtpError(null);
    setAttemptsLeft(d.otpAttemptsLeft);
  }, [open]);

  const submit = form.handleSubmit((v) => {
    setOtpError(null);
    deliver.mutate(
      { otp: v.otp, ...(cod ? { codCollected: d.codAmount } : {}), ...(photo[0] ? { photoRef: photo[0].ref } : {}) },
      {
        onSuccess: () => {
          toast.success(t('rider.deliver.success'));
          onDone();
        },
        onError: (e) => {
          const code = getErrorCode(e);
          if (code === 'OTP_INVALID') {
            const left = getErrorDetails(e)?.attemptsLeft;
            if (typeof left === 'number') setAttemptsLeft(left);
            setOtpError(t('rider.deliver.wrongCode'));
            form.setValue('otp', '');
          } else toast.error(getErrorMessage(e));
        },
      },
    );
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange} side="bottom" title={t('rider.deliver.title')}>
      <form className="mx-auto w-full max-w-lg space-y-5 overflow-y-auto p-4 pb-8" onSubmit={(e) => void submit(e)} noValidate>
        {lockedUntil ? (
          <Alert tone="danger" title={t('rider.deliver.lockedTitle')}>
            <span className="flex items-center gap-1.5">
              <Lock className="size-4" aria-hidden />
              {t('rider.deliver.lockedBody', { time: formatDateTime(lockedUntil, lang) })}
            </span>
          </Alert>
        ) : (
          <FormField
            label={t('rider.deliver.codeLabel')}
            hint={t('rider.deliver.codeHint')}
            error={otpError ?? (form.formState.errors.otp ? t('rider.deliver.codeRequired') : undefined)}
          >
            <Controller
              control={form.control}
              name="otp"
              render={({ field }) => (
                <OtpInput length={4} value={field.value} onChange={field.onChange} invalid={!!otpError || !!form.formState.errors.otp} autoFocus className="justify-center" />
              )}
            />
          </FormField>
        )}
        {!lockedUntil && attemptsLeft < 5 && (
          <p className="-mt-3 text-center text-xs font-semibold text-warning" role="status">
            {t('rider.deliver.attemptsLeft', { count: attemptsLeft })}
          </p>
        )}

        {cod && (
          <div className="rounded-lg border border-accent-200 bg-accent-50 p-4">
            <p className="text-xs font-semibold text-accent-900">{t('rider.deliver.collect')}</p>
            <p className="latin text-3xl font-extrabold tabular text-fg" dir="ltr">
              {money(d.codAmount)}
            </p>
            <Checkbox className="mt-3" checked={cashOk} onChange={(e) => setCashOk(e.target.checked)} label={t('rider.deliver.cashConfirm', { amount: money(d.codAmount) })} />
          </div>
        )}

        <FormField label={t('rider.deliver.photo')} hint={t('rider.deliver.photoHint')}>
          <PhotoPicker endpoint="/rider/uploads" value={photo} onChange={setPhoto} max={1} capture />
        </FormField>

        <Button type="submit" size="xl" block loading={deliver.isPending} disabled={!!lockedUntil || (cod && !cashOk)} leftIcon={<CheckCircle2 className="size-5" />}>
          {t('rider.deliver.submit')}
        </Button>
      </form>
    </Sheet>
  );
}

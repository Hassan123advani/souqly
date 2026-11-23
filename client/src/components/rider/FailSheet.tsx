import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { z } from 'zod';
import { DELIVERY_FAIL_REASONS, deliveryFailSchema } from '@souqly/shared';
import { getErrorMessage } from '@/api/client';
import { useFailDelivery } from '@/api/delivery';
import { Button, FormField, RadioGroup, Sheet, Textarea } from '@/components/ui';

type Values = z.input<typeof deliveryFailSchema>;

export function FailSheet({ orderId, open, onOpenChange, onDone }: { orderId: string; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const { t } = useTranslation();
  const fail = useFailDelivery(orderId);
  const form = useForm<Values>({ resolver: zodResolver(deliveryFailSchema), defaultValues: { reason: 'customer_unavailable', note: '' } });
  const reason = form.watch('reason');

  useEffect(() => {
    if (open) form.reset({ reason: 'customer_unavailable', note: '' });
  }, [open, form]);

  const submit = form.handleSubmit((v) =>
    fail.mutate(
      { reason: v.reason, note: v.note?.trim() || undefined },
      {
        onSuccess: () => {
          toast.success(t('rider.fail.saved'));
          onDone();
        },
        onError: (e) => toast.error(getErrorMessage(e)),
      },
    ),
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange} side="bottom" title={t('rider.fail.title')}>
      <form className="mx-auto w-full max-w-lg space-y-5 overflow-y-auto p-4 pb-8" onSubmit={(e) => void submit(e)} noValidate>
        <Controller
          control={form.control}
          name="reason"
          render={({ field }) => (
            <RadioGroup
              legend={t('rider.fail.reason')}
              value={field.value}
              onChange={field.onChange}
              options={DELIVERY_FAIL_REASONS.map((r) => ({ value: r, label: t(`rider.fail.reasons.${r}`) }))}
            />
          )}
        />
        <FormField
          label={t('rider.fail.note')}
          required={reason === 'other'}
          error={form.formState.errors.note ? t('rider.fail.noteRequired') : undefined}
        >
          <Textarea rows={3} maxLength={500} {...form.register('note')} />
        </FormField>
        <Button type="submit" size="xl" block variant="danger" loading={fail.isPending}>
          {t('rider.fail.submit')}
        </Button>
      </form>
    </Sheet>
  );
}

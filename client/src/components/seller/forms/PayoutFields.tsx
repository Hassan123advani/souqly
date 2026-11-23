import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Building2, Smartphone } from 'lucide-react';
import { PAYOUT_METHODS } from '@souqly/shared';
import { FormField, Input, RadioGroup } from '@/components/ui';
import { fieldError } from './fieldError';

/** Payout account fields; `prefix` is `"payout."` inside the wizard. */
export function PayoutFields({ prefix = '' }: { prefix?: string }) {
  const { t } = useTranslation();
  const { register, control, watch, formState } = useFormContext();
  const p = (k: string) => `${prefix}${k}`;
  const method = watch(p('method')) as string;
  const err = (k: string) => fieldError(formState.errors, p(k));
  const opt = (v: string) => (v === '' ? undefined : v);
  return (
    <div className="grid gap-4">
      <Controller
        control={control}
        name={p('method')}
        render={({ field }) => (
          <RadioGroup
            legend={t('seller.payout.method')}
            variant="cards"
            columns={3}
            value={field.value}
            onChange={field.onChange}
            options={PAYOUT_METHODS.map((v) => ({
              value: v,
              label: t(`seller.payout.methods.${v}`),
              icon: v === 'bank' ? <Building2 className="size-5" /> : <Smartphone className="size-5" />,
            }))}
          />
        )}
      />
      <FormField label={t('seller.payout.accountTitle')} required error={err('accountTitle')}>
        <Input autoComplete="off" {...register(p('accountTitle'))} />
      </FormField>
      {method === 'bank' && (
        <FormField label={t('seller.payout.bankName')} required error={err('bankName')}>
          <Input autoComplete="off" {...register(p('bankName'), { setValueAs: opt })} />
        </FormField>
      )}
      <FormField
        label={method === 'bank' ? t('seller.payout.accountNumber') : t('seller.payout.walletNumber')}
        hint={method === 'bank' ? undefined : t('seller.payout.walletHint')}
        required
        error={err('accountNumber')}
      >
        <Input inputMode={method === 'bank' ? 'text' : 'tel'} autoComplete="off" {...register(p('accountNumber'))} />
      </FormField>
      {method === 'bank' && (
        <FormField label={t('seller.payout.iban')} hint={t('seller.payout.ibanHint')} error={err('iban')}>
          <Input autoComplete="off" className="uppercase" {...register(p('iban'), { setValueAs: opt })} />
        </FormField>
      )}
    </div>
  );
}

import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react';
import { BUSINESS_TYPES } from '@souqly/shared';
import { Alert, FormField, Input, RadioGroup } from '@/components/ui';
import { MediaUpload } from '../MediaUpload';
import { fieldError } from './fieldError';

/** Business identity fields; `prefix` is `"business."` inside the wizard, `""` in the standalone form. */
export function BusinessFields({ prefix = '' }: { prefix?: string }) {
  const { t } = useTranslation();
  const { register, control, watch, formState } = useFormContext();
  const p = (k: string) => `${prefix}${k}`;
  const type = watch(p('type')) as string;
  const err = (k: string) => fieldError(formState.errors, p(k));
  const opt = (v: string) => (v === '' ? undefined : v);
  return (
    <div className="grid gap-4">
      <Controller
        control={control}
        name={p('type')}
        render={({ field }) => (
          <RadioGroup
            legend={t('seller.business.type')}
            variant="cards"
            columns={2}
            value={field.value}
            onChange={field.onChange}
            options={BUSINESS_TYPES.map((v) => ({ value: v, label: t(`seller.business.types.${v}`), description: t(`seller.business.typeHints.${v}`) }))}
          />
        )}
      />
      <FormField label={type === 'company' ? t('seller.business.companyName') : t('seller.business.legalName')} required error={err('legalName')}>
        <Input autoComplete="name" {...register(p('legalName'))} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label={type === 'company' ? t('seller.business.regNo') : t('seller.business.cnic')}
          hint={type === 'company' ? undefined : t('seller.business.cnicHint')}
          required
          error={err('cnicOrRegNo')}
        >
          <Input inputMode={type === 'company' ? 'text' : 'numeric'} autoComplete="off" {...register(p('cnicOrRegNo'))} />
        </FormField>
        <FormField label={t('seller.business.ntn')} hint={t('seller.common.optional')} error={err('ntn')}>
          <Input autoComplete="off" {...register(p('ntn'), { setValueAs: opt })} />
        </FormField>
      </div>
      <Controller
        control={control}
        name={p('idDocument')}
        render={({ field }) => (
          <MediaUpload
            label={t('seller.business.idDocument')}
            hint={t('seller.business.idDocumentHint')}
            accept="image/jpeg,image/png,image/webp,application/pdf"
            frameClassName="aspect-[16/7] max-w-md"
            value={field.value}
            onChange={(v) => field.onChange(v ?? undefined)}
          />
        )}
      />
      <Alert tone="info" title={t('seller.business.secureTitle')}>
        <span className="inline-flex items-start gap-1.5">
          <Lock className="mt-0.5 size-3.5 shrink-0" />
          {t('seller.business.secureBody')}
        </span>
      </Alert>
    </div>
  );
}

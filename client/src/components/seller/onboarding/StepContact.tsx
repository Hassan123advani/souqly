import { lazy, Suspense, useId } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { COUNTRIES, type OnboardingInput } from '@souqly/shared';
import { FormField, Input, Skeleton } from '@/components/ui';
import { fieldError } from '../forms/fieldError';

const MapPicker = lazy(() => import('@/components/map/MapPicker'));

/** Store contact + pickup address (where couriers collect parcels). */
export function StepContact() {
  const { t } = useTranslation();
  const listId = useId();
  const { register, control, formState } = useFormContext<OnboardingInput>();
  const err = (k: string) => fieldError(formState.errors, k);
  const opt = (v: string) => (v === '' ? undefined : v);
  const cities = COUNTRIES.find((c) => c.code === 'PK')?.cities ?? [];
  return (
    <div className="grid gap-6">
      <fieldset className="grid gap-4">
        <legend className="mb-1 text-sm font-bold text-fg">{t('seller.contact.title')}</legend>
        <FormField label={t('seller.contact.email')} required error={err('contact.email')}>
          <Input type="email" dir="ltr" autoComplete="email" {...register('contact.email')} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('seller.contact.phone')} hint={t('seller.contact.phoneHint')} required error={err('contact.phone')}>
            <Input type="tel" dir="ltr" autoComplete="tel" placeholder="+923001234567" {...register('contact.phone')} />
          </FormField>
          <FormField label={t('seller.contact.whatsapp')} hint={t('seller.common.optional')} error={err('contact.whatsapp')}>
            <Input type="tel" dir="ltr" placeholder="+923001234567" {...register('contact.whatsapp', { setValueAs: opt })} />
          </FormField>
        </div>
      </fieldset>
      <fieldset className="grid gap-4">
        <legend className="mb-1 text-sm font-bold text-fg">{t('seller.contact.pickupTitle')}</legend>
        <p className="-mt-2 text-sm text-fg-muted">{t('seller.contact.pickupHint')}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('seller.contact.fullName')} required error={err('pickupAddress.fullName')}>
            <Input autoComplete="name" {...register('pickupAddress.fullName')} />
          </FormField>
          <FormField label={t('seller.contact.pickupPhone')} required error={err('pickupAddress.phone')}>
            <Input type="tel" dir="ltr" placeholder="+923001234567" {...register('pickupAddress.phone')} />
          </FormField>
        </div>
        <FormField label={t('seller.contact.line1')} required error={err('pickupAddress.line1')}>
          <Input autoComplete="address-line1" {...register('pickupAddress.line1')} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label={t('seller.contact.area')} error={err('pickupAddress.area')}>
            <Input {...register('pickupAddress.area', { setValueAs: opt })} />
          </FormField>
          <FormField label={t('seller.contact.city')} required error={err('pickupAddress.city')}>
            <Input list={listId} autoComplete="address-level2" {...register('pickupAddress.city')} />
          </FormField>
          <FormField label={t('seller.contact.postalCode')} error={err('pickupAddress.postalCode')}>
            <Input dir="ltr" autoComplete="postal-code" {...register('pickupAddress.postalCode', { setValueAs: opt })} />
          </FormField>
        </div>
        <datalist id={listId}>
          {cities.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <div className="grid gap-1.5">
          <p className="text-sm font-semibold text-fg">{t('seller.contact.pin')}</p>
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <Controller
              control={control}
              name="pickupAddress.location"
              render={({ field }) => <MapPicker value={field.value ?? null} onChange={field.onChange} className="h-64" />}
            />
          </Suspense>
        </div>
      </fieldset>
    </div>
  );
}

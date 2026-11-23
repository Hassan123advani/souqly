import { useRef } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { slugify, type OnboardingInput } from '@souqly/shared';
import { FormField, Input, Label } from '@/components/ui';
import { CategoryMultiSelect } from '../CategoryMultiSelect';
import { fieldError } from '../forms/fieldError';
import { ThemeColorPicker } from '../ThemeColorPicker';
import { SlugField, type SlugState } from './SlugField';

export function StepBasics({ onSlugState }: { onSlugState: (s: SlugState) => void }) {
  const { t } = useTranslation();
  const { register, control, watch, setValue, getValues, formState } = useFormContext<OnboardingInput>();
  const err = (k: string) => fieldError(formState.errors, k);
  // Keep auto-filling the slug from the name until the seller edits the slug themselves.
  const slugTouched = useRef(!!getValues('slug') && getValues('slug') !== slugify(getValues('name') ?? ''));
  const name = watch('name');
  const nameField = register('name', {
    onChange: (e: { target: { value: string } }) => {
      if (!slugTouched.current) setValue('slug', slugify(e.target.value), { shouldDirty: true });
    },
  });
  return (
    <div className="grid gap-5">
      <FormField label={t('seller.basics.name')} hint={t('seller.basics.nameHint')} required error={err('name')}>
        <Input autoFocus maxLength={80} {...nameField} />
      </FormField>
      <Controller
        control={control}
        name="slug"
        render={({ field }) => (
          <SlugField
            value={field.value ?? ''}
            onChange={(v) => {
              slugTouched.current = true;
              field.onChange(v);
            }}
            onState={onSlugState}
            error={err('slug')}
          />
        )}
      />
      <FormField label={t('seller.basics.tagline')} hint={t('seller.basics.taglineHint')} error={err('tagline')}>
        <Input maxLength={120} {...register('tagline', { setValueAs: (v: string) => v || undefined })} />
      </FormField>
      <div className="grid gap-2">
        <Label required>{t('seller.basics.categories')}</Label>
        <Controller
          control={control}
          name="categoryIds"
          render={({ field }) => <CategoryMultiSelect value={field.value ?? []} onChange={field.onChange} />}
        />
        {err('categoryIds') && <p className="text-xs font-medium text-danger">{t('seller.basics.categoriesRequired')}</p>}
      </div>
      <div className="grid gap-2">
        <Label>{t('seller.basics.theme')}</Label>
        <Controller
          control={control}
          name="themeColor"
          render={({ field }) => <ThemeColorPicker value={field.value} onChange={field.onChange} storeName={name} />}
        />
        {err('themeColor') && <p className="text-xs font-medium text-danger">{err('themeColor')}</p>}
      </div>
    </div>
  );
}

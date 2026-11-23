import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import type { SellerStore } from '@souqly/shared';
import { Button, FormField, Input, Label, Textarea } from '@/components/ui';
import { CategoryMultiSelect } from '../CategoryMultiSelect';
import { fieldError } from '../forms/fieldError';
import { MediaUpload, type MediaRef } from '../MediaUpload';
import { ThemeColorPicker } from '../ThemeColorPicker';
import { useStorePatch } from './useStorePatch';

const phone = z.union([z.literal(''), z.string().trim().regex(/^\+?[1-9]\d{7,14}$/, 'Enter a valid phone number')]);
const schema = z.object({
  name: z.string().trim().min(2).max(80),
  tagline: z.string().trim().max(120),
  description: z.string().trim().max(2000),
  themeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  categoryIds: z.array(z.string()).min(1).max(10),
  logo: z.custom<MediaRef | null>(),
  banner: z.custom<MediaRef | null>(),
  contact: z.object({ email: z.union([z.literal(''), z.string().trim().email()]), phone, whatsapp: phone }),
});
type Form = z.infer<typeof schema>;

export function BrandingTab({ store }: { store: SellerStore }) {
  const { t } = useTranslation();
  const patch = useStorePatch();
  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: store.name,
      tagline: store.tagline ?? '',
      description: store.description ?? '',
      themeColor: store.themeColor,
      categoryIds: store.categoryIds,
      logo: store.logo ?? null,
      banner: store.banner ?? null,
      contact: { email: store.contact.email ?? '', phone: store.contact.phone ?? '', whatsapp: store.contact.whatsapp ?? '' },
    },
  });
  const { register, control, handleSubmit, formState, watch, reset } = form;
  const err = (k: string) => fieldError(formState.errors, k);
  const submit = handleSubmit((v) => {
    const contact = Object.fromEntries(Object.entries(v.contact).filter(([, x]) => x)) as SellerStore['contact'];
    patch.save(
      {
        name: v.name,
        tagline: v.tagline,
        description: v.description,
        themeColor: v.themeColor.toUpperCase(),
        categoryIds: v.categoryIds,
        logo: v.logo,
        banner: v.banner,
        contact,
      },
      () => reset(v),
    );
  });
  return (
    <form className="grid gap-5" onSubmit={(e) => void submit(e)} noValidate>
      <div className="grid gap-5 sm:grid-cols-[200px_1fr]">
        <Controller control={control} name="logo" render={({ field }) => <MediaUpload label={t('seller.branding.logo')} value={field.value} onChange={field.onChange} />} />
        <Controller
          control={control}
          name="banner"
          render={({ field }) => <MediaUpload label={t('seller.branding.banner')} frameClassName="aspect-[3/1]" value={field.value} onChange={field.onChange} hint={t('seller.branding.bannerHint')} />}
        />
      </div>
      <FormField label={t('seller.basics.name')} required error={err('name')}>
        <Input maxLength={80} {...register('name')} />
      </FormField>
      <FormField label={t('seller.basics.tagline')} error={err('tagline')}>
        <Input maxLength={120} {...register('tagline')} />
      </FormField>
      <FormField label={t('seller.storeSettings.description')} error={err('description')}>
        <Textarea rows={4} maxLength={2000} {...register('description')} />
      </FormField>
      <div className="grid gap-2">
        <Label>{t('seller.basics.theme')}</Label>
        <Controller control={control} name="themeColor" render={({ field }) => <ThemeColorPicker value={field.value} onChange={field.onChange} storeName={watch('name')} />} />
      </div>
      <div className="grid gap-2">
        <Label required>{t('seller.basics.categories')}</Label>
        <Controller control={control} name="categoryIds" render={({ field }) => <CategoryMultiSelect value={field.value} onChange={field.onChange} />} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label={t('seller.contact.email')} error={err('contact.email')}>
          <Input type="email" dir="ltr" {...register('contact.email')} />
        </FormField>
        <FormField label={t('seller.contact.phone')} error={err('contact.phone')}>
          <Input type="tel" dir="ltr" {...register('contact.phone')} />
        </FormField>
        <FormField label={t('seller.contact.whatsapp')} error={err('contact.whatsapp')}>
          <Input type="tel" dir="ltr" {...register('contact.whatsapp')} />
        </FormField>
      </div>
      <Button type="submit" className="w-fit" loading={patch.isPending} disabled={!formState.isDirty}>
        {t('seller.common.save')}
      </Button>
    </form>
  );
}

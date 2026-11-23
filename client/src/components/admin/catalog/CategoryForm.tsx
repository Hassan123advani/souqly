import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { adminCategoryCreateSchema, adminCategoryUpdateSchema } from '@souqly/shared';
import { useAdminMutation, type AdminCategory } from '@/api/admin';
import { getErrorMessage } from '@/api/client';
import { applyZodErrors, bpsToPct, pctToBps } from '@/components/admin/zodForm';
import { CATEGORY_ICON_NAMES, CategoryIcon } from '@/components/catalog/CategoryIcon';
import { Button, FormField, Input, Modal, Switch, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import { cn } from '@/lib/cn';

type Values = { en: string; ur: string; ar: string; slug: string; icon: string; image: string; color: string; commission: string; isActive: boolean };
const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

/** Create / edit a category: EN/UR/AR names, icon from the curated registry, colour, commission, active. */
export function CategoryForm({ category, parentId, onClose }: { category?: AdminCategory; parentId?: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  const create = useAdminMutation('post', ['categories']);
  const update = useAdminMutation('patch', ['categories']);
  const [iconQ, setIconQ] = useState('');
  const form = useForm<Values>({
    defaultValues: {
      en: category?.name.en ?? '',
      ur: category?.name.ur ?? '',
      ar: category?.name.ar ?? '',
      slug: category?.slug ?? '',
      icon: category?.icon ?? '',
      image: category?.image ?? '',
      color: category?.color ?? '',
      commission: bpsToPct(category?.commissionBps),
      isActive: category?.isActive ?? true,
    },
  });
  const { register, watch, setValue, formState } = form;
  const errors = formState.errors;
  const icon = watch('icon');
  const color = watch('color');

  const submit = form.handleSubmit((v) => {
    const base = {
      name: { en: v.en, ur: v.ur, ar: v.ar },
      icon: v.icon || undefined,
      image: v.image.trim() || undefined,
      color: v.color || undefined,
      commissionBps: pctToBps(v.commission),
      isActive: v.isActive,
    };
    const parsed = category ? adminCategoryUpdateSchema.safeParse(base) : adminCategoryCreateSchema.safeParse({ ...base, slug: v.slug, parentId: parentId ?? null });
    if (!parsed.success) return void applyZodErrors(form, parsed.error, { 'name.en': 'en', 'name.ur': 'ur', 'name.ar': 'ar', commissionBps: 'commission' });
    const opts = { onSuccess: () => (toast.success(t('admin.common.saved')), onClose()), onError: (e: unknown) => toast.error(getErrorMessage(e)) };
    if (category) update.mutate({ path: `categories/${category.id}`, body: parsed.data }, opts);
    else create.mutate({ path: 'categories', body: parsed.data }, opts);
  });

  const icons = CATEGORY_ICON_NAMES.filter((n) => n.toLowerCase().includes(iconQ.trim().toLowerCase()));

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={category ? t('admin.catalog.editCategory') : t('admin.catalog.newCategory')}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void submit()} loading={create.isPending || update.isPending}>
            {t('admin.common.save')}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <Tabs defaultValue="en">
          <TabsList>
            <TabsTrigger value="en">English</TabsTrigger>
            <TabsTrigger value="ur">اردو</TabsTrigger>
            <TabsTrigger value="ar">العربية</TabsTrigger>
          </TabsList>
          {(['en', 'ur', 'ar'] as const).map((l) => (
            <TabsContent key={l} value={l} className="pt-3">
              <FormField label={t('admin.catalog.name')} required={l === 'en'} error={errors[l]?.message}>
                <Input
                  dir={l === 'en' ? 'ltr' : 'rtl'}
                  {...register(l, {
                    onChange: (e: { target: { value: string } }) => {
                      if (l === 'en' && !category && !formState.dirtyFields.slug) setValue('slug', slugify(e.target.value));
                    },
                  })}
                />
              </FormField>
            </TabsContent>
          ))}
        </Tabs>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('admin.catalog.slug')} required error={errors.slug?.message} hint={category ? t('admin.catalog.slugLocked') : undefined}>
            <Input dir="ltr" disabled={!!category} {...register('slug')} />
          </FormField>
          <FormField label={t('admin.catalog.commission')} error={errors.commission?.message} hint={t('admin.catalog.commissionHint')}>
            <Input type="number" min={0} max={100} step="0.1" {...register('commission')} endAdornment={<span className="text-sm text-fg-muted">%</span>} />
          </FormField>
          <FormField label={t('admin.catalog.image')} error={errors.image?.message}>
            <Input dir="ltr" placeholder="https://… or /uploads/…" {...register('image')} />
          </FormField>
          <FormField label={t('admin.catalog.color')} error={errors.color?.message}>
            <div className="flex gap-2">
              <input type="color" value={color || '#0e5e5a'} onChange={(e) => setValue('color', e.target.value, { shouldDirty: true })} className="h-11 w-12 cursor-pointer rounded-md border border-border bg-surface" aria-label={t('admin.catalog.color')} />
              <Input dir="ltr" placeholder="#0E5E5A" {...register('color')} />
            </div>
          </FormField>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-fg">{t('admin.catalog.icon')}</p>
            <div className="w-40">
              <Input value={iconQ} onChange={(e) => setIconQ(e.target.value)} placeholder={t('admin.catalog.iconSearch')} aria-label={t('admin.catalog.iconSearch')} className="h-9" />
            </div>
          </div>
          <div className="grid max-h-44 grid-cols-8 gap-1.5 overflow-y-auto rounded-md border border-border p-2 sm:grid-cols-12">
            {icons.map((n) => (
              <button
                key={n}
                type="button"
                title={n}
                aria-label={n}
                aria-pressed={icon === n}
                onClick={() => setValue('icon', icon === n ? '' : n, { shouldDirty: true })}
                className={cn('grid aspect-square place-items-center rounded-md border text-fg-muted hover:bg-surface-2 hover:text-fg', icon === n ? 'border-primary bg-primary-50 text-primary-800' : 'border-transparent')}
              >
                <CategoryIcon name={n} className="size-4" />
              </button>
            ))}
          </div>
        </div>
        <Switch checked={watch('isActive')} onCheckedChange={(v) => setValue('isActive', v, { shouldDirty: true })} label={t('admin.catalog.active')} description={t('admin.catalog.activeHint')} />
      </form>
    </Modal>
  );
}

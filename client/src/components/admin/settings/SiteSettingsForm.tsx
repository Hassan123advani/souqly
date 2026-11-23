import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertOctagon, Save } from 'lucide-react';
import { adminSiteSettingsSchema } from '@souqly/shared';
import { useAdminGet, useAdminMutation, type SiteSettings } from '@/api/admin';
import { getErrorMessage } from '@/api/client';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { applyZodErrors } from '@/components/admin/zodForm';
import { Button, Card, CardHeader, ErrorState, FormField, Input, Select, Skeleton, Switch, Textarea } from '@/components/ui';
import { cn } from '@/lib/cn';

type Values = {
  name: string;
  tagline: string;
  logoUrl: string;
  primaryColor: string;
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string;
  maintenance: boolean;
  maintenanceMessage: string;
  annText: string;
  annLink: string;
  annTone: 'info' | 'promo' | 'warning';
  facebook: string;
  instagram: string;
  x: string;
  youtube: string;
  tiktok: string;
  supportEmail: string;
  supportPhone: string;
};
const SOCIAL = ['facebook', 'instagram', 'x', 'youtube', 'tiktok'] as const;

function toValues(s: SiteSettings): Values {
  return {
    name: s.name,
    tagline: s.tagline ?? '',
    logoUrl: s.logoUrl ?? '',
    primaryColor: s.primaryColor ?? '',
    seoTitle: s.seo?.title ?? '',
    seoDescription: s.seo?.description ?? '',
    seoKeywords: s.seo?.keywords ?? '',
    maintenance: s.maintenance,
    maintenanceMessage: s.maintenanceMessage ?? '',
    annText: s.announcement?.text ?? '',
    annLink: s.announcement?.link ?? '',
    annTone: s.announcement?.tone ?? 'info',
    facebook: s.social?.facebook ?? '',
    instagram: s.social?.instagram ?? '',
    x: s.social?.x ?? '',
    youtube: s.social?.youtube ?? '',
    tiktok: s.social?.tiktok ?? '',
    supportEmail: s.supportEmail ?? '',
    supportPhone: s.supportPhone ?? '',
  };
}

export function SiteSettingsForm() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useAdminGet<SiteSettings>('settings/site');
  const put = useAdminMutation('put', ['settings']);
  const form = useForm<Values>();
  const [confirmMaint, setConfirmMaint] = useState<Values | null>(null);
  useEffect(() => {
    if (q.data) form.reset(toValues(q.data));
  }, [q.data, form]);
  const { errors, isDirty } = form.formState;
  const maintenance = form.watch('maintenance');

  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Skeleton className="h-[600px]" />;

  const o = (v: string) => v.trim() || undefined;
  function send(v: Values) {
    const parsed = adminSiteSettingsSchema.safeParse({
      name: v.name,
      tagline: v.tagline,
      logoUrl: o(v.logoUrl),
      primaryColor: o(v.primaryColor),
      seo: { title: o(v.seoTitle), description: o(v.seoDescription), keywords: o(v.seoKeywords) },
      maintenance: v.maintenance,
      maintenanceMessage: o(v.maintenanceMessage),
      announcement: v.annText.trim() ? { text: v.annText.trim(), link: o(v.annLink), tone: v.annTone } : undefined,
      social: Object.fromEntries(SOCIAL.map((k) => [k, o(v[k])])),
      supportEmail: o(v.supportEmail),
      supportPhone: o(v.supportPhone),
    });
    if (!parsed.success)
      return void applyZodErrors(form, parsed.error, { 'seo.title': 'seoTitle', 'seo.description': 'seoDescription', 'announcement.link': 'annLink', 'announcement.text': 'annText', ...Object.fromEntries(SOCIAL.map((k) => [`social.${k}`, k])) });
    put.mutate(
      { path: 'settings/site', body: parsed.data },
      {
        onSuccess: () => {
          toast.success(t('admin.common.saved'));
          setConfirmMaint(null);
          void qc.invalidateQueries({ queryKey: ['config'] });
        },
        onError: (e) => toast.error(getErrorMessage(e)),
      },
    );
  }
  // Turning maintenance ON needs an explicit confirmation.
  const submit = form.handleSubmit((v) => (v.maintenance && !q.data?.maintenance ? setConfirmMaint(v) : send(v)));

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <Card className={cn('overflow-hidden', maintenance && 'ring-2 ring-danger')}>
        <div className={cn('flex flex-wrap items-start gap-4 p-5', maintenance ? 'bg-danger-soft' : '')}>
          <span className={cn('grid size-11 shrink-0 place-items-center rounded-full', maintenance ? 'bg-danger text-white' : 'bg-surface-2 text-fg-muted')}>
            <AlertOctagon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold text-fg">{t('admin.settings.maintenance')}</p>
            <p className="text-sm text-fg-muted">{t('admin.settings.maintenanceDesc')}</p>
            {maintenance && (
              <FormField label={t('admin.settings.maintenanceMessage')} className="mt-3" error={errors.maintenanceMessage?.message}>
                <Input maxLength={300} {...form.register('maintenanceMessage')} />
              </FormField>
            )}
          </div>
          <Switch checked={maintenance} onCheckedChange={(v) => form.setValue('maintenance', v, { shouldDirty: true })} label={<span className="sr-only">{t('admin.settings.maintenance')}</span>} />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t('admin.settings.brand')} />
          <div className="grid gap-4 p-5">
            <FormField label={t('admin.settings.siteName')} required error={errors.name?.message}>
              <Input {...form.register('name')} />
            </FormField>
            <FormField label={t('admin.settings.tagline')} error={errors.tagline?.message}>
              <Input {...form.register('tagline')} />
            </FormField>
            <FormField label={t('admin.settings.logoUrl')} error={errors.logoUrl?.message}>
              <Input dir="ltr" placeholder="https://…" {...form.register('logoUrl')} />
            </FormField>
            <FormField label={t('admin.settings.primaryColor')} error={errors.primaryColor?.message}>
              <div className="flex gap-2">
                <input type="color" value={form.watch('primaryColor') || '#0e5e5a'} onChange={(e) => form.setValue('primaryColor', e.target.value, { shouldDirty: true })} className="h-11 w-12 cursor-pointer rounded-md border border-border" aria-label={t('admin.settings.primaryColor')} />
                <Input dir="ltr" placeholder="#0E5E5A" {...form.register('primaryColor')} />
              </div>
            </FormField>
          </div>
        </Card>
        <Card>
          <CardHeader title={t('admin.settings.seo')} />
          <div className="grid gap-4 p-5">
            <FormField label={t('admin.settings.seoTitle')} hint={t('admin.settings.chars', { n: form.watch('seoTitle')?.length ?? 0, max: 70 })} error={errors.seoTitle?.message}>
              <Input maxLength={70} {...form.register('seoTitle')} />
            </FormField>
            <FormField label={t('admin.settings.seoDescription')} hint={t('admin.settings.chars', { n: form.watch('seoDescription')?.length ?? 0, max: 170 })} error={errors.seoDescription?.message}>
              <Textarea rows={3} maxLength={170} {...form.register('seoDescription')} />
            </FormField>
            <FormField label={t('admin.settings.seoKeywords')}>
              <Input {...form.register('seoKeywords')} />
            </FormField>
          </div>
        </Card>
        <Card>
          <CardHeader title={t('admin.settings.announcement')} description={t('admin.settings.announcementHint')} />
          <div className="grid gap-4 p-5">
            <FormField label={t('admin.settings.annText')} error={errors.annText?.message}>
              <Input maxLength={200} {...form.register('annText')} />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
              <FormField label={t('admin.settings.annLink')} error={errors.annLink?.message}>
                <Input dir="ltr" placeholder="/campaign/…" {...form.register('annLink')} />
              </FormField>
              <FormField label={t('admin.settings.annTone')}>
                <Select value={form.watch('annTone')} onValueChange={(v) => form.setValue('annTone', v as Values['annTone'], { shouldDirty: true })} options={(['info', 'promo', 'warning'] as const).map((x) => ({ value: x, label: t(`admin.settings.tones.${x}`) }))} />
              </FormField>
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader title={t('admin.settings.contacts')} />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <FormField label={t('admin.settings.supportEmail')} error={errors.supportEmail?.message}>
              <Input dir="ltr" type="email" {...form.register('supportEmail')} />
            </FormField>
            <FormField label={t('admin.settings.supportPhone')} error={errors.supportPhone?.message}>
              <Input dir="ltr" {...form.register('supportPhone')} />
            </FormField>
            {SOCIAL.map((k) => (
              <FormField key={k} label={t(`admin.settings.social.${k}`)} error={errors[k]?.message}>
                <Input dir="ltr" placeholder="https://…" {...form.register(k)} />
              </FormField>
            ))}
          </div>
        </Card>
      </div>
      {/* Floats at the bottom of the viewport only while there are unsaved changes. */}
      <div className={cn('flex items-center justify-end gap-3', isDirty && 'sticky bottom-4 z-10 rounded-lg border border-border bg-surface/95 p-2 ps-4 shadow-pop backdrop-blur')}>
        {isDirty && <p className="me-auto text-sm font-medium text-fg-muted">{t('admin.settings.unsaved')}</p>}
        <Button type="submit" loading={put.isPending} disabled={!isDirty} leftIcon={<Save className="size-4" />}>
          {t('admin.common.saveChanges')}
        </Button>
      </div>
      <ConfirmDialog
        open={!!confirmMaint}
        onOpenChange={(o) => !o && setConfirmMaint(null)}
        title={t('admin.settings.maintConfirmTitle')}
        description={t('admin.settings.maintConfirmDesc')}
        confirmLabel={t('admin.settings.maintConfirm')}
        tone="danger"
        loading={put.isPending}
        onConfirm={() => confirmMaint && send(confirmMaint)}
      />
    </form>
  );
}

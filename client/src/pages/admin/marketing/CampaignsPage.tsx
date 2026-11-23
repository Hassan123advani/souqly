import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ExternalLink, Megaphone, Pencil, Plus, Trash2 } from 'lucide-react';
import { adminCampaignSchema } from '@souqly/shared';
import { useAdminGet, useAdminMutation, type AdminCampaign } from '@/api/admin';
import { getErrorMessage } from '@/api/client';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { DataTable, type Column } from '@/components/admin/DataTable';
import { fromLocalInput, toLocalInput, windowState } from '@/components/admin/dates';
import { ImageUpload } from '@/components/admin/ImageUpload';
import { PageHeader } from '@/components/admin/PageHeader';
import { StatusPill } from '@/components/admin/StatusPill';
import { applyZodErrors } from '@/components/admin/zodForm';
import { Button, FormField, IconButton, Input, Modal, Textarea } from '@/components/ui';
import { useLang } from '@/lib/catalog';
import { formatDateTime } from '@/lib/format';

export default function CampaignsPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const q = useAdminGet<AdminCampaign[]>('campaigns');
  const del = useAdminMutation('delete', ['campaigns']);
  const [edit, setEdit] = useState<AdminCampaign | 'new' | null>(null);
  const [remove, setRemove] = useState<AdminCampaign | null>(null);

  const columns: Column<AdminCampaign>[] = [
    {
      key: 'name',
      header: t('admin.marketing.campaign'),
      cell: (c) => (
        <div className="flex items-center gap-3">
          <span className="h-10 w-16 shrink-0 overflow-hidden rounded-md bg-surface-2">{c.banner && <img src={c.banner} alt="" className="size-full object-cover" />}</span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-fg">{c.name}</p>
            <p className="text-xs text-fg-muted" dir="ltr">
              /campaign/{c.slug}
            </p>
          </div>
        </div>
      ),
    },
    { key: 'state', header: t('admin.common.status'), cell: (c) => <StatusPill status={windowState(c.startsAt, c.endsAt)} /> },
    { key: 'starts', header: t('admin.marketing.starts'), cell: (c) => <span className="whitespace-nowrap text-fg-muted">{formatDateTime(c.startsAt, lang)}</span> },
    { key: 'ends', header: t('admin.marketing.ends'), cell: (c) => <span className="whitespace-nowrap text-fg-muted">{formatDateTime(c.endsAt, lang)}</span> },
    {
      key: 'a',
      header: '',
      align: 'end',
      cell: (c) => (
        <div className="flex justify-end">
          <IconButton size="sm" variant="ghost" label={t('admin.marketing.preview')} href={`/campaign/${c.slug}`} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="size-4" />
          </IconButton>
          <IconButton size="sm" variant="ghost" label={t('common.edit')} onClick={() => setEdit(c)}>
            <Pencil className="size-4" />
          </IconButton>
          <IconButton size="sm" variant="ghost" label={t('common.delete')} onClick={() => setRemove(c)}>
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t('admin.nav.campaigns')}
        description={t('admin.marketing.campaignsSub')}
        crumbs={[{ label: t('admin.nav.marketing') }]}
        actions={
          <Button size="sm" leftIcon={<Plus className="size-4" />} onClick={() => setEdit('new')}>
            {t('admin.marketing.newCampaign')}
          </Button>
        }
      />
      <DataTable rows={q.data ?? []} columns={columns} rowKey={(c) => c.id} isLoading={q.isLoading} error={q.error} onRetry={() => void q.refetch()} empty={{ title: t('admin.marketing.noCampaigns'), icon: <Megaphone /> }} />
      {edit && <CampaignForm campaign={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
      {remove && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setRemove(null)}
          title={t('admin.marketing.deleteTitle', { name: remove.name })}
          confirmLabel={t('common.delete')}
          tone="danger"
          loading={del.isPending}
          onConfirm={() => del.mutate({ path: `campaigns/${remove.id}` }, { onSuccess: () => (toast.success(t('admin.common.deleted')), setRemove(null)), onError: (e) => toast.error(getErrorMessage(e)) })}
        />
      )}
    </>
  );
}

type Values = { slug: string; name: string; theme: string; banner: string; startsAt: string; endsAt: string; description: string; headline: string; subheadline: string; body: string; heroImage: string };

function CampaignForm({ campaign: c, onClose }: { campaign?: AdminCampaign; onClose: () => void }) {
  const { t } = useTranslation();
  const create = useAdminMutation('post', ['campaigns']);
  const put = useAdminMutation('put', ['campaigns']);
  const form = useForm<Values>({
    defaultValues: {
      slug: c?.slug ?? '',
      name: c?.name ?? '',
      theme: c?.theme ?? '',
      banner: c?.banner ?? '',
      startsAt: toLocalInput(c?.startsAt),
      endsAt: toLocalInput(c?.endsAt),
      description: c?.description ?? '',
      headline: c?.landing?.headline ?? '',
      subheadline: c?.landing?.subheadline ?? '',
      body: c?.landing?.body ?? '',
      heroImage: c?.landing?.heroImage ?? '',
    },
  });
  const { errors } = form.formState;
  const opt = (v: string) => v.trim() || undefined;
  const submit = form.handleSubmit((v) => {
    const parsed = adminCampaignSchema.safeParse({
      slug: v.slug,
      name: v.name,
      theme: opt(v.theme),
      banner: opt(v.banner),
      startsAt: fromLocalInput(v.startsAt),
      endsAt: fromLocalInput(v.endsAt),
      description: opt(v.description),
      landing: { headline: opt(v.headline), subheadline: opt(v.subheadline), body: opt(v.body), heroImage: opt(v.heroImage) },
      ...(c?.productIds ? { productIds: c.productIds } : {}),
    });
    if (!parsed.success) return void applyZodErrors(form, parsed.error, { 'landing.headline': 'headline', 'landing.heroImage': 'heroImage' });
    const opts = { onSuccess: () => (toast.success(t('admin.common.saved')), onClose()), onError: (e: unknown) => toast.error(getErrorMessage(e)) };
    if (c) put.mutate({ path: `campaigns/${c.id}`, body: parsed.data }, opts);
    else create.mutate({ path: 'campaigns', body: parsed.data }, opts);
  });
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={c ? t('admin.marketing.editCampaign') : t('admin.marketing.newCampaign')}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={create.isPending || put.isPending} onClick={() => void submit()}>
            {t('admin.common.save')}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('admin.marketing.name')} required error={errors.name?.message}>
            <Input {...form.register('name')} />
          </FormField>
          <FormField label={t('admin.catalog.slug')} required error={errors.slug?.message}>
            <Input dir="ltr" {...form.register('slug')} />
          </FormField>
          <FormField label={t('admin.marketing.starts')} required error={errors.startsAt?.message}>
            <Input type="datetime-local" {...form.register('startsAt')} />
          </FormField>
          <FormField label={t('admin.marketing.ends')} required error={errors.endsAt?.message}>
            <Input type="datetime-local" {...form.register('endsAt')} />
          </FormField>
        </div>
        <FormField label={t('admin.marketing.banner')} error={errors.banner?.message}>
          <ImageUpload label={t('admin.marketing.banner')} value={form.watch('banner')} onChange={(v) => form.setValue('banner', v)} />
        </FormField>
        <FormField label={t('admin.marketing.description')}>
          <Textarea rows={2} {...form.register('description')} />
        </FormField>
        <fieldset className="grid gap-3 rounded-lg border border-border p-4">
          <legend className="px-1 text-sm font-bold text-fg">{t('admin.marketing.landing')}</legend>
          <FormField label={t('admin.marketing.headline')} error={errors.headline?.message}>
            <Input {...form.register('headline')} />
          </FormField>
          <FormField label={t('admin.marketing.subheadline')}>
            <Input {...form.register('subheadline')} />
          </FormField>
          <FormField label={t('admin.marketing.heroImage')} error={errors.heroImage?.message}>
            <ImageUpload label={t('admin.marketing.heroImage')} value={form.watch('heroImage')} onChange={(v) => form.setValue('heroImage', v)} />
          </FormField>
          <FormField label={t('admin.marketing.body')}>
            <Textarea rows={4} {...form.register('body')} />
          </FormField>
        </fieldset>
      </form>
    </Modal>
  );
}

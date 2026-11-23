import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { BadgeCheck, Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { adminBrandSchema } from '@souqly/shared';
import { useAdminGet, useAdminMutation, type AdminBrand } from '@/api/admin';
import { getErrorMessage } from '@/api/client';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { DataTable, type Column } from '@/components/admin/DataTable';
import { FilterBar } from '@/components/admin/FilterBar';
import { PageHeader } from '@/components/admin/PageHeader';
import { applyZodErrors } from '@/components/admin/zodForm';
import { Avatar, Badge, Button, FormField, IconButton, Input, Modal, Switch, Textarea } from '@/components/ui';

export default function BrandsPage() {
  const { t } = useTranslation();
  const q = useAdminGet<AdminBrand[]>('brands');
  const del = useAdminMutation('delete', ['brands']);
  const [edit, setEdit] = useState<AdminBrand | 'new' | null>(null);
  const [remove, setRemove] = useState<AdminBrand | null>(null);
  const [search, setSearch] = useState('');
  const s = search.trim().toLowerCase();
  const rows = (q.data ?? []).filter((b) => !s || b.name.toLowerCase().includes(s) || b.slug.includes(s));

  const columns: Column<AdminBrand>[] = [
    {
      key: 'name',
      header: t('admin.brands.brand'),
      cell: (b) => (
        <div className="flex items-center gap-3">
          <Avatar src={b.logo} name={b.name} size="sm" />
          <div>
            <p className="font-semibold text-fg">{b.name}</p>
            <p className="text-xs text-fg-muted" dir="ltr">
              /brand/{b.slug}
            </p>
          </div>
        </div>
      ),
    },
    { key: 'desc', header: t('admin.brands.description'), cell: (b) => <span className="line-clamp-1 max-w-md text-fg-muted">{b.description ?? '—'}</span> },
    { key: 'featured', header: t('admin.brands.featured'), cell: (b) => (b.isFeatured ? <Badge tone="accent" size="sm"><BadgeCheck className="size-3" />{t('admin.brands.featured')}</Badge> : '—') },
    {
      key: 'actions',
      header: '',
      align: 'end',
      cell: (b) => (
        <div className="flex justify-end">
          <IconButton size="sm" variant="ghost" label={t('common.edit')} onClick={() => setEdit(b)}>
            <Pencil className="size-4" />
          </IconButton>
          <IconButton size="sm" variant="ghost" label={t('common.delete')} onClick={() => setRemove(b)}>
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t('admin.nav.brands')}
        description={t('admin.brands.subtitle')}
        crumbs={[{ label: t('admin.nav.catalog') }]}
        actions={
          <Button size="sm" leftIcon={<Plus className="size-4" />} onClick={() => setEdit('new')}>
            {t('admin.brands.new')}
          </Button>
        }
      />
      <FilterBar q={search} onQ={setSearch} placeholder={t('admin.brands.search')} />
      <DataTable rows={rows} columns={columns} rowKey={(b) => b.id} isLoading={q.isLoading} error={q.error} onRetry={() => void q.refetch()} empty={{ title: t('admin.brands.empty'), icon: <Tags /> }} />
      {edit && <BrandForm brand={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
      {remove && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setRemove(null)}
          title={t('admin.brands.deleteTitle', { name: remove.name })}
          description={t('admin.brands.deleteDesc')}
          confirmLabel={t('common.delete')}
          tone="danger"
          loading={del.isPending}
          onConfirm={() => del.mutate({ path: `brands/${remove.id}` }, { onSuccess: () => (toast.success(t('admin.common.deleted')), setRemove(null)), onError: (e) => toast.error(getErrorMessage(e)) })}
        />
      )}
    </>
  );
}

type Values = { name: string; slug: string; logo: string; description: string; isFeatured: boolean };

function BrandForm({ brand, onClose }: { brand?: AdminBrand; onClose: () => void }) {
  const { t } = useTranslation();
  const create = useAdminMutation('post', ['brands']);
  const update = useAdminMutation('patch', ['brands']);
  const form = useForm<Values>({ defaultValues: { name: brand?.name ?? '', slug: brand?.slug ?? '', logo: brand?.logo ?? '', description: brand?.description ?? '', isFeatured: brand?.isFeatured ?? false } });
  const { errors } = form.formState;
  const submit = form.handleSubmit((v) => {
    const parsed = adminBrandSchema.safeParse({ ...v, logo: v.logo.trim() || undefined, description: v.description.trim() || undefined });
    if (!parsed.success) return void applyZodErrors(form, parsed.error);
    const opts = { onSuccess: () => (toast.success(t('admin.common.saved')), onClose()), onError: (e: unknown) => toast.error(getErrorMessage(e)) };
    if (brand) update.mutate({ path: `brands/${brand.id}`, body: parsed.data }, opts);
    else create.mutate({ path: 'brands', body: parsed.data }, opts);
  });
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={brand ? t('admin.brands.edit') : t('admin.brands.new')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={create.isPending || update.isPending} onClick={() => void submit()}>
            {t('admin.common.save')}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('admin.brands.name')} required error={errors.name?.message}>
            <Input {...form.register('name')} />
          </FormField>
          <FormField label={t('admin.catalog.slug')} required error={errors.slug?.message}>
            <Input dir="ltr" {...form.register('slug')} />
          </FormField>
        </div>
        <FormField label={t('admin.brands.logo')} error={errors.logo?.message}>
          <Input dir="ltr" placeholder="https://…" {...form.register('logo')} />
        </FormField>
        <FormField label={t('admin.brands.description')} error={errors.description?.message}>
          <Textarea rows={3} {...form.register('description')} />
        </FormField>
        <Switch checked={form.watch('isFeatured')} onCheckedChange={(v) => form.setValue('isFeatured', v)} label={t('admin.brands.featured')} />
      </form>
    </Modal>
  );
}

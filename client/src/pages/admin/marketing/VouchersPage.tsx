import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Pencil, Plus, Ticket, Trash2 } from 'lucide-react';
import { adminVoucherSchema } from '@souqly/shared';
import { useAdminGet, useAdminMutation, type AdminVoucher } from '@/api/admin';
import { getErrorMessage } from '@/api/client';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { DataTable, type Column } from '@/components/admin/DataTable';
import { fromLocalInput, toLocalInput, windowState } from '@/components/admin/dates';
import { PageHeader } from '@/components/admin/PageHeader';
import { StatusPill } from '@/components/admin/StatusPill';
import { applyZodErrors } from '@/components/admin/zodForm';
import { Button, FormField, IconButton, Input, Modal, Select, Switch } from '@/components/ui';
import { useLang } from '@/lib/catalog';
import { formatDate, money } from '@/lib/format';

export default function VouchersPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const q = useAdminGet<AdminVoucher[]>('vouchers');
  const del = useAdminMutation('delete', ['vouchers']);
  const [edit, setEdit] = useState<AdminVoucher | 'new' | null>(null);
  const [remove, setRemove] = useState<AdminVoucher | null>(null);
  const value = (v: AdminVoucher) => (v.type === 'percent' ? `${v.value / 100}%` : v.type === 'fixed' ? money(v.value) : t('admin.marketing.types.free_shipping'));

  const columns: Column<AdminVoucher>[] = [
    { key: 'code', header: t('admin.marketing.code'), cell: (v) => <span className="latin rounded bg-surface-2 px-2 py-1 font-mono text-xs font-bold">{v.code}</span> },
    { key: 'title', header: t('admin.marketing.title'), cell: (v) => <span className="text-fg">{v.title ?? '—'}</span> },
    { key: 'value', header: t('admin.marketing.value'), cell: (v) => <span className="font-semibold" dir="ltr">{value(v)}</span> },
    { key: 'min', header: t('admin.marketing.minSpend'), align: 'end', cell: (v) => <span dir="ltr">{money(v.minSpend)}</span> },
    { key: 'used', header: t('admin.marketing.used'), align: 'end', cell: (v) => <span className="tabular">{v.usedCount ?? 0}{v.usageLimit ? ` / ${v.usageLimit}` : ''}</span> },
    { key: 'state', header: t('admin.common.status'), cell: (v) => <StatusPill status={v.isActive ? windowState(v.startsAt, v.endsAt) : 'inactive'} /> },
    { key: 'ends', header: t('admin.marketing.ends'), cell: (v) => <span className="text-fg-muted">{formatDate(v.endsAt, lang)}</span> },
    {
      key: 'a',
      header: '',
      align: 'end',
      cell: (v) => (
        <div className="flex justify-end">
          <IconButton size="sm" variant="ghost" label={t('common.edit')} onClick={() => setEdit(v)}>
            <Pencil className="size-4" />
          </IconButton>
          <IconButton size="sm" variant="ghost" label={t('common.delete')} onClick={() => setRemove(v)}>
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t('admin.nav.vouchers')}
        description={t('admin.marketing.vouchersSub')}
        crumbs={[{ label: t('admin.nav.marketing') }]}
        actions={
          <Button size="sm" leftIcon={<Plus className="size-4" />} onClick={() => setEdit('new')}>
            {t('admin.marketing.newVoucher')}
          </Button>
        }
      />
      <DataTable rows={q.data ?? []} columns={columns} rowKey={(v) => v.id} isLoading={q.isLoading} error={q.error} onRetry={() => void q.refetch()} empty={{ title: t('admin.marketing.noVouchers'), icon: <Ticket /> }} />
      {edit && <VoucherForm voucher={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
      {remove && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setRemove(null)}
          title={t('admin.marketing.deleteTitle', { name: remove.code })}
          confirmLabel={t('common.delete')}
          tone="danger"
          loading={del.isPending}
          onConfirm={() => del.mutate({ path: `vouchers/${remove.id}` }, { onSuccess: () => (toast.success(t('admin.common.deleted')), setRemove(null)), onError: (e) => toast.error(getErrorMessage(e)) })}
        />
      )}
    </>
  );
}

type Values = { code: string; title: string; type: AdminVoucher['type']; value: string; minSpend: string; maxDiscount: string; startsAt: string; endsAt: string; usageLimit: string; perUserLimit: string; isActive: boolean };

function VoucherForm({ voucher: v, onClose }: { voucher?: AdminVoucher; onClose: () => void }) {
  const { t } = useTranslation();
  const create = useAdminMutation('post', ['vouchers']);
  const put = useAdminMutation('put', ['vouchers']);
  const form = useForm<Values>({
    defaultValues: {
      code: v?.code ?? '',
      title: v?.title ?? '',
      type: v?.type ?? 'percent',
      value: v ? String(v.type === 'percent' ? v.value / 100 : v.value / 100) : '10',
      minSpend: v ? String(v.minSpend / 100) : '0',
      maxDiscount: v?.maxDiscount !== undefined ? String(v.maxDiscount / 100) : '',
      startsAt: toLocalInput(v?.startsAt),
      endsAt: toLocalInput(v?.endsAt),
      usageLimit: String(v?.usageLimit ?? 0),
      perUserLimit: String(v?.perUserLimit ?? 1),
      isActive: v?.isActive ?? true,
    },
  });
  const { errors } = form.formState;
  const type = form.watch('type');
  const submit = form.handleSubmit((x) => {
    // percent is stored in basis points, money values in paisa → both are ×100 from the form.
    const parsed = adminVoucherSchema.safeParse({
      code: x.code,
      title: x.title.trim() || undefined,
      type: x.type,
      value: x.type === 'free_shipping' ? 0 : Math.round(Number(x.value) * 100),
      minSpend: Math.round(Number(x.minSpend || 0) * 100),
      maxDiscount: x.maxDiscount ? Math.round(Number(x.maxDiscount) * 100) : undefined,
      startsAt: fromLocalInput(x.startsAt),
      endsAt: fromLocalInput(x.endsAt),
      usageLimit: Number(x.usageLimit || 0),
      perUserLimit: Number(x.perUserLimit || 1),
      isActive: x.isActive,
    });
    if (!parsed.success) return void applyZodErrors(form, parsed.error);
    const opts = { onSuccess: () => (toast.success(t('admin.common.saved')), onClose()), onError: (e: unknown) => toast.error(getErrorMessage(e)) };
    if (v) put.mutate({ path: `vouchers/${v.id}`, body: parsed.data }, opts);
    else create.mutate({ path: 'vouchers', body: parsed.data }, opts);
  });
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={v ? t('admin.marketing.editVoucher') : t('admin.marketing.newVoucher')}
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
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <FormField label={t('admin.marketing.code')} required error={errors.code?.message}>
          <Input dir="ltr" className="uppercase" {...form.register('code')} />
        </FormField>
        <FormField label={t('admin.marketing.title')} error={errors.title?.message}>
          <Input {...form.register('title')} />
        </FormField>
        <FormField label={t('admin.marketing.type')}>
          <Select value={type} onValueChange={(x) => form.setValue('type', x as Values['type'])} options={(['percent', 'fixed', 'free_shipping'] as const).map((x) => ({ value: x, label: t(`admin.marketing.types.${x}`) }))} />
        </FormField>
        {type !== 'free_shipping' && (
          <FormField label={type === 'percent' ? t('admin.marketing.percentOff') : t('admin.marketing.amountOff')} required error={errors.value?.message}>
            <Input type="number" min={0} step="0.01" {...form.register('value')} />
          </FormField>
        )}
        <FormField label={t('admin.marketing.minSpend')} error={errors.minSpend?.message}>
          <Input type="number" min={0} {...form.register('minSpend')} />
        </FormField>
        <FormField label={t('admin.marketing.maxDiscount')} error={errors.maxDiscount?.message}>
          <Input type="number" min={0} {...form.register('maxDiscount')} />
        </FormField>
        <FormField label={t('admin.marketing.starts')} required error={errors.startsAt?.message}>
          <Input type="datetime-local" {...form.register('startsAt')} />
        </FormField>
        <FormField label={t('admin.marketing.ends')} required error={errors.endsAt?.message}>
          <Input type="datetime-local" {...form.register('endsAt')} />
        </FormField>
        <FormField label={t('admin.marketing.usageLimit')} hint={t('admin.marketing.zeroUnlimited')}>
          <Input type="number" min={0} {...form.register('usageLimit')} />
        </FormField>
        <FormField label={t('admin.marketing.perUser')}>
          <Input type="number" min={1} {...form.register('perUserLimit')} />
        </FormField>
        <div className="sm:col-span-2">
          <Switch checked={form.watch('isActive')} onCheckedChange={(x) => form.setValue('isActive', x)} label={t('admin.marketing.activeVoucher')} />
        </div>
      </form>
    </Modal>
  );
}

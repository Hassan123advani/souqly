import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { Pencil, Plus, Ticket, Users } from 'lucide-react';
import { sellerVoucherSchema, sellerVoucherUpdateSchema } from '@souqly/shared';
import { getErrorMessage } from '@/api/client';
import { useMarketingList, useSaveMarketing, type StoreVoucher } from '@/api/growth';
import { Badge, Button, Card, FormField, IconButton, Input, Modal, Select, Switch } from '@/components/ui';
import { CategoryMultiSelect } from '@/components/seller/CategoryMultiSelect';
import { money } from '@/lib/format';
import { translateError } from '@/lib/validation';
import { ProductChips, ProductSearchAdd } from '../growth/ProductPicker';
import { defaultWindow, firstIssue, fromLocalInput, minorToInput, rupeesToMinor, toLocalInput } from '../growth/utils';
import { DeleteMarketing, ListState, WindowBadge, WindowText } from './common';

export function voucherValueText(v: Pick<StoreVoucher, 'type' | 'value'>, t: (k: string, o?: Record<string, unknown>) => string) {
  if (v.type === 'percent') return t('growth.vouchers.percentOff', { n: v.value / 100 });
  if (v.type === 'fixed') return t('growth.vouchers.amountOff', { amount: money(v.value) });
  return t('growth.vouchers.freeShipping');
}

export function VouchersTab() {
  const { t } = useTranslation();
  const list = useMarketingList('vouchers');
  const [editing, setEditing] = useState<StoreVoucher | 'new' | null>(null);
  const add = (
    <Button size="sm" leftIcon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
      {t('growth.vouchers.add')}
    </Button>
  );
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">{t('growth.vouchers.hint')}</p>
        {add}
      </div>
      <ListState query={list} empty={{ icon: <Ticket />, title: t('growth.vouchers.empty'), description: t('growth.vouchers.emptyBody'), action: add }}>
        {(rows) => (
          <div className="grid gap-3 md:grid-cols-2">
            {rows.map((v) => (
              <Card key={v.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-base font-extrabold tracking-wide text-primary-700" dir="ltr">
                      {v.code}
                    </p>
                    {v.title && <p className="truncate text-sm text-fg">{v.title}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <WindowBadge {...v} />
                    <IconButton label={t('seller.common.edit')} size="sm" variant="ghost" onClick={() => setEditing(v)}>
                      <Pencil className="size-4" />
                    </IconButton>
                    <DeleteMarketing kind="vouchers" id={v.id} name={v.code} />
                  </div>
                </div>
                <p className="mt-2 text-sm font-semibold text-fg">
                  {voucherValueText(v, t)}
                  {v.minSpend > 0 && <span className="font-normal text-fg-muted"> · {t('growth.vouchers.minSpendN', { amount: money(v.minSpend) })}</span>}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                  <WindowText startsAt={v.startsAt} endsAt={v.endsAt} />
                  <span>·</span>
                  <span>{v.usageLimit ? t('growth.vouchers.usedOf', { used: v.usedCount, max: v.usageLimit }) : t('growth.vouchers.usedN', { used: v.usedCount })}</span>
                  {v.followerOnly && (
                    <Badge tone="accent" size="sm">
                      <Users className="size-3" /> {t('growth.vouchers.followerOnly')}
                    </Badge>
                  )}
                  {v.productIds.length > 0 && (
                    <Badge size="sm">{t('growth.vouchers.productsN', { count: v.productIds.length })}</Badge>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </ListState>
      <VoucherDialog voucher={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

const formSchema = z
  .object({
    code: z.string().trim().min(3).max(32),
    title: z.string().trim().max(120).optional(),
    type: z.enum(['percent', 'fixed', 'free_shipping']),
    value: z.string().optional(),
    minSpend: z.string().optional(),
    maxDiscount: z.string().optional(),
    startsAt: z.string().min(1),
    endsAt: z.string().min(1),
    usageLimit: z.coerce.number().int().min(0).max(1_000_000),
    perUserLimit: z.coerce.number().int().min(1).max(100),
    followerOnly: z.boolean(),
    isActive: z.boolean(),
  })
  .refine((v) => v.type === 'free_shipping' || (Number(v.value) > 0 && (v.type !== 'percent' || Number(v.value) <= 90)), {
    message: 'validation.growth.voucherValue',
    path: ['value'],
  })
  .refine((v) => new Date(v.endsAt) > new Date(v.startsAt), { message: 'validation.growth.endAfterStart', path: ['endsAt'] });
type FormIn = z.input<typeof formSchema>;
type FormOut = z.output<typeof formSchema>;

function VoucherDialog({ voucher, onClose }: { voucher: StoreVoucher | 'new' | null; onClose: () => void }) {
  const { t } = useTranslation();
  const save = useSaveMarketing('vouchers');
  const isNew = voucher === 'new';
  const v = voucher && voucher !== 'new' ? voucher : null;
  const [productIds, setProductIds] = useState<string[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [lastOpen, setLastOpen] = useState<typeof voucher>(null);
  if (voucher !== lastOpen) {
    setLastOpen(voucher);
    setProductIds(v?.productIds ?? []);
    setCategoryIds(v?.categoryIds ?? []);
  }
  const win = defaultWindow(7);
  const form = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(formSchema),
    values: {
      code: v?.code ?? '',
      title: v?.title ?? '',
      type: v?.type ?? 'percent',
      value: v ? (v.type === 'percent' ? String(v.value / 100) : v.type === 'fixed' ? minorToInput(v.value) : '') : '',
      minSpend: minorToInput(v?.minSpend, true),
      maxDiscount: minorToInput(v?.maxDiscount, true),
      startsAt: v ? toLocalInput(v.startsAt) : win.startsAt,
      endsAt: v ? toLocalInput(v.endsAt) : win.endsAt,
      usageLimit: v?.usageLimit ?? 0,
      perUserLimit: v?.perUserLimit ?? 1,
      followerOnly: v?.followerOnly ?? false,
      isActive: v?.isActive ?? true,
    },
  });
  const { register, control, handleSubmit, watch, formState } = form;
  const type = watch('type');
  const err = (m?: string) => translateError(m);

  const submit = handleSubmit((f) => {
    const value = f.type === 'percent' ? Math.round(Number(f.value) * 100) : f.type === 'fixed' ? (rupeesToMinor(f.value) ?? 0) : 0;
    const common = {
      title: f.title || undefined,
      value,
      minSpend: rupeesToMinor(f.minSpend) ?? 0,
      ...(f.type === 'percent' && rupeesToMinor(f.maxDiscount) ? { maxDiscount: rupeesToMinor(f.maxDiscount)! } : {}),
      startsAt: fromLocalInput(f.startsAt),
      endsAt: fromLocalInput(f.endsAt),
      usageLimit: f.usageLimit,
      perUserLimit: f.perUserLimit,
      followerOnly: f.followerOnly,
      productIds,
      categoryIds,
      isActive: f.isActive,
    };
    const parsed = isNew ? sellerVoucherSchema.safeParse({ ...common, code: f.code, type: f.type }) : sellerVoucherUpdateSchema.safeParse(common);
    if (!parsed.success) return void toast.error(firstIssue(parsed.error));
    save.mutate(
      { id: v?.id, body: { ...common, ...(isNew ? { code: f.code.toUpperCase(), type: f.type } : {}) } },
      {
        onSuccess: () => {
          toast.success(t('seller.common.saved'));
          onClose();
        },
        onError: (e) => toast.error(getErrorMessage(e)),
      },
    );
  });

  return (
    <Modal
      open={!!voucher}
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={isNew ? t('growth.vouchers.add') : t('growth.vouchers.edit')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('seller.common.cancel')}
          </Button>
          <Button onClick={() => void submit()} loading={save.isPending}>
            {t('seller.common.save')}
          </Button>
        </>
      }
    >
      <form className="grid gap-4" onSubmit={(e) => void submit(e)} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('growth.vouchers.code')} hint={t('growth.vouchers.codeHint')} error={err(formState.errors.code?.message)} required>
            <Input dir="ltr" className="font-mono uppercase" disabled={!isNew} maxLength={32} {...register('code')} />
          </FormField>
          <FormField label={t('growth.vouchers.titleField')} hint={t('seller.common.optional')}>
            <Input maxLength={120} {...register('title')} />
          </FormField>
          <FormField label={t('growth.vouchers.type')}>
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={!isNew}
                  options={(['percent', 'fixed', 'free_shipping'] as const).map((k) => ({ value: k, label: t(`growth.vouchers.types.${k}`) }))}
                />
              )}
            />
          </FormField>
          {type !== 'free_shipping' && (
            <FormField label={type === 'percent' ? t('growth.vouchers.percent') : t('growth.vouchers.amount')} error={err(formState.errors.value?.message)} required>
              <Input inputMode="decimal" dir="ltr" {...register('value')} />
            </FormField>
          )}
          <FormField label={t('growth.vouchers.minSpend')} hint={t('growth.common.rupees')}>
            <Input inputMode="decimal" dir="ltr" {...register('minSpend')} />
          </FormField>
          {type === 'percent' && (
            <FormField label={t('growth.vouchers.maxDiscount')} hint={t('growth.vouchers.maxDiscountHint')}>
              <Input inputMode="decimal" dir="ltr" {...register('maxDiscount')} />
            </FormField>
          )}
          <FormField label={t('growth.common.startsAt')} error={err(formState.errors.startsAt?.message)} required>
            <Input type="datetime-local" dir="ltr" {...register('startsAt')} />
          </FormField>
          <FormField label={t('growth.common.endsAt')} error={err(formState.errors.endsAt?.message)} required>
            <Input type="datetime-local" dir="ltr" {...register('endsAt')} />
          </FormField>
          <FormField label={t('growth.vouchers.usageLimit')} hint={t('growth.vouchers.usageLimitHint')} error={err(formState.errors.usageLimit?.message)}>
            <Input inputMode="numeric" dir="ltr" {...register('usageLimit')} />
          </FormField>
          <FormField label={t('growth.vouchers.perUser')} error={err(formState.errors.perUserLimit?.message)}>
            <Input inputMode="numeric" dir="ltr" {...register('perUserLimit')} />
          </FormField>
        </div>
        <Controller
          control={control}
          name="followerOnly"
          render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} label={t('growth.vouchers.followerOnly')} description={t('growth.vouchers.followerOnlyHint')} />
          )}
        />
        <Controller
          control={control}
          name="isActive"
          render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} label={t('growth.common.active')} />}
        />
        <FormField label={t('growth.vouchers.limitProducts')} hint={t('growth.vouchers.limitProductsHint')}>
          <div className="grid gap-2">
            <ProductSearchAdd exclude={productIds} disabled={productIds.length >= 200} onAdd={(p) => setProductIds((ids) => [...ids, p.id])} />
            <ProductChips ids={productIds} onRemove={(id) => setProductIds((ids) => ids.filter((x) => x !== id))} />
          </div>
        </FormField>
        <details className="rounded-md border border-border p-3">
          <summary className="cursor-pointer text-sm font-semibold text-fg">
            {t('growth.vouchers.limitCategories')} {categoryIds.length > 0 && `(${categoryIds.length})`}
          </summary>
          <div className="mt-3">
            <CategoryMultiSelect value={categoryIds} onChange={setCategoryIds} max={50} />
          </div>
        </details>
      </form>
    </Modal>
  );
}

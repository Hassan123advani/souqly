import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { STOCK_ADJUST_REASONS, inventoryAdjustSchema, type InventoryRow } from '@souqly/shared';
import { getErrorMessage } from '@/api/client';
import { useAdjustStock, useWarehouses } from '@/api/seller';
import { Button, FormField, Input, Modal, Select } from '@/components/ui';
import { translateError } from '@/lib/validation';

// The shared schema validates ids + delta; the dialog adds a direction so sellers type positive numbers.
const formSchema = z.object({
  direction: z.enum(['add', 'remove']),
  qty: z.coerce.number().int().min(1).max(1_000_000),
  reason: z.enum(STOCK_ADJUST_REASONS),
  warehouseId: z.string().optional(),
  note: z.string().trim().max(300).optional(),
});
type FormIn = z.input<typeof formSchema>;
type FormOut = z.output<typeof formSchema>;

export function AdjustStockDialog({ row, onClose }: { row: InventoryRow | null; onClose: () => void }) {
  const { t } = useTranslation();
  const adjust = useAdjustStock();
  const wh = useWarehouses();
  const form = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(formSchema),
    values: { direction: 'add', qty: 1, reason: 'restock', warehouseId: undefined, note: '' },
  });
  const { register, control, handleSubmit, watch, formState } = form;
  const dir = watch('direction');
  const qty = Number(watch('qty')) || 0;

  const submit = handleSubmit((v) => {
    if (!row) return;
    const body = inventoryAdjustSchema.parse({
      productId: row.productId,
      variantId: row.variantId,
      warehouseId: v.warehouseId || undefined,
      delta: v.direction === 'add' ? v.qty : -v.qty,
      reason: v.reason,
      note: v.note || undefined,
    });
    adjust.mutate(body, {
      onSuccess: (r) => {
        toast.success(t('seller.inventory.adjusted', { n: r.balanceAfter }));
        onClose();
      },
      onError: (e) => toast.error(getErrorMessage(e)),
    });
  });

  const after = row ? row.stock + (dir === 'add' ? qty : -qty) : 0;
  return (
    <Modal
      open={!!row}
      onOpenChange={(o) => !o && onClose()}
      title={t('seller.inventory.adjustTitle')}
      description={row ? `${row.title}${Object.keys(row.options).length ? ` · ${Object.values(row.options).join(' / ')}` : ''}` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('seller.common.cancel')}
          </Button>
          <Button onClick={() => void submit()} loading={adjust.isPending} disabled={after < 0}>
            {t('seller.inventory.apply')}
          </Button>
        </>
      }
    >
      <form className="grid gap-4" onSubmit={(e) => void submit(e)} noValidate>
        <div className="grid grid-cols-2 gap-3">
          <FormField label={t('seller.inventory.direction')}>
            <Controller
              control={control}
              name="direction"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  options={[
                    { value: 'add', label: t('seller.inventory.add') },
                    { value: 'remove', label: t('seller.inventory.remove') },
                  ]}
                />
              )}
            />
          </FormField>
          <FormField label={t('seller.inventory.qty')} error={translateError(formState.errors.qty?.message)}>
            <Input inputMode="numeric" dir="ltr" {...register('qty')} />
          </FormField>
        </div>
        <FormField label={t('seller.inventory.reason')}>
          <Controller
            control={control}
            name="reason"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} options={STOCK_ADJUST_REASONS.map((r) => ({ value: r, label: t(`seller.inventory.reasons.${r}`) }))} />
            )}
          />
        </FormField>
        {!!wh.data?.length && (
          <FormField label={t('seller.inventory.warehouse')} hint={t('seller.common.optional')}>
            <Controller
              control={control}
              name="warehouseId"
              render={({ field }) => (
                <Select value={field.value ?? ''} onValueChange={field.onChange} placeholder={t('seller.inventory.defaultWarehouse')} options={wh.data.map((w) => ({ value: w.id, label: w.name }))} />
              )}
            />
          </FormField>
        )}
        <FormField label={t('seller.inventory.note')} hint={t('seller.common.optional')}>
          <Input maxLength={300} {...register('note')} />
        </FormField>
        {row && (
          <p className={after < 0 ? 'text-sm font-semibold text-danger' : 'text-sm text-fg-muted'}>
            {after < 0 ? t('seller.inventory.belowZero') : t('seller.inventory.preview', { from: row.stock, to: after })}
          </p>
        )}
      </form>
    </Modal>
  );
}

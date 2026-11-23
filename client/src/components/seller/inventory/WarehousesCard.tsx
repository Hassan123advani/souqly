import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Pencil, Plus, Star, Trash2, Warehouse } from 'lucide-react';
import { warehouseCreateSchema, type WarehouseDTO } from '@souqly/shared';
import type { z } from 'zod';
import { getErrorMessage } from '@/api/client';
import { useDeleteWarehouse, useSaveWarehouse, useWarehouses } from '@/api/seller';
import { Badge, Button, Card, CardHeader, Checkbox, EmptyState, ErrorState, FormField, IconButton, Input, Modal, Skeleton } from '@/components/ui';
import { fieldError } from '../forms/fieldError';

type WOut = z.output<typeof warehouseCreateSchema>;

function WarehouseModal({ editing, onClose }: { editing: WarehouseDTO | 'new' | null; onClose: () => void }) {
  const { t } = useTranslation();
  const save = useSaveWarehouse();
  const w = editing && editing !== 'new' ? editing : null;
  const form = useForm<WOut>({
    resolver: zodResolver(warehouseCreateSchema),
    values: { name: w?.name ?? '', address: { city: w?.address.city ?? '', line1: w?.address.line1 ?? '', area: w?.address.area ?? '' }, isDefault: w?.isDefault ?? false },
  });
  const err = (k: string) => fieldError(form.formState.errors, k);
  const submit = form.handleSubmit((v) => {
    // PATCH only accepts `isDefault: true` (a default cannot be unset directly).
    const body = w ? { name: v.name, address: v.address, ...(v.isDefault && !w.isDefault ? { isDefault: true as const } : {}) } : v;
    save.mutate(
      { id: w?.id, body },
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
      open={!!editing}
      onOpenChange={(o) => !o && onClose()}
      title={w ? t('seller.warehouses.edit') : t('seller.warehouses.add')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('seller.common.cancel')}
          </Button>
          <Button loading={save.isPending} onClick={() => void submit()}>
            {t('seller.common.save')}
          </Button>
        </>
      }
    >
      <form className="grid gap-4" onSubmit={(e) => void submit(e)} noValidate>
        <FormField label={t('seller.warehouses.name')} required error={err('name')}>
          <Input {...form.register('name')} />
        </FormField>
        <FormField label={t('seller.contact.line1')} error={err('address.line1')}>
          <Input {...form.register('address.line1')} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label={t('seller.contact.area')} error={err('address.area')}>
            <Input {...form.register('address.area')} />
          </FormField>
          <FormField label={t('seller.contact.city')} required error={err('address.city')}>
            <Input {...form.register('address.city')} />
          </FormField>
        </div>
        <Checkbox {...form.register('isDefault')} label={t('seller.warehouses.makeDefault')} disabled={!!w?.isDefault} />
      </form>
    </Modal>
  );
}

export function WarehousesCard({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation();
  const q = useWarehouses();
  const del = useDeleteWarehouse();
  const [editing, setEditing] = useState<WarehouseDTO | 'new' | null>(null);
  return (
    <Card>
      <CardHeader
        title={t('seller.warehouses.title')}
        description={t('seller.warehouses.hint')}
        action={
          canManage && (
            <Button size="sm" variant="outline" leftIcon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
              {t('seller.warehouses.add')}
            </Button>
          )
        }
      />
      <div className="p-4">
        {q.error ? (
          <ErrorState compact error={q.error} onRetry={() => void q.refetch()} />
        ) : q.isLoading ? (
          <Skeleton className="h-16" />
        ) : !q.data?.length ? (
          <EmptyState compact icon={<Warehouse />} title={t('seller.warehouses.empty')} />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {q.data.map((w) => (
              <li key={w.id} className="flex items-start gap-2 rounded-md border border-border p-3">
                <Warehouse className="mt-0.5 size-4 shrink-0 text-fg-muted" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-fg">
                    {w.name}
                    {w.isDefault && (
                      <Badge tone="accent" size="sm">
                        <Star className="size-3" /> {t('seller.warehouses.default')}
                      </Badge>
                    )}
                  </p>
                  <p className="truncate text-xs text-fg-muted">{[w.address.line1, w.address.area, w.address.city].filter(Boolean).join(', ')}</p>
                </div>
                {canManage && (
                  <>
                    <IconButton label={t('seller.common.edit')} size="sm" variant="ghost" onClick={() => setEditing(w)}>
                      <Pencil className="size-4" />
                    </IconButton>
                    {!w.isDefault && (
                      <IconButton
                        label={t('seller.common.delete')}
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          window.confirm(t('seller.warehouses.confirmDelete', { name: w.name })) &&
                          del.mutate(w.id, { onError: (e) => toast.error(getErrorMessage(e)), onSuccess: () => toast.success(t('seller.common.deleted')) })
                        }
                      >
                        <Trash2 className="size-4" />
                      </IconButton>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <WarehouseModal editing={editing} onClose={() => setEditing(null)} />
    </Card>
  );
}

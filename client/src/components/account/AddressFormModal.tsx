import { lazy, Suspense, useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { z } from 'zod';
import { addressSchema, COUNTRIES } from '@souqly/shared';
import { useMe } from '@/api/auth';
import { useSaveAddress } from '@/api/account';
import { getErrorMessage } from '@/api/client';
import type { Address } from '@/api/types';
import { Button, Checkbox, FormField, Input, Modal, Select, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { translateError } from '@/lib/validation';

const MapPicker = lazy(() => import('@/components/map/MapPicker'));

type Values = z.input<typeof addressSchema>;
const LABELS = ['Home', 'Work', 'Other'] as const;

function emptyValues(name = '', phone = ''): Values {
  return { label: 'Home', fullName: name, phone, country: 'PK', city: '', area: '', line1: '', line2: '', postalCode: '', isDefault: false };
}

export function AddressFormModal({
  open,
  onOpenChange,
  address,
  isFirst,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  address?: Address | null;
  isFirst?: boolean;
}) {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const save = useSaveAddress();
  const form = useForm<Values>({ resolver: zodResolver(addressSchema), defaultValues: emptyValues() });
  const { errors } = form.formState;
  const country = form.watch('country') ?? 'PK';
  const cities = COUNTRIES.find((c) => c.code === country)?.cities ?? [];

  useEffect(() => {
    if (!open) return;
    if (address) {
      const { id: _id, ...rest } = address;
      form.reset({ ...emptyValues(), ...rest });
    } else {
      form.reset({ ...emptyValues(me?.name, me?.phone), isDefault: !!isFirst });
    }
  }, [open, address]);

  const submit = form.handleSubmit((raw) => {
    const body = addressSchema.parse({
      ...raw,
      area: raw.area || undefined,
      line2: raw.line2 || undefined,
      postalCode: raw.postalCode || undefined,
    });
    save.mutate(
      { id: address?.id, body },
      {
        onSuccess: () => {
          toast.success(address ? t('account.addresses.updated') : t('account.addresses.added'));
          onOpenChange(false);
        },
        onError: (e) => toast.error(getErrorMessage(e)),
      },
    );
  });

  const err = (k: keyof Values) => translateError(errors[k]?.message as string | undefined);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={address ? t('account.addresses.editTitle') : t('account.addresses.addTitle')}
      description={t('account.addresses.formHint')}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="address-form" loading={save.isPending}>
            {t('account.addresses.save')}
          </Button>
        </>
      }
    >
      <form id="address-form" onSubmit={submit} className="space-y-4 pb-2" noValidate>
        <Controller
          control={form.control}
          name="label"
          render={({ field }) => (
            <div role="radiogroup" aria-label={t('account.addresses.label')} className="flex flex-wrap gap-2">
              {LABELS.map((l) => (
                <button
                  key={l}
                  type="button"
                  role="radio"
                  aria-checked={field.value === l}
                  onClick={() => field.onChange(l)}
                  className={cn(
                    'h-9 rounded-pill border px-4 text-sm font-semibold transition-colors',
                    field.value === l ? 'border-primary bg-primary-50 text-primary-800' : 'border-border text-fg-muted hover:border-border-strong',
                  )}
                >
                  {t(`account.addresses.labels.${l}`)}
                </button>
              ))}
            </div>
          )}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('form.fullName')} error={err('fullName')} required>
            <Input autoComplete="name" {...form.register('fullName')} />
          </FormField>
          <FormField label={t('form.phone')} error={err('phone') && t('validation.phone')} required>
            <Input type="tel" dir="ltr" className="latin" autoComplete="tel" placeholder="+923001234567" {...form.register('phone')} />
          </FormField>
          <FormField label={t('form.country')} error={err('country')} required>
            <Controller
              control={form.control}
              name="country"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(v) => {
                    field.onChange(v);
                    form.setValue('city', '');
                  }}
                  options={COUNTRIES.map((c) => ({ value: c.code, label: t(`countries.${c.code}`) }))}
                />
              )}
            />
          </FormField>
          <FormField label={t('form.city')} error={err('city')} required>
            <Input list="city-options" autoComplete="address-level2" {...form.register('city')} />
            <datalist id="city-options">
              {cities.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </FormField>
          <FormField label={t('form.area')} error={err('area')}>
            <Input autoComplete="address-level3" {...form.register('area')} />
          </FormField>
          <FormField label={t('form.postalCode')} error={err('postalCode')}>
            <Input autoComplete="postal-code" className="latin" {...form.register('postalCode')} />
          </FormField>
        </div>
        <FormField label={t('form.line1')} error={err('line1')} required>
          <Input autoComplete="address-line1" placeholder={t('account.addresses.line1Placeholder')} {...form.register('line1')} />
        </FormField>
        <FormField label={t('form.line2')} error={err('line2')}>
          <Input autoComplete="address-line2" {...form.register('line2')} />
        </FormField>
        <div>
          <p className="mb-2 text-sm font-semibold text-fg">{t('account.addresses.pin')}</p>
          <Controller
            control={form.control}
            name="location"
            render={({ field }) => (
              <Suspense fallback={<Skeleton className="h-64 w-full rounded-lg sm:h-72" />}>
                {open && <MapPicker value={field.value ?? null} onChange={field.onChange} />}
              </Suspense>
            )}
          />
        </div>
        <Checkbox label={t('account.addresses.makeDefault')} {...form.register('isDefault')} />
      </form>
    </Modal>
  );
}

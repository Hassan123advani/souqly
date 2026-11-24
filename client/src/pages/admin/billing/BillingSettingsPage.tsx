import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Plus, Save, Trash2 } from 'lucide-react';
import { billingSettingsSchema, MANUAL_PAYMENT_CHANNELS, PERMISSIONS, type BillingSettings } from '@souqly/shared';
import { useAdminGet, useAdminMutation } from '@/api/admin';
import type { AdminBillingSettings } from '@/api/billing';
import { getErrorMessage } from '@/api/client';
import { PageHeader } from '@/components/admin/PageHeader';
import { useAdminCan } from '@/components/admin/useAdminCan';
import { Alert, Button, Card, CardBody, CardHeader, ErrorState, FormField, IconButton, Input, Select, Skeleton, Textarea } from '@/components/ui';

const MAX_ACCOUNTS = 5;
const blankAccount = { channel: 'bank' as const, title: '', accountName: '', accountNumber: '', iban: '', instructions: '' };

export default function BillingSettingsPage() {
  const { t } = useTranslation();
  const q = useAdminGet<AdminBillingSettings>('billing/settings');
  return (
    <>
      <PageHeader title={t('billing.admin.nav.settings')} description={t('billing.admin.settings.subtitle')} crumbs={[{ label: t('admin.nav.finance') }, { label: t('billing.admin.nav.overview'), to: '/admin/billing' }]} />
      {q.error ? (
        <Card>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </Card>
      ) : !q.data ? (
        <div className="grid gap-4" aria-busy="true">
          <Skeleton className="h-32" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <SettingsForm initial={q.data} />
      )}
    </>
  );
}

function SettingsForm({ initial }: { initial: AdminBillingSettings }) {
  const { t } = useTranslation();
  const can = useAdminCan();
  const manage = can(PERMISSIONS.ADMIN_BILLING_MANAGE);
  const save = useAdminMutation<BillingSettings, AdminBillingSettings>('put', ['billing']);
  const toForm = (s: AdminBillingSettings): BillingSettings => ({ graceDays: s.graceDays, manualAccounts: s.manualAccounts.map((a) => ({ ...blankAccount, ...a })) });
  const form = useForm<BillingSettings>({ resolver: zodResolver(billingSettingsSchema), defaultValues: toForm(initial) });
  const { register, control, handleSubmit, formState, reset, watch, setValue } = form;
  const accounts = useFieldArray({ control, name: 'manualAccounts' });

  const submit = handleSubmit((v) => {
    const body: BillingSettings = {
      graceDays: v.graceDays,
      manualAccounts: v.manualAccounts.map(({ iban, instructions, ...a }) => ({ ...a, ...(iban?.trim() ? { iban: iban.trim() } : {}), ...(instructions?.trim() ? { instructions: instructions.trim() } : {}) })),
    };
    save.mutate({ path: 'billing/settings', body }, { onSuccess: (r) => (toast.success(t('admin.common.saved')), r && reset(toForm(r))), onError: (e) => toast.error(getErrorMessage(e)) });
  });
  const err = formState.errors;

  return (
    <form onSubmit={(e) => void submit(e)} noValidate>
      <fieldset disabled={!manage} className="grid gap-5">
        {!manage && <Alert tone="info">{t('billing.admin.settings.viewOnly')}</Alert>}
        <Card>
          <CardHeader title={t('billing.admin.settings.cycle')} />
          <CardBody>
            <FormField label={t('billing.admin.settings.graceDays')} hint={t('billing.admin.settings.graceHint')} error={err.graceDays?.message} className="max-w-xs">
              <Input type="number" inputMode="numeric" min={0} max={60} step={1} dir="ltr" {...register('graceDays', { valueAsNumber: true })} />
            </FormField>
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            title={t('billing.admin.settings.accounts')}
            description={t('billing.admin.settings.accountsHint')}
            action={
              manage && (
                <Button type="button" size="sm" variant="outline" leftIcon={<Plus className="size-4" />} disabled={accounts.fields.length >= MAX_ACCOUNTS} onClick={() => accounts.append({ ...blankAccount })}>
                  {t('billing.admin.settings.addAccount')}
                </Button>
              )
            }
          />
          <CardBody className="grid gap-4">
            {accounts.fields.length === 0 && <p className="text-sm text-fg-muted">{t('billing.admin.settings.noAccounts')}</p>}
            {accounts.fields.map((f, i) => {
              const e = err.manualAccounts?.[i];
              return (
                <div key={f.id} className="grid gap-3 rounded-md border border-border p-4 sm:grid-cols-2">
                  <div className="flex items-center justify-between gap-2 sm:col-span-2">
                    <p className="text-sm font-bold text-fg">{t('billing.admin.settings.accountN', { n: i + 1 })}</p>
                    {manage && (
                      <IconButton type="button" size="sm" variant="ghost" label={t('common.delete')} onClick={() => accounts.remove(i)}>
                        <Trash2 className="size-4" />
                      </IconButton>
                    )}
                  </div>
                  <FormField label={t('billing.pay.channel')} required>
                    <Select
                      value={watch(`manualAccounts.${i}.channel`)}
                      onValueChange={(v) => setValue(`manualAccounts.${i}.channel`, v as BillingSettings['manualAccounts'][number]['channel'], { shouldDirty: true })}
                      disabled={!manage}
                      options={MANUAL_PAYMENT_CHANNELS.map((c) => ({ value: c, label: t(`billing.channel.${c}`) }))}
                    />
                  </FormField>
                  <FormField label={t('billing.admin.settings.title')} required error={e?.title?.message}>
                    <Input {...register(`manualAccounts.${i}.title`)} placeholder={t('billing.admin.settings.titlePlaceholder')} />
                  </FormField>
                  <FormField label={t('billing.pay.accountName')} required error={e?.accountName?.message}>
                    <Input {...register(`manualAccounts.${i}.accountName`)} />
                  </FormField>
                  <FormField label={t('billing.pay.accountNumber')} required error={e?.accountNumber?.message}>
                    <Input dir="ltr" {...register(`manualAccounts.${i}.accountNumber`)} />
                  </FormField>
                  <FormField label="IBAN" error={e?.iban?.message}>
                    <Input dir="ltr" {...register(`manualAccounts.${i}.iban`)} />
                  </FormField>
                  <FormField label={t('billing.admin.settings.instructions')} error={e?.instructions?.message} className="sm:col-span-2">
                    <Textarea rows={2} maxLength={500} {...register(`manualAccounts.${i}.instructions`)} />
                  </FormField>
                </div>
              );
            })}
          </CardBody>
        </Card>
        {manage && (
          <div className="flex justify-end">
            <Button type="submit" loading={save.isPending} disabled={!formState.isDirty} leftIcon={<Save className="size-4" />}>
              {t('admin.common.save')}
            </Button>
          </div>
        )}
      </fieldset>
    </form>
  );
}

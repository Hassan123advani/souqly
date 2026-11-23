import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Pencil } from 'lucide-react';
import { businessSchema, payoutSchema, type BusinessInput, type PayoutInput, type SellerStore } from '@souqly/shared';
import { getErrorMessage } from '@/api/client';
import { useUpdateBusiness, useUpdatePayout } from '@/api/seller';
import { Button, Card, CardHeader } from '@/components/ui';
import { BusinessFields } from './BusinessFields';
import { PayoutFields } from './PayoutFields';

function Masked({ rows }: { rows: [string, string | undefined][] }) {
  return (
    <dl className="grid gap-2 text-sm sm:grid-cols-2">
      {rows
        .filter(([, v]) => !!v)
        .map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-fg-muted">{k}</dt>
            <dd className="font-semibold text-fg" dir="ltr">
              {v}
            </dd>
          </div>
        ))}
    </dl>
  );
}

/** Business details: masked summary + edit form (PATCH /seller/store/business, owner only). */
export function BusinessCard({ store, canEdit, startOpen }: { store: SellerStore; canEdit: boolean; startOpen?: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(!!startOpen);
  const save = useUpdateBusiness();
  const b = store.business;
  const form = useForm<BusinessInput>({
    resolver: zodResolver(businessSchema),
    defaultValues: { type: b?.type ?? 'individual', legalName: b?.legalName ?? '', cnicOrRegNo: '', ntn: b?.ntn },
  });
  const submit = form.handleSubmit((v) =>
    save.mutate(v, {
      onSuccess: () => {
        toast.success(store.status === 'rejected' ? t('seller.resubmit.sent') : t('seller.common.saved'));
        setOpen(false);
      },
      onError: (e) => toast.error(getErrorMessage(e)),
    }),
  );
  return (
    <Card>
      <CardHeader
        title={t('seller.business.title')}
        description={t('seller.business.cardHint')}
        action={
          canEdit && !open ? (
            <Button size="sm" variant="outline" leftIcon={<Pencil className="size-4" />} onClick={() => setOpen(true)}>
              {t('seller.common.edit')}
            </Button>
          ) : undefined
        }
      />
      <div className="p-5 sm:p-6">
        {open ? (
          <FormProvider {...form}>
            <form onSubmit={submit} className="grid gap-4" noValidate>
              <BusinessFields />
              <div className="flex gap-2">
                <Button type="submit" loading={save.isPending}>
                  {store.status === 'rejected' ? t('seller.resubmit.submit') : t('seller.common.save')}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  {t('seller.common.cancel')}
                </Button>
              </div>
            </form>
          </FormProvider>
        ) : (
          <Masked
            rows={[
              [t('seller.business.type'), b ? t(`seller.business.types.${b.type}`) : undefined],
              [t('seller.business.legalName'), b?.legalName],
              [t('seller.business.cnicOrReg'), b?.cnicOrRegNo],
              [t('seller.business.ntn'), b?.ntn],
            ]}
          />
        )}
      </div>
    </Card>
  );
}

/** Payout account: masked summary + edit form (PATCH /seller/store/payout). */
export function PayoutCard({ store, canEdit, startOpen }: { store: SellerStore; canEdit: boolean; startOpen?: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(!!startOpen);
  const save = useUpdatePayout();
  const p = store.payout;
  const form = useForm<PayoutInput>({
    resolver: zodResolver(payoutSchema),
    defaultValues: { method: p?.method ?? 'bank', accountTitle: p?.accountTitle ?? '', accountNumber: '', bankName: p?.bankName },
  });
  const submit = form.handleSubmit((v) =>
    save.mutate(v, {
      onSuccess: () => {
        toast.success(store.status === 'rejected' ? t('seller.resubmit.sent') : t('seller.common.saved'));
        setOpen(false);
      },
      onError: (e) => toast.error(getErrorMessage(e)),
    }),
  );
  return (
    <Card>
      <CardHeader
        title={t('seller.payout.title')}
        description={t('seller.payout.cardHint')}
        action={
          canEdit && !open ? (
            <Button size="sm" variant="outline" leftIcon={<Pencil className="size-4" />} onClick={() => setOpen(true)}>
              {t('seller.common.edit')}
            </Button>
          ) : undefined
        }
      />
      <div className="p-5 sm:p-6">
        {open ? (
          <FormProvider {...form}>
            <form onSubmit={submit} className="grid gap-4" noValidate>
              <PayoutFields />
              <div className="flex gap-2">
                <Button type="submit" loading={save.isPending}>
                  {store.status === 'rejected' ? t('seller.resubmit.submit') : t('seller.common.save')}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  {t('seller.common.cancel')}
                </Button>
              </div>
            </form>
          </FormProvider>
        ) : (
          <Masked
            rows={[
              [t('seller.payout.method'), p ? t(`seller.payout.methods.${p.method}`) : undefined],
              [t('seller.payout.accountTitle'), p?.accountTitle],
              [t('seller.payout.bankName'), p?.bankName],
              [t('seller.payout.accountNumber'), p?.accountNumber],
              [t('seller.payout.iban'), p?.iban],
            ]}
          />
        )}
      </div>
    </Card>
  );
}

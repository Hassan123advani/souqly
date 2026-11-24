import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Building2, Clock, CreditCard, Landmark, Paperclip, Wallet, X } from 'lucide-react';
import { MANUAL_PAYMENT_CHANNELS, PERMISSIONS, payInvoiceSchema, type ManualAccount } from '@souqly/shared';
import { usePayInvoice, usePaymentOptions, type InvoiceDetail } from '@/api/billing';
import { getErrorMessage } from '@/api/client';
import { uploadFile } from '@/api/seller';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { useCan } from '@/components/seller/usePermissions';
import { Alert, Badge, Button, Card, CardBody, CardHeader, ErrorState, FormField, IconButton, Input, Select, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger, Textarea } from '@/components/ui';
import { useLang } from '@/lib/catalog';
import { formatDateTime, money } from '@/lib/format';

/** The manual-transfer branch of the shared pay schema (proof is uploaded separately). */
const manualSchema = payInvoiceSchema.options[1].omit({ method: true, proof: true });
type ManualValues = { channel: (typeof MANUAL_PAYMENT_CHANNELS)[number]; reference: string; note?: string };

const newKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/** Pay an open / overdue invoice: Souqly balance, manual bank / wallet transfer, or the online gateway (when configured). */
export function PayInvoicePanel({ invoice }: { invoice: InvoiceDetail }) {
  const { t } = useTranslation();
  const lang = useLang();
  const can = useCan();
  const manage = can(PERMISSIONS.STORE_FINANCE_MANAGE);
  const payable = (invoice.status === 'open' || invoice.status === 'overdue') && invoice.amountDue > 0;
  const options = usePaymentOptions(payable && manage && !invoice.pendingPayment);

  if (!payable) return null;

  if (invoice.pendingPayment) {
    const gateway = invoice.payments.find((p) => p.id === invoice.pendingPayment?.id && p.checkoutUrl);
    return (
      <Alert tone="warning" title={invoice.pendingPayment.method === 'manual' ? t('billing.pay.awaitingTitle') : t('billing.pay.gatewayPendingTitle')}>
        <p>
          {invoice.pendingPayment.method === 'manual'
            ? t('billing.pay.awaitingBody', { date: formatDateTime(invoice.pendingPayment.createdAt, lang) })
            : t('billing.pay.gatewayPendingBody')}
        </p>
        {gateway?.checkoutUrl?.startsWith('https://') && (
          <Button href={gateway.checkoutUrl} size="sm" className="mt-2">
            {t('billing.pay.continueCheckout')}
          </Button>
        )}
      </Alert>
    );
  }

  if (!manage) {
    return (
      <Alert tone="info" title={t('billing.pay.ownerOnly')}>
        {t('billing.pay.ownerOnlyBody')}
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader title={t('billing.pay.title', { amount: money(invoice.amountDue) })} description={t('billing.pay.subtitle')} />
      <CardBody>
        {options.error ? (
          <ErrorState compact error={options.error} onRetry={() => void options.refetch()} />
        ) : !options.data ? (
          <Skeleton className="h-48" />
        ) : (
          <Tabs defaultValue={options.data.balance.available >= invoice.amountDue ? 'balance' : 'manual'}>
            <div className="-mx-1 overflow-x-auto px-1">
              <TabsList className="w-max">
                <TabsTrigger value="balance" icon={<Wallet className="size-4" />}>
                  {t('billing.method.balance')}
                </TabsTrigger>
                <TabsTrigger value="manual" icon={<Landmark className="size-4" />}>
                  {t('billing.method.manual')}
                </TabsTrigger>
                <TabsTrigger value="online" icon={<CreditCard className="size-4" />}>
                  {t('billing.method.gateway')}
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="balance" className="pt-4">
              <BalancePay invoice={invoice} available={options.data.balance.available} />
            </TabsContent>
            <TabsContent value="manual" className="pt-4">
              <ManualPay invoice={invoice} accounts={options.data.manualAccounts} />
            </TabsContent>
            <TabsContent value="online" className="pt-4">
              <OnlinePay invoice={invoice} stripe={options.data.gateways.stripe} />
            </TabsContent>
          </Tabs>
        )}
      </CardBody>
    </Card>
  );
}

function BalancePay({ invoice, available }: { invoice: InvoiceDetail; available: number }) {
  const { t } = useTranslation();
  const pay = usePayInvoice(invoice.id);
  const [open, setOpen] = useState(false);
  const key = useRef(newKey());
  const enough = available >= invoice.amountDue;
  return (
    <div className="grid gap-3">
      <p className="text-sm text-fg-muted">
        {t('billing.pay.available')}{' '}
        <span className="font-bold text-fg" dir="ltr">
          {money(available)}
        </span>
      </p>
      {enough ? (
        <Button className="w-fit" leftIcon={<Wallet className="size-4" />} onClick={() => setOpen(true)}>
          {t('billing.pay.fromBalance', { amount: money(invoice.amountDue) })}
        </Button>
      ) : (
        <Alert tone="info">{t('billing.pay.notEnough', { short: money(invoice.amountDue - Math.max(0, available)) })}</Alert>
      )}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t('billing.pay.confirmBalance', { amount: money(invoice.amountDue) })}
        description={t('billing.pay.confirmBalanceBody', { number: invoice.number })}
        confirmLabel={t('billing.pay.payNow')}
        loading={pay.isPending}
        onConfirm={() =>
          pay.mutate(
            { method: 'balance', idempotencyKey: key.current },
            {
              onSuccess: () => {
                setOpen(false);
                key.current = newKey();
                toast.success(t('billing.pay.paidToast', { number: invoice.number }));
              },
              onError: (e) => toast.error(getErrorMessage(e)),
            },
          )
        }
      />
    </div>
  );
}

const channelIcon = (c: string) => (c === 'bank' ? <Building2 className="size-4" /> : <Wallet className="size-4" />);

function ManualPay({ invoice, accounts }: { invoice: InvoiceDetail; accounts: ManualAccount[] }) {
  const { t } = useTranslation();
  const pay = usePayInvoice(invoice.id);
  const [proof, setProof] = useState<{ url: string; key: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const form = useForm<ManualValues>({
    resolver: zodResolver(manualSchema),
    defaultValues: { channel: accounts[0]?.channel ?? 'bank', reference: '', note: '' },
  });
  const { register, handleSubmit, setValue, watch, formState } = form;

  if (accounts.length === 0) {
    return <Alert tone="info" title={t('billing.pay.noAccountsTitle')}>{t('billing.pay.noAccountsBody')}</Alert>;
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const r = await uploadFile('/uploads/temp', file);
      setProof({ url: r.url, key: r.key, name: file.name });
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const submit = handleSubmit((v) =>
    pay.mutate(
      { method: 'manual', channel: v.channel, reference: v.reference, ...(v.note?.trim() ? { note: v.note.trim() } : {}), ...(proof ? { proof: { url: proof.url, key: proof.key } } : {}) },
      {
        onSuccess: () => toast.success(t('billing.pay.submittedToast')),
        onError: (e) => toast.error(getErrorMessage(e)),
      },
    ),
  );

  return (
    <div className="grid gap-5">
      <div>
        <p className="mb-2 text-sm text-fg-muted">{t('billing.pay.transferTo', { amount: money(invoice.amountDue), number: invoice.number })}</p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {accounts.map((a, i) => (
            <li key={`${a.channel}-${i}`} className="rounded-md border border-border bg-surface-2/50 p-3 text-sm">
              <p className="flex items-center gap-2 font-bold text-fg">
                {channelIcon(a.channel)} {a.title}
                <Badge size="sm">{t(`billing.channel.${a.channel}`)}</Badge>
              </p>
              <dl className="mt-2 grid gap-1">
                <div className="flex justify-between gap-2">
                  <dt className="text-fg-muted">{t('billing.pay.accountName')}</dt>
                  <dd className="font-semibold text-fg">{a.accountName}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-fg-muted">{t('billing.pay.accountNumber')}</dt>
                  <dd className="latin select-all font-mono font-semibold text-fg" dir="ltr">
                    {a.accountNumber}
                  </dd>
                </div>
                {a.iban && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-fg-muted">IBAN</dt>
                    <dd className="latin select-all font-mono text-xs font-semibold text-fg" dir="ltr">
                      {a.iban}
                    </dd>
                  </div>
                )}
              </dl>
              {a.instructions && <p className="mt-2 text-xs text-fg-muted">{a.instructions}</p>}
            </li>
          ))}
        </ul>
      </div>
      <form onSubmit={(e) => void submit(e)} noValidate className="grid gap-4 sm:grid-cols-2">
        <FormField label={t('billing.pay.channel')} required error={formState.errors.channel?.message}>
          <Select value={watch('channel')} onValueChange={(v) => setValue('channel', v as ManualValues['channel'], { shouldValidate: true })} options={MANUAL_PAYMENT_CHANNELS.map((c) => ({ value: c, label: t(`billing.channel.${c}`) }))} />
        </FormField>
        <FormField label={t('billing.pay.reference')} required error={formState.errors.reference?.message} hint={t('billing.pay.referenceHint')}>
          <Input dir="ltr" autoComplete="off" maxLength={80} {...register('reference')} />
        </FormField>
        <FormField label={t('billing.pay.note')} error={formState.errors.note?.message} className="sm:col-span-2">
          <Textarea rows={2} maxLength={500} {...register('note')} />
        </FormField>
        <div className="sm:col-span-2">
          <p className="mb-1.5 text-sm font-semibold text-fg">{t('billing.pay.proof')}</p>
          {proof ? (
            <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
              <Paperclip className="size-4 text-fg-muted" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{proof.name}</span>
              <IconButton size="sm" variant="ghost" label={t('billing.pay.removeProof')} onClick={() => setProof(null)}>
                <X className="size-4" />
              </IconButton>
            </div>
          ) : (
            <>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif,application/pdf" className="sr-only" id="billing-proof" onChange={(e) => void onFile(e.target.files?.[0])} />
              <Button type="button" variant="outline" size="sm" loading={uploading} leftIcon={<Paperclip className="size-4" />} onClick={() => fileRef.current?.click()}>
                {t('billing.pay.attachProof')}
              </Button>
              <p className="mt-1 text-xs text-fg-muted">{t('billing.pay.proofHint')}</p>
            </>
          )}
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" loading={pay.isPending} disabled={uploading}>
            {t('billing.pay.submitTransfer')}
          </Button>
        </div>
      </form>
    </div>
  );
}

function OnlinePay({ invoice, stripe }: { invoice: InvoiceDetail; stripe: boolean }) {
  const { t } = useTranslation();
  const pay = usePayInvoice(invoice.id);
  return (
    <div className="grid gap-3">
      {stripe ? (
        <Button
          className="w-fit"
          leftIcon={<CreditCard className="size-4" />}
          loading={pay.isPending}
          onClick={() =>
            pay.mutate(
              { method: 'gateway', provider: 'stripe' },
              {
                onSuccess: (p) => {
                  if (p.checkoutUrl?.startsWith('https://')) window.location.assign(p.checkoutUrl);
                  else toast.error(t('errors.GENERIC'));
                },
                onError: (e) => toast.error(getErrorMessage(e)),
              },
            )
          }
        >
          {t('billing.pay.payCard', { amount: money(invoice.amountDue) })}
        </Button>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-md border border-dashed border-border p-3 text-sm">
          <span className="font-semibold text-fg">{t('billing.pay.card')}</span>
          <Badge tone="neutral" size="sm">
            <Clock className="size-3" aria-hidden /> {t('billing.pay.comingSoon')}
          </Badge>
        </div>
      )}
      {(['jazzcash', 'easypaisa'] as const).map((g) => (
        <div key={g} className="flex items-center justify-between gap-3 rounded-md border border-dashed border-border p-3 text-sm">
          <span className="font-semibold text-fg">{t(`billing.channel.${g}`)}</span>
          <Badge tone="neutral" size="sm">
            <Clock className="size-3" aria-hidden /> {t('billing.pay.comingSoon')}
          </Badge>
        </div>
      ))}
      <p className="text-xs text-fg-muted">{t('billing.pay.onlineHint')}</p>
    </div>
  );
}

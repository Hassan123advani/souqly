import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { adminApprovePaymentSchema, adminBillingExtendSchema, adminBillingPlanSchema, adminBillingReasonSchema, adminRejectPaymentSchema, adminWaiveSchema, STORE_PLANS, toMinor, type StorePlan } from '@souqly/shared';
import { useAdminMutation } from '@/api/admin';
import { ADMIN_BILLING_GROUPS, type InvoicePayment } from '@/api/billing';
import { getErrorMessage } from '@/api/client';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { FormField, Input, Select } from '@/components/ui';
import { money } from '@/lib/format';
import { usePlanName } from './BillingBadge';

/** Server rule for admin billing reasons (shared `reason` schema: 5..500 chars). */
const REASON_MIN = 5;
const rupees = (v: string) => (v.trim() === '' ? undefined : toMinor(Number(v)));

function useBillingMutation() {
  return useAdminMutation('post', ADMIN_BILLING_GROUPS);
}

/** Waive all or part of an invoice's amount due (mandatory reason, audited server-side). */
export function WaiveDialog({ invoice, onClose }: { invoice: { id: string; number: string; amountDue: number }; onClose: () => void }) {
  const { t } = useTranslation();
  const m = useBillingMutation();
  const [amount, setAmount] = useState('');
  function confirm(reason: string) {
    const parsed = adminWaiveSchema.safeParse({ ...(rupees(amount) !== undefined ? { amount: rupees(amount) } : {}), reason });
    if (!parsed.success || (parsed.data.amount ?? 0) > invoice.amountDue) return void toast.error(t('billing.admin.waive.invalid', { max: money(invoice.amountDue) }));
    m.mutate({ path: `billing/invoices/${invoice.id}/waive`, body: parsed.data }, { onSuccess: () => (toast.success(t('billing.admin.waive.done')), onClose()), onError: (e) => toast.error(getErrorMessage(e)) });
  }
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('billing.admin.waive.title', { number: invoice.number })}
      description={t('billing.admin.waive.body', { amount: money(invoice.amountDue) })}
      confirmLabel={t('billing.admin.waive.confirm')}
      tone="danger"
      reasonLabel={t('billing.admin.reason')}
      reasonRequired
      reasonMin={REASON_MIN}
      loading={m.isPending}
      onConfirm={confirm}
    >
      <FormField label={t('billing.admin.waive.amount')} hint={t('billing.admin.waive.amountHint', { amount: money(invoice.amountDue) })}>
        <Input type="number" inputMode="decimal" min={1} max={invoice.amountDue / 100} dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </FormField>
    </ConfirmDialog>
  );
}

export type StoreAction = 'plan' | 'extend' | 'suspend' | 'reactivate';

/** Admin subscription actions on one store: change plan (no invoice), extend period, suspend / reactivate billing. */
export function StoreBillingActionDialog({ storeId, action, currentPlan, onClose }: { storeId: string; action: StoreAction; currentPlan: StorePlan; onClose: () => void }) {
  const { t } = useTranslation();
  const planName = usePlanName();
  const m = useBillingMutation();
  const [plan, setPlan] = useState<StorePlan>(currentPlan);
  const [days, setDays] = useState('30');

  function confirm(reason: string) {
    const parsed =
      action === 'plan'
        ? adminBillingPlanSchema.safeParse({ plan, reason })
        : action === 'extend'
          ? adminBillingExtendSchema.safeParse({ days: Number(days), reason })
          : adminBillingReasonSchema.safeParse({ reason });
    if (!parsed.success) return void toast.error(parsed.error.issues[0]?.message ?? t('errors.GENERIC'));
    m.mutate({ path: `billing/stores/${storeId}/${action}`, body: parsed.data }, { onSuccess: () => (toast.success(t(`billing.admin.actions.${action}Done`)), onClose()), onError: (e) => toast.error(getErrorMessage(e)) });
  }

  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t(`billing.admin.actions.${action}`)}
      description={t(`billing.admin.actions.${action}Body`)}
      confirmLabel={t(`billing.admin.actions.${action}`)}
      tone={action === 'suspend' ? 'danger' : 'primary'}
      reasonLabel={t('billing.admin.reason')}
      reasonRequired
      reasonMin={REASON_MIN}
      loading={m.isPending}
      onConfirm={confirm}
    >
      {action === 'plan' && (
        <FormField label={t('billing.invoice.plan')} required>
          <Select value={plan} onValueChange={(v) => setPlan(v as StorePlan)} options={STORE_PLANS.map((p) => ({ value: p, label: planName(p), disabled: p === currentPlan }))} />
        </FormField>
      )}
      {action === 'extend' && (
        <FormField label={t('billing.admin.actions.days')} required hint={t('billing.admin.actions.daysHint')}>
          <Input type="number" inputMode="numeric" min={1} max={365} step={1} dir="ltr" value={days} onChange={(e) => setDays(e.target.value)} />
        </FormField>
      )}
    </ConfirmDialog>
  );
}

/** Approve (optionally a smaller verified amount = partial) or reject a pending manual transfer. */
export function ReviewPaymentDialog({ payment, kind, onClose }: { payment: InvoicePayment; kind: 'approve' | 'reject'; onClose: () => void }) {
  const { t } = useTranslation();
  const m = useBillingMutation();
  const [amount, setAmount] = useState(String(payment.amount / 100));
  const isPdf = payment.proofUrl ? /\.pdf($|\?)/i.test(payment.proofUrl) : false;

  function confirm(text: string) {
    if (kind === 'reject') {
      const parsed = adminRejectPaymentSchema.safeParse({ reason: text });
      if (!parsed.success) return void toast.error(parsed.error.issues[0]?.message ?? t('errors.GENERIC'));
      return m.mutate({ path: `billing/payments/${payment.id}/reject`, body: parsed.data }, { onSuccess: () => (toast.success(t('billing.admin.review.rejected')), onClose()), onError: (e) => toast.error(getErrorMessage(e)) });
    }
    const minor = rupees(amount);
    const parsed = adminApprovePaymentSchema.safeParse({ ...(minor !== undefined && minor !== payment.amount ? { amount: minor } : {}), ...(text ? { note: text } : {}) });
    if (!parsed.success || (minor ?? 0) > payment.amount) return void toast.error(t('billing.admin.review.invalidAmount', { max: money(payment.amount) }));
    m.mutate({ path: `billing/payments/${payment.id}/approve`, body: parsed.data }, { onSuccess: () => (toast.success(t('billing.admin.review.approved')), onClose()), onError: (e) => toast.error(getErrorMessage(e)) });
  }

  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t(`billing.admin.review.${kind}Title`, { amount: money(payment.amount), number: payment.invoiceNumber })}
      description={payment.store?.name}
      confirmLabel={t(`billing.admin.review.${kind}`)}
      tone={kind === 'reject' ? 'danger' : 'primary'}
      reasonLabel={kind === 'reject' ? t('billing.admin.reason') : t('billing.admin.review.noteOptional')}
      reasonRequired={kind === 'reject'}
      reasonMin={REASON_MIN}
      loading={m.isPending}
      onConfirm={confirm}
    >
      <dl className="mb-3 grid gap-1 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-fg-muted">{t('billing.pay.channel')}</dt>
          <dd className="font-semibold">{payment.channel ? t(`billing.channel.${payment.channel}`) : '—'}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-fg-muted">{t('billing.pay.reference')}</dt>
          <dd className="latin font-mono font-semibold" dir="ltr">
            {payment.reference ?? '—'}
          </dd>
        </div>
        {payment.note && <p className="text-xs text-fg-muted">{payment.note}</p>}
      </dl>
      {payment.proofUrl &&
        (isPdf ? (
          <a href={payment.proofUrl} target="_blank" rel="noopener noreferrer" className="mb-3 inline-block text-sm font-semibold text-primary-700 hover:underline">
            {t('billing.payments.viewProof')}
          </a>
        ) : (
          <a href={payment.proofUrl} target="_blank" rel="noopener noreferrer" className="mb-3 block">
            <img src={payment.proofUrl} alt={t('billing.payments.proofAlt')} className="max-h-64 w-full rounded-md border border-border object-contain" />
          </a>
        ))}
      {kind === 'approve' && (
        <FormField label={t('billing.admin.review.verifiedAmount')} hint={t('billing.admin.review.partialHint')}>
          <Input type="number" inputMode="decimal" min={1} max={payment.amount / 100} dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </FormField>
      )}
    </ConfirmDialog>
  );
}

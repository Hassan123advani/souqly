import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Banknote, Clock, PiggyBank, Send, Wallet } from 'lucide-react';
import { PERMISSIONS, payoutRequestSchema, toMinor } from '@souqly/shared';
import { useFinanceSummary, usePayouts, useRequestPayout, type SellerPayout } from '@/api/billing';
import { getErrorMessage } from '@/api/client';
import { useSellerStore } from '@/api/seller';
import { DataTable, type Column } from '@/components/admin/DataTable';
import { KpiCard } from '@/components/admin/KpiCard';
import { BillingBadge } from '@/components/billing/BillingBadge';
import { useCan } from '@/components/seller/usePermissions';
import { Alert, Button, Card, CardBody, CardHeader, ErrorState, FormField, Input } from '@/components/ui';
import { useLang } from '@/lib/catalog';
import { formatDate, formatDateTime, money } from '@/lib/format';

/** Seller payouts from the available Souqly balance (`/seller/finance/*`). */
export default function BillingPayoutsPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const summary = useFinanceSummary();
  const list = usePayouts();
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  const s = summary.data;

  const columns: Column<SellerPayout>[] = [
    { key: 'date', header: t('billing.payouts.requested'), cell: (p) => <span className="whitespace-nowrap text-fg-muted">{formatDateTime(p.createdAt, lang)}</span> },
    { key: 'amount', header: t('billing.invoice.amount'), align: 'end', cell: (p) => <span className="tabular font-bold" dir="ltr">{money(p.amount)}</span> },
    {
      key: 'method',
      header: t('billing.payouts.account'),
      cell: (p) => <span className="text-xs text-fg-muted">{[p.method.bankName ?? p.method.type, p.method.accountTitle, p.method.accountMasked].filter(Boolean).join(' · ') || '—'}</span>,
    },
    { key: 'status', header: t('billing.invoice.status'), cell: (p) => <BillingBadge status={p.status} /> },
    {
      key: 'done',
      header: t('billing.payouts.settled'),
      cell: (p) => (
        <span className="text-xs text-fg-muted">
          {p.paidAt ? formatDate(p.paidAt, lang) : p.rejectedAt ? formatDate(p.rejectedAt, lang) : '—'}
          {p.reference && (
            <span className="latin ms-1 font-mono" dir="ltr">
              {p.reference}
            </span>
          )}
        </span>
      ),
    },
  ];

  return (
    <div className="grid gap-5">
      {summary.error ? (
        <Card>
          <ErrorState compact error={summary.error} onRetry={() => void summary.refetch()} />
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard loading={!s} label={t('billing.overview.available')} icon={<Wallet />} value={s ? money(s.available) : ''} />
          <KpiCard loading={!s} label={t('billing.payouts.onHold')} icon={<Clock />} value={s ? money(s.onHold) : ''} sub={s ? t('billing.payouts.holdDays', { n: s.holdDays }) : undefined} />
          <KpiCard loading={!s} label={t('billing.overview.pendingPayouts')} icon={<PiggyBank />} value={s ? money(s.pendingPayouts) : ''} />
          <KpiCard loading={!s} label={t('billing.payouts.paidOut')} icon={<Banknote />} value={s ? money(s.paidOut) : ''} />
        </div>
      )}
      {s && <RequestPayout available={s.available} minPayout={s.minPayout} />}
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(p) => p.id}
        isLoading={list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        hasMore={list.hasNextPage}
        loadingMore={list.isFetchingNextPage}
        onLoadMore={() => void list.fetchNextPage()}
        empty={{ title: t('billing.payouts.empty'), description: t('billing.payouts.emptyBody'), icon: <Banknote /> }}
      />
    </div>
  );
}

function RequestPayout({ available, minPayout }: { available: number; minPayout: number }) {
  const { t } = useTranslation();
  const can = useCan();
  const store = useSellerStore();
  const request = useRequestPayout();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (!can(PERMISSIONS.STORE_FINANCE_MANAGE)) return null;

  function submit(e: FormEvent) {
    e.preventDefault();
    const amount = toMinor(Number(value));
    const parsed = payoutRequestSchema.safeParse({ amount });
    if (!Number.isFinite(amount) || amount <= 0) return setError(t('billing.payouts.enterAmount'));
    if (!parsed.success || amount < minPayout) return setError(t('billing.payouts.minimum', { amount: money(minPayout) }));
    if (amount > available) return setError(t('billing.payouts.tooMuch', { amount: money(available) }));
    setError(null);
    request.mutate(amount, {
      onSuccess: () => {
        setValue('');
        toast.success(t('billing.payouts.requestedToast', { amount: money(amount) }));
      },
      onError: (err) => toast.error(getErrorMessage(err)),
    });
  }

  return (
    <Card>
      <CardHeader title={t('billing.payouts.requestTitle')} description={t('billing.payouts.requestHint', { amount: money(minPayout) })} />
      <CardBody>
        {store.data && !store.data.payout ? (
          <Alert
            tone="warning"
            title={t('billing.payouts.noMethodTitle')}
            action={
              <Button to="/seller/store?tab=account" size="sm" variant="outline" className="shrink-0 self-center">
                {t('billing.payouts.addMethod')}
              </Button>
            }
          >
            {t('billing.payouts.noMethodBody')}
          </Alert>
        ) : available < minPayout ? (
          <Alert tone="info">{t('billing.payouts.belowMinimum', { amount: money(minPayout), available: money(Math.max(0, available)) })}</Alert>
        ) : (
          <form onSubmit={submit} noValidate className="flex flex-wrap items-end gap-3">
            <FormField label={t('billing.payouts.amount')} required error={error ?? undefined} className="w-full sm:w-64">
              <Input
                type="number"
                inputMode="decimal"
                min={minPayout / 100}
                max={available / 100}
                step="1"
                dir="ltr"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                startIcon={<span className="text-xs font-semibold">{t('billing.payouts.currency')}</span>}
              />
            </FormField>
            <Button type="button" variant="ghost" onClick={() => setValue(String(Math.floor(available / 100)))}>
              {t('billing.payouts.max')}
            </Button>
            <Button type="submit" loading={request.isPending} leftIcon={<Send className="flip-rtl size-4" />}>
              {t('billing.payouts.request')}
            </Button>
          </form>
        )}
      </CardBody>
    </Card>
  );
}

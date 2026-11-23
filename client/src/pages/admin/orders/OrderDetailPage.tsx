import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Gavel, RotateCcw, Undo2 } from 'lucide-react';
import { ORDER_STATUSES, PERMISSIONS } from '@souqly/shared';
import { useAdminGet, useAdminMutation, type AdminOrderDetail } from '@/api/admin';
import { getErrorMessage } from '@/api/client';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { PageHeader } from '@/components/admin/PageHeader';
import { StatusPill } from '@/components/admin/StatusPill';
import { useAdminCan } from '@/components/admin/useAdminCan';
import { Alert, Button, Card, CardHeader, ErrorState, FormField, Input, Select, Skeleton } from '@/components/ui';
import { useLang } from '@/lib/catalog';
import { cn } from '@/lib/cn';
import { formatDateTime, money } from '@/lib/format';

export default function OrderDetailPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const lang = useLang();
  const can = useAdminCan();
  const q = useAdminGet<AdminOrderDetail>(`orders/${id}`);
  const post = useAdminMutation('post', ['orders']);
  const [dlg, setDlg] = useState<'status' | 'refund' | null>(null);
  const [status, setStatus] = useState('');
  const [amount, setAmount] = useState('');
  const o = q.data;

  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!o)
    return (
      <div className="grid gap-4">
        <Skeleton className="h-16 w-1/2" />
        <Skeleton className="h-72" />
      </div>
    );

  const manage = can(PERMISSIONS.ADMIN_ORDERS_MANAGE);
  const refundable = o.total - o.adminRefunded;
  const fail = (e: unknown) => toast.error(getErrorMessage(e));
  const addr = o.shippingAddress as Record<string, string | undefined>;

  function confirm(reason: string) {
    if (dlg === 'status' && !status) return void toast.error(t('admin.orders.pickStatus'));
    if (dlg === 'status')
      post.mutate(
        { path: `orders/${id}/status`, body: { status, reason } },
        {
          onSuccess: (r) => (toast.success((r as { forced: boolean }).forced ? t('admin.orders.forced') : t('admin.orders.statusChanged')), setDlg(null)),
          onError: fail,
        },
      );
    if (dlg === 'refund') {
      const minor = Math.round(Number(amount) * 100);
      if (!minor || minor <= 0 || minor > refundable) return void toast.error(t('admin.orders.refundInvalid', { max: money(refundable) }));
      post.mutate({ path: `orders/${id}/refund`, body: { amount: minor, reason } }, { onSuccess: () => (toast.success(t('admin.orders.refunded')), setDlg(null)), onError: fail });
    }
  }

  return (
    <>
      <PageHeader
        title={o.number}
        crumbs={[{ label: t('admin.nav.orders'), to: '/admin/orders' }]}
        actions={
          manage && (
            <>
              <Button variant="outline" size="sm" leftIcon={<RotateCcw className="size-4" />} onClick={() => (setStatus(''), setDlg('status'))}>
                {t('admin.orders.override')}
              </Button>
              <Button variant="outline" size="sm" leftIcon={<Undo2 className="size-4" />} disabled={refundable <= 0} onClick={() => (setAmount(''), setDlg('refund'))}>
                {t('admin.orders.refund')}
              </Button>
            </>
          )
        }
      />
      {o.return && (
        <Alert tone="warning" className="mb-4" title={t('admin.orders.hasReturn')} action={o.return.disputeId ? <Button size="sm" variant="outline" to={`/admin/disputes/${o.return.disputeId}`} leftIcon={<Gavel className="size-4" />}>{t('admin.orders.openDispute')}</Button> : undefined}>
          <StatusPill status={o.return.status} /> · {money(o.return.refundAmount)}
        </Alert>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="grid content-start gap-4">
          <Card>
            <CardHeader title={t('admin.orders.items')} action={<StatusPill status={o.status} />} />
            <ul className="divide-y divide-border border-t border-border">
              {o.items.map((it) => (
                <li key={`${it.productId}-${it.variantId}`} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <span className="size-12 shrink-0 overflow-hidden rounded-md bg-surface-2">{it.image && <img src={it.image} alt="" className="size-full object-cover" />}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-fg">{it.title}</p>
                    <p className="text-xs text-fg-muted">
                      {Object.values(it.options).join(' / ')} {it.sku && <span dir="ltr">· {it.sku}</span>}
                    </p>
                  </div>
                  <span className="text-fg-muted">×{it.qty}</span>
                  <span className="w-24 text-end font-semibold" dir="ltr">
                    {money(it.lineTotal)}
                  </span>
                </li>
              ))}
            </ul>
            <dl className="grid gap-1.5 border-t border-border px-5 py-4 text-sm">
              <Line k={t('admin.orders.subtotal')} v={money(o.subtotal)} />
              <Line k={t('admin.orders.shipping')} v={money(o.shippingFee)} />
              {o.discounts.store + o.discounts.platform + (o.discounts.coins ?? 0) > 0 && <Line k={t('admin.orders.discounts')} v={`− ${money(o.discounts.store + o.discounts.platform + (o.discounts.coins ?? 0))}`} />}
              <Line k={t('admin.orders.total')} v={money(o.total)} strong />
              {o.commission && <Line k={t('admin.orders.commission', { pct: (o.commission.bps / 100).toFixed(1) })} v={money(o.commission.amount)} />}
              {o.adminRefunded > 0 && <Line k={t('admin.orders.adminRefunded')} v={money(o.adminRefunded)} />}
            </dl>
          </Card>
          <Card>
            <CardHeader title={t('admin.orders.timeline')} />
            <ol className="relative mx-5 mb-5 border-s border-border">
              {[...o.timeline].reverse().map((e, i) => (
                <li key={`${e.status}-${e.at}`} className="relative ps-5 pb-4 last:pb-0">
                  <span className={cn('absolute -start-[5px] top-1.5 size-2.5 rounded-full', i === 0 ? 'bg-primary' : 'bg-border-strong')} />
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill status={e.status} />
                    <span className="text-xs text-fg-muted">{formatDateTime(e.at, lang)}</span>
                  </div>
                  {e.note && <p className="mt-1 text-sm text-fg-muted">{e.note}</p>}
                </li>
              ))}
            </ol>
          </Card>
        </div>
        <div className="grid content-start gap-4">
          <Card className="p-5 text-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-fg-muted">{t('admin.orders.buyer')}</p>
            {o.buyerContact ? (
              <>
                <Link to={`/admin/users/${o.buyerContact.id}`} className="mt-1 block font-semibold text-primary-700 hover:underline">
                  {o.buyerContact.name}
                </Link>
                <p className="text-fg-muted" dir="ltr">
                  {o.buyerContact.email ?? o.buyerContact.phone}
                </p>
              </>
            ) : (
              <p>—</p>
            )}
            <p className="mt-4 text-xs font-bold uppercase tracking-wide text-fg-muted">{t('admin.stores.store')}</p>
            <Link to={`/admin/stores/${o.store.id}`} className="mt-1 block font-semibold text-primary-700 hover:underline">
              {o.store.name}
            </Link>
            <p className="mt-4 text-xs font-bold uppercase tracking-wide text-fg-muted">{t('admin.orders.payment')}</p>
            <p className="mt-1 font-medium uppercase">
              {o.payment.method} · <StatusPill status={o.payment.status} />
            </p>
            {o.coinsUsed > 0 && <p className="text-xs text-fg-muted">{t('admin.orders.coinsUsed', { count: o.coinsUsed })}</p>}
            <p className="mt-4 text-xs font-bold uppercase tracking-wide text-fg-muted">{t('admin.orders.shipTo')}</p>
            <p className="mt-1 text-fg">
              {[addr.fullName, addr.line1, addr.area, addr.city].filter(Boolean).join(', ')}
            </p>
            {o.tracking && (
              <p className="mt-2 text-xs text-fg-muted" dir="ltr">
                {o.tracking.courier} · {o.tracking.trackingNumber}
              </p>
            )}
            {o.cancel && (
              <Alert tone="danger" className="mt-4" title={t('admin.status.cancelled')}>
                {o.cancel.reason}
              </Alert>
            )}
          </Card>
        </div>
      </div>

      {dlg && (
        <ConfirmDialog
          open
          onOpenChange={(v) => !v && setDlg(null)}
          title={dlg === 'status' ? t('admin.orders.override') : t('admin.orders.refund')}
          description={dlg === 'status' ? t('admin.orders.overrideDesc') : t('admin.orders.refundDesc', { max: money(refundable) })}
          confirmLabel={dlg === 'status' ? t('admin.orders.applyStatus') : t('admin.orders.refund')}
          tone="danger"
          reasonLabel={t('admin.common.reason')}
          reasonRequired
          loading={post.isPending}
          onConfirm={confirm}
        >
          {dlg === 'status' ? (
            <FormField label={t('admin.orders.newStatus')}>
              <Select value={status} onValueChange={setStatus} placeholder={t('admin.orders.pickStatus')} options={ORDER_STATUSES.filter((s) => s !== o.status).map((s) => ({ value: s, label: t(`admin.status.${s}`) }))} />
            </FormField>
          ) : (
            <FormField label={t('admin.users.amountRs')}>
              <Input type="number" min={1} max={refundable / 100} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </FormField>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}

function Line({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className={cn('flex justify-between', strong && 'border-t border-border pt-2 text-base font-extrabold')}>
      <dt className={strong ? 'text-fg' : 'text-fg-muted'}>{k}</dt>
      <dd dir="ltr">{v}</dd>
    </div>
  );
}

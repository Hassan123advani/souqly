import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Send, ShieldCheck, Store, Undo2 } from 'lucide-react';
import { useAdminGet, useAdminMutation, type AdminDisputeDetail } from '@/api/admin';
import { getErrorMessage } from '@/api/client';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { PageHeader } from '@/components/admin/PageHeader';
import { StatusPill } from '@/components/admin/StatusPill';
import { Alert, Button, Card, CardHeader, ErrorState, Skeleton, Textarea } from '@/components/ui';
import { useLang } from '@/lib/catalog';
import { cn } from '@/lib/cn';
import { formatDateTime, money } from '@/lib/format';

export default function DisputeDetailPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const lang = useLang();
  const q = useAdminGet<AdminDisputeDetail>(`disputes/${id}`);
  const post = useAdminMutation('post', ['disputes', 'returns']);
  const [text, setText] = useState('');
  const [outcome, setOutcome] = useState<'refund_buyer' | 'side_with_seller' | null>(null);
  const d = q.data;
  const fail = (e: unknown) => toast.error(getErrorMessage(e));

  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!d)
    return (
      <div className="grid gap-4">
        <Skeleton className="h-16 w-1/2" />
        <Skeleton className="h-96" />
      </div>
    );
  const open = d.status === 'open';
  const refundAmount = d.return?.refund.amount ?? d.order?.total ?? 0;

  return (
    <>
      <PageHeader
        title={t('admin.disputes.caseTitle', { id: d.id.slice(-6).toUpperCase() })}
        crumbs={[{ label: t('admin.nav.disputes'), to: '/admin/disputes' }]}
        actions={
          open && (
            <>
              <Button size="sm" variant="outline" leftIcon={<Store className="size-4" />} onClick={() => setOutcome('side_with_seller')}>
                {t('admin.disputes.sideWithSeller')}
              </Button>
              <Button size="sm" leftIcon={<Undo2 className="size-4" />} onClick={() => setOutcome('refund_buyer')}>
                {t('admin.disputes.refundBuyer')}
              </Button>
            </>
          )
        }
      />
      {!open && d.resolution && (
        <Alert tone="success" className="mb-4" title={t('admin.disputes.resolved')}>
          {d.resolution}
        </Alert>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card className="flex min-h-[480px] flex-col">
          <CardHeader title={t('admin.disputes.thread')} action={<StatusPill status={d.status} />} />
          <ol className="flex-1 space-y-3 overflow-y-auto border-t border-border p-5">
            {!d.messages.length && <p className="text-center text-sm text-fg-muted">{t('admin.disputes.noMessages')}</p>}
            {d.messages.map((m, i) => (
              <li key={i} className={cn('flex', m.actor === 'admin' ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[80%] rounded-lg px-3.5 py-2.5 text-sm',
                    m.actor === 'admin' ? 'rounded-ee-sm bg-primary text-white' : m.actor === 'buyer' ? 'rounded-es-sm bg-surface-2 text-fg' : 'rounded-es-sm bg-accent-50 text-fg',
                  )}
                >
                  <p className={cn('mb-0.5 text-[11px] font-bold uppercase tracking-wide', m.actor === 'admin' ? 'text-white/80' : 'text-fg-muted')}>{t(`admin.disputes.actor.${m.actor}`, { defaultValue: m.actor })}</p>
                  <p className="whitespace-pre-line">{m.text}</p>
                  <p className={cn('mt-1 text-[10px]', m.actor === 'admin' ? 'text-white/70' : 'text-fg-subtle')}>{formatDateTime(m.at, lang)}</p>
                </div>
              </li>
            ))}
          </ol>
          {open && (
            <form
              className="flex items-end gap-2 border-t border-border p-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!text.trim()) return;
                post.mutate({ path: `disputes/${id}/messages`, body: { text: text.trim() } }, { onSuccess: () => setText(''), onError: fail });
              }}
            >
              <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('admin.disputes.replyPlaceholder')} aria-label={t('admin.disputes.replyPlaceholder')} className="flex-1" maxLength={2000} />
              <Button type="submit" loading={post.isPending} leftIcon={<Send className="flip-rtl size-4" />}>
                {t('admin.disputes.send')}
              </Button>
            </form>
          )}
        </Card>
        <div className="grid content-start gap-4">
          <Card className="grid gap-3 p-5 text-sm">
            {d.order && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-fg-muted">{t('admin.orders.number')}</p>
                <Link to={`/admin/orders/${d.orderId}`} className="font-bold text-primary-700 hover:underline" dir="ltr">
                  {d.order.number}
                </Link>
                <div className="mt-1 flex items-center gap-2">
                  <StatusPill status={d.order.status} />
                  <span dir="ltr">{money(d.order.total)}</span>
                </div>
              </div>
            )}
            {d.buyer && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-fg-muted">{t('admin.orders.buyer')}</p>
                <Link to={`/admin/users/${d.buyer.id}`} className="font-semibold text-primary-700 hover:underline">
                  {d.buyer.name}
                </Link>
              </div>
            )}
            {d.store && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-fg-muted">{t('admin.stores.store')}</p>
                <Link to={`/admin/stores/${d.store.id}`} className="font-semibold text-primary-700 hover:underline">
                  {d.store.name}
                </Link>
              </div>
            )}
          </Card>
          {d.return && (
            <Card className="p-5 text-sm">
              <div className="flex items-center justify-between">
                <p className="font-bold text-fg">{t('admin.disputes.return')}</p>
                <StatusPill status={d.return.status} />
              </div>
              <p className="mt-2 text-fg-muted">{t(`returns.reasons.${d.return.reason}`, { defaultValue: d.return.reason })}</p>
              {d.return.description && <p className="mt-2 whitespace-pre-line text-fg">{d.return.description}</p>}
              {d.return.photos.length > 0 && (
                <div className="mt-3 grid grid-cols-4 gap-1.5">
                  {d.return.photos.map((p) => (
                    <a key={p} href={p} target="_blank" rel="noopener noreferrer" className="aspect-square overflow-hidden rounded-md bg-surface-2">
                      <img src={p} alt="" className="size-full object-cover" />
                    </a>
                  ))}
                </div>
              )}
              <ul className="mt-3 grid gap-1">
                {d.return.items.map((i, k) => (
                  <li key={k} className="flex justify-between text-xs">
                    <span className="truncate">
                      {i.title} ×{i.qty}
                    </span>
                    <span dir="ltr">{money(i.price * i.qty)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 flex justify-between border-t border-border pt-2 font-bold">
                <span>{t('admin.disputes.refund')}</span>
                <span dir="ltr">{money(d.return.refund.amount)}</span>
              </p>
            </Card>
          )}
          <p className="flex items-start gap-2 text-xs text-fg-muted">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
            {t('admin.disputes.notice')}
          </p>
        </div>
      </div>
      {outcome && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setOutcome(null)}
          title={outcome === 'refund_buyer' ? t('admin.disputes.refundBuyer') : t('admin.disputes.sideWithSeller')}
          description={outcome === 'refund_buyer' ? t('admin.disputes.refundDesc', { amount: money(refundAmount) }) : t('admin.disputes.sellerDesc')}
          confirmLabel={t('admin.disputes.resolve')}
          tone="danger"
          reasonLabel={t('admin.disputes.resolutionNote')}
          reasonRequired
          loading={post.isPending}
          onConfirm={(note) => post.mutate({ path: `disputes/${id}/resolve`, body: { outcome, note } }, { onSuccess: () => (toast.success(t('admin.disputes.resolved')), setOutcome(null)), onError: fail })}
        />
      )}
    </>
  );
}

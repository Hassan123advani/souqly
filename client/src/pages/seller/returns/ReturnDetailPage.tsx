import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowLeft, Check, PackageCheck, Wallet, X } from 'lucide-react';
import { PERMISSIONS, type ReturnStatus } from '@souqly/shared';
import { getErrorMessage } from '@/api/client';
import { useSellerReturn, useSellerReturnAction, type SellerReturnAction } from '@/api/returns';
import { Seo } from '@/components/layout/Seo';
import { Alert, Button, Card, CardHeader, ErrorState, FormField, Modal, PageSpinner, Textarea } from '@/components/ui';
import { RefundLine, ReturnItems, ReturnPhotos, ReturnStatusBadge, ReturnTimeline } from '@/components/returns/ReturnBits';
import { useCan } from '@/components/seller/usePermissions';
import { useLang } from '@/lib/catalog';
import { formatDateTime, money } from '@/lib/format';

const ACTIONS: Partial<Record<ReturnStatus, SellerReturnAction[]>> = {
  requested: ['approve', 'reject'],
  approved: ['received'],
  received: ['refund'],
};
const ICONS = { approve: Check, reject: X, received: PackageCheck, refund: Wallet } as const;

export default function SellerReturnDetailPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const lang = useLang();
  const can = useCan();
  const manage = can(PERMISSIONS.STORE_ORDERS_MANAGE);
  const q = useSellerReturn(id);
  const act = useSellerReturnAction(id ?? '');
  const [pending, setPending] = useState<SellerReturnAction | null>(null);
  const [note, setNote] = useState('');

  if (q.isLoading) return <PageSpinner />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const r = q.data;
  const actions = manage ? (ACTIONS[r.status] ?? []) : [];
  const noteRequired = pending === 'reject';
  const noteInvalid = noteRequired && note.trim().length < 3;

  function confirm() {
    if (!pending) return;
    act.mutate(
      { action: pending, note: note.trim() || undefined },
      {
        onSuccess: () => {
          toast.success(t(`returns.seller.done.${pending}`));
          setPending(null);
          setNote('');
        },
        onError: (e) => toast.error(getErrorMessage(e)),
      },
    );
  }

  return (
    <>
      <Seo title={t('returns.detailTitle', { number: r.order.number })} noindex />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Button to="/seller/returns" variant="ghost" size="sm" leftIcon={<ArrowLeft className="flip-rtl size-4" />}>
          {t('returns.seller.title')}
        </Button>
        <h1 className="text-xl font-extrabold text-fg sm:text-2xl" dir="ltr">
          {r.order.number}
        </h1>
        <ReturnStatusBadge status={r.status} />
        <span className="text-sm text-fg-muted">{formatDateTime(r.createdAt, lang)}</span>
      </div>

      {actions.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {actions.map((a) => {
            const Icon = ICONS[a];
            return (
              <Button key={a} size="sm" variant={a === 'reject' ? 'outline' : 'primary'} leftIcon={<Icon className="size-4" />} onClick={() => setPending(a)}>
                {t(`returns.seller.actions.${a}`)}
              </Button>
            );
          })}
        </div>
      )}
      {r.status === 'escalated' && <Alert tone="warning" className="mb-5">{t('returns.seller.escalated')}</Alert>}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="grid h-fit gap-5 lg:col-span-2">
          <Card>
            <CardHeader title={t('returns.items')} />
            <div className="px-5 pb-5">
              <ReturnItems r={r} />
              <RefundLine r={r} />
            </div>
          </Card>
          <Card>
            <CardHeader title={t('returns.details')} />
            <div className="grid gap-3 px-5 pb-5 text-sm">
              <p>
                <span className="font-semibold text-fg">{t('returns.form.reason')}:</span> {t(`returns.reasons.${r.reason}`)}
              </p>
              {r.description ? <p className="whitespace-pre-line text-fg-muted">{r.description}</p> : <p className="text-fg-subtle">{t('returns.noDescription')}</p>}
              <ReturnPhotos photos={r.photos} />
              {r.sellerNote && (
                <p className="rounded-md bg-surface-2 p-2.5 text-xs">
                  <span className="font-semibold">{t('returns.seller.yourNote')}:</span> {r.sellerNote}
                </p>
              )}
            </div>
          </Card>
        </div>
        <div className="grid h-fit gap-5">
          <Card>
            <CardHeader title={t('returns.seller.buyer')} />
            <div className="grid gap-1 px-5 pb-5 text-sm">
              <p className="font-semibold text-fg">{r.buyer?.name ?? '—'}</p>
              <Link to={`/seller/orders/${r.order.id}`} className="text-primary-700 hover:underline">
                {t('returns.seller.viewOrder')}
              </Link>
            </div>
          </Card>
          <Card>
            <CardHeader title={t('returns.timeline')} />
            <div className="px-5 pb-5">
              <ReturnTimeline r={r} />
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title={pending ? t(`returns.seller.confirm.${pending}`) : ''}
        description={pending === 'refund' ? t('returns.seller.refundBody', { amount: money(r.refund.amount) }) : pending === 'received' ? t('returns.seller.receivedBody') : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant={pending === 'reject' ? 'danger' : 'primary'} loading={act.isPending} disabled={noteInvalid} onClick={confirm}>
              {pending ? t(`returns.seller.actions.${pending}`) : ''}
            </Button>
          </>
        }
      >
        <FormField label={noteRequired ? t('returns.seller.rejectReason') : t('returns.seller.noteOptional')} required={noteRequired}>
          <Textarea rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
        </FormField>
      </Modal>
    </>
  );
}

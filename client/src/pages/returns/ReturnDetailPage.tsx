import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowLeft, Scale } from 'lucide-react';
import { getErrorMessage, getErrorStatus } from '@/api/client';
import { useEscalateReturn, useMyReturn } from '@/api/returns';
import { Alert, Button, Card, EmptyState, ErrorState, FormField, Modal, Skeleton, Textarea } from '@/components/ui';
import { Seo } from '@/components/layout/Seo';
import { RefundLine, ReturnItems, ReturnPhotos, ReturnStatusBadge, ReturnTimeline } from '@/components/returns/ReturnBits';
import { formatDateTime } from '@/lib/format';
import { useUi } from '@/stores/ui';

export default function ReturnDetailPage() {
  const { t } = useTranslation();
  const lang = useUi((s) => s.language);
  const { id = '' } = useParams();
  const q = useMyReturn(id);
  const escalate = useEscalateReturn(id);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const back = (
    <Link to="/account/returns" className="inline-flex items-center gap-1.5 text-sm font-semibold text-fg-muted hover:text-fg">
      <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
      {t('returns.back')}
    </Link>
  );

  if (q.isPending)
    return (
      <div className="space-y-4" aria-busy>
        {back}
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  if (q.isError)
    return (
      <div className="space-y-4">
        {back}
        <Card>
          {getErrorStatus(q.error) === 404 ? <EmptyState title={t('returns.notFound')} /> : <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
        </Card>
      </div>
    );

  const r = q.data;
  const canEscalate = r.status === 'requested' || r.status === 'rejected';
  const tooShort = msg.trim().length < 5;

  return (
    <div className="space-y-4">
      <Seo title={t('returns.detailTitle', { number: r.order.number })} noindex />
      {back}
      <Card className="flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-extrabold tracking-tight text-fg">{t('returns.returnFor')}</h2>
            <Link to={`/account/orders/${r.order.number}`} className="latin text-lg font-extrabold text-primary-700 hover:underline" dir="ltr">
              {r.order.number}
            </Link>
            <ReturnStatusBadge status={r.status} />
          </div>
          <p className="mt-1 text-xs text-fg-subtle">
            {r.store.name} · {formatDateTime(r.createdAt, lang)}
          </p>
        </div>
        {canEscalate && (
          <Button size="sm" variant="outline" leftIcon={<Scale className="size-4" />} onClick={() => setOpen(true)}>
            {t('returns.escalate')}
          </Button>
        )}
      </Card>

      {r.status === 'rejected' && r.sellerNote && (
        <Alert tone="danger" title={t('returns.rejectedTitle')}>
          {r.sellerNote}
        </Alert>
      )}
      {r.status === 'escalated' && <Alert tone="warning">{t('returns.escalatedBody')}</Alert>}
      {r.status === 'approved' && <Alert tone="info">{t('returns.approvedBody')}</Alert>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <Card className="p-4 sm:p-5">
            <h3 className="text-sm font-bold text-fg">{t('returns.items')}</h3>
            <ReturnItems r={r} />
            <RefundLine r={r} />
          </Card>
          <Card className="space-y-3 p-4 sm:p-5">
            <h3 className="text-sm font-bold text-fg">{t('returns.details')}</h3>
            <p className="text-sm text-fg">
              <span className="font-semibold">{t('returns.form.reason')}:</span> {t(`returns.reasons.${r.reason}`)}
            </p>
            {r.description && <p className="whitespace-pre-line text-sm text-fg-muted">{r.description}</p>}
            <ReturnPhotos photos={r.photos} />
          </Card>
        </div>
        <Card className="h-fit p-4 sm:p-5">
          <h3 className="mb-3 text-sm font-bold text-fg">{t('returns.timeline')}</h3>
          <ReturnTimeline r={r} />
        </Card>
      </div>

      <Modal
        open={open}
        onOpenChange={setOpen}
        title={t('returns.escalateTitle')}
        description={t('returns.escalateBody')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              loading={escalate.isPending}
              disabled={tooShort}
              onClick={() =>
                escalate.mutate(msg.trim(), {
                  onSuccess: () => {
                    toast.success(t('returns.escalated'));
                    setOpen(false);
                    setMsg('');
                  },
                  onError: (e) => toast.error(getErrorMessage(e)),
                })
              }
            >
              {t('returns.escalate')}
            </Button>
          </>
        }
      >
        <FormField label={t('returns.escalateMessage')} hint={t('returns.escalateHint')}>
          <Textarea rows={4} maxLength={2000} value={msg} onChange={(e) => setMsg(e.target.value)} />
        </FormField>
      </Modal>
    </div>
  );
}

import { lazy, Suspense, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, Navigation, Package, Phone, Play, Radio, ShieldAlert, XCircle } from 'lucide-react';
import { getErrorMessage, getErrorStatus } from '@/api/client';
import { riderKeys, useRiderDelivery, useStartDelivery } from '@/api/delivery';
import { Alert, Button, Card, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge';
import { DeliverSheet } from '@/components/rider/DeliverSheet';
import { FailSheet } from '@/components/rider/FailSheet';
import { useLiveLocation, type LiveLocationState } from '@/components/rider/useLiveLocation';
import { cn } from '@/lib/cn';
import { formatDateTime, money } from '@/lib/format';
import { useUi } from '@/stores/ui';

const TrackingMap = lazy(() => import('@/components/tracking/TrackingMap'));

function LocationPill({ s }: { s: LiveLocationState }) {
  const { t } = useTranslation();
  if (s.status === 'idle' || s.status === 'stopped') return null;
  if (s.status === 'denied')
    return (
      <Alert tone="danger" title={t('rider.location.deniedTitle')}>
        <p>{t('rider.location.deniedBody')}</p>
        <ol className="mt-2 list-decimal space-y-0.5 ps-5 text-xs">
          <li>{t('rider.location.step1')}</li>
          <li>{t('rider.location.step2')}</li>
          <li>{t('rider.location.step3')}</li>
        </ol>
      </Alert>
    );
  if (s.status === 'unavailable') return <Alert tone="warning">{t('rider.location.unavailable')}</Alert>;
  const sharing = s.status === 'sharing';
  return (
    <div
      role="status"
      className={cn(
        'flex items-center gap-2 rounded-pill px-4 py-2.5 text-sm font-bold',
        sharing ? 'bg-success-soft text-success' : 'bg-surface-2 text-fg-muted',
      )}
    >
      <span className="relative grid size-3 place-items-center" aria-hidden>
        {sharing && <span className="absolute inset-0 animate-ping rounded-pill bg-success/60 motion-reduce:animate-none" />}
        <span className={cn('relative size-2.5 rounded-pill', sharing ? 'bg-success' : 'bg-fg-subtle')} />
      </span>
      {sharing ? t('rider.location.sharing') : t('rider.location.locating')}
      {sharing && s.position?.accuracy != null && (
        <span className="latin ms-auto text-xs font-semibold opacity-80" dir="ltr">
          ±{Math.round(s.position.accuracy)} m
        </span>
      )}
      {!sharing && <Radio className="ms-auto size-4" aria-hidden />}
    </div>
  );
}

export default function RiderDeliveryPage() {
  const { t } = useTranslation();
  const lang = useUi((s) => s.language);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { orderId = '' } = useParams();
  const q = useRiderDelivery(orderId);
  const start = useStartDelivery(orderId);
  const [sheet, setSheet] = useState<'deliver' | 'fail' | null>(null);
  const d = q.data;
  const live = useLiveLocation(orderId, d?.status === 'out_for_delivery', () => void qc.invalidateQueries({ queryKey: riderKeys.one(orderId) }));

  const back = (
    <Link to="/rider" className="inline-flex h-11 items-center gap-1.5 text-sm font-semibold text-fg-muted hover:text-fg">
      <ArrowLeft className="size-5 rtl:rotate-180" aria-hidden />
      {t('rider.back')}
    </Link>
  );

  if (q.isPending)
    return (
      <div className="space-y-3" aria-busy>
        {back}
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
        <Skeleton className="h-32 w-full rounded-lg" />
      </div>
    );
  if (q.isError || !d)
    return (
      <div className="space-y-3">
        {back}
        {getErrorStatus(q.error) === 404 ? (
          <EmptyState title={t('rider.notFound')} action={<Button to="/rider">{t('rider.back')}</Button>} />
        ) : (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        )}
      </div>
    );

  const a = d.address;
  const addressText = [a.line1, a.line2, a.area, a.city, a.postalCode].filter(Boolean).join(', ');
  const mapsUrl = d.location
    ? `https://www.google.com/maps/dir/?api=1&destination=${d.location.lat},${d.location.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressText)}`;
  const done = () => {
    setSheet(null);
    navigate('/rider', { replace: true });
  };

  return (
    <div className="space-y-3">
      {back}

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="latin text-xl font-extrabold text-fg" dir="ltr">
            {d.number}
          </h1>
          <OrderStatusBadge status={d.status} />
        </div>
        <p className="mt-1 text-xs text-fg-muted">
          {d.store.name} · {formatDateTime(d.createdAt, lang)}
        </p>
      </Card>

      {d.status === 'out_for_delivery' && <LocationPill s={live} />}

      {(d.location || live.position) && (
        <Suspense fallback={<Skeleton className="h-48 w-full rounded-lg" />}>
          <TrackingMap destination={d.location} rider={live.position} className="h-48" />
        </Suspense>
      )}

      <Card className="space-y-3 p-4">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-fg-muted">{t('rider.buyer')}</p>
            <p className="truncate text-base font-bold text-fg">{d.buyer.name}</p>
          </div>
          {d.buyer.phone && (
            <Button size="lg" variant="secondary" href={`tel:${d.buyer.phone}`} leftIcon={<Phone className="size-5" />} aria-label={t('rider.callBuyer', { name: d.buyer.name })}>
              {t('rider.call')}
            </Button>
          )}
        </div>
        <div>
          <p className="text-xs text-fg-muted">{t('rider.address')}</p>
          <p className="text-sm text-fg">{addressText}</p>
        </div>
        <Button size="lg" block variant="outline" href={mapsUrl} target="_blank" rel="noreferrer" leftIcon={<Navigation className="size-5" />}>
          {t('rider.openMaps')}
        </Button>
      </Card>

      <Card className="grid grid-cols-2 divide-x divide-border p-0 rtl:divide-x-reverse">
        <div className="p-4">
          <p className="flex items-center gap-1.5 text-xs text-fg-muted">
            <Package className="size-4" aria-hidden />
            {t('rider.items')}
          </p>
          <p className="text-lg font-extrabold text-fg">{t('rider.itemsCount', { count: d.itemsCount })}</p>
        </div>
        <div className="p-4">
          <p className="text-xs text-fg-muted">{d.codAmount > 0 ? t('rider.collectCash') : t('rider.payment')}</p>
          {d.codAmount > 0 ? (
            <p className="latin text-lg font-extrabold tabular text-accent-800" dir="ltr">
              {money(d.codAmount)}
            </p>
          ) : (
            <p className="text-lg font-extrabold text-success">{d.status === 'delivered' ? t('rider.paid') : t('rider.prepaid')}</p>
          )}
        </div>
      </Card>

      {d.status === 'failed_delivery' && d.failReason && (
        <Alert tone="warning" title={t('rider.failedTitle')}>
          {t(`rider.fail.reasons.${d.failReason}`)}
        </Alert>
      )}
      {d.status === 'delivered' && (
        <Alert tone="success" title={t('rider.deliveredTitle')}>
          {d.deliveredAt ? formatDateTime(d.deliveredAt, lang) : null}
        </Alert>
      )}
      {d.otpLockedUntil && new Date(d.otpLockedUntil) > new Date() && (
        <Alert tone="danger" title={t('rider.deliver.lockedTitle')}>
          <span className="inline-flex items-center gap-1.5">
            <ShieldAlert className="size-4" aria-hidden />
            {t('rider.deliver.lockedBody', { time: formatDateTime(d.otpLockedUntil, lang) })}
          </span>
        </Alert>
      )}

      {(d.canStart || d.canDeliver || d.canFail) && (
        <div className="sticky bottom-20 z-30 -mx-4 space-y-2 bg-gradient-to-t from-bg via-bg to-bg/0 px-4 pb-2 pt-6">
          {d.canStart && (
            <Button
              size="xl"
              block
              loading={start.isPending}
              leftIcon={<Play className="size-5" />}
              onClick={() => start.mutate(undefined, { onSuccess: () => toast.success(t('rider.started')), onError: (e) => toast.error(getErrorMessage(e)) })}
            >
              {d.status === 'failed_delivery' ? t('rider.retry') : t('rider.start')}
            </Button>
          )}
          {d.canDeliver && (
            <Button size="xl" block leftIcon={<CheckCircle2 className="size-5" />} onClick={() => setSheet('deliver')}>
              {t('rider.markDelivered')}
            </Button>
          )}
          {d.canFail && (
            <Button size="lg" block variant="outline" leftIcon={<XCircle className="size-5" />} onClick={() => setSheet('fail')}>
              {t('rider.markFailed')}
            </Button>
          )}
        </div>
      )}

      <DeliverSheet d={d} open={sheet === 'deliver'} onOpenChange={(o) => setSheet(o ? 'deliver' : null)} onDone={done} />
      <FailSheet orderId={d.orderId} open={sheet === 'fail'} onOpenChange={(o) => setSheet(o ? 'fail' : null)} onDone={done} />
    </div>
  );
}

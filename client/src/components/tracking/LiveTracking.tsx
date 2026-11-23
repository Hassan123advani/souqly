import { lazy, Suspense, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Bike, Clock, Phone, Radio } from 'lucide-react';
import type { OrderTrackingDTO, RiderLocationEvent } from '@souqly/shared';
import { trackingKey, useOrderTracking } from '@/api/delivery';
import { Button, Card, ErrorState, Skeleton } from '@/components/ui';
import { acquireSocket, releaseSocket } from '@/lib/socket';
import { formatRelative } from '@/lib/format';
import { useUi } from '@/stores/ui';

const TrackingMap = lazy(() => import('./TrackingMap'));

type Ack = { ok?: boolean; error?: unknown };

/**
 * Joins the `order-track:{orderId}` room and merges live `rider:location` events into the tracking
 * query cache. Returns whether the socket room is joined (callers poll as a fallback when not).
 */
function useLiveRoom(orderId: string, number: string, enabled: boolean): boolean {
  const qc = useQueryClient();
  const [joined, setJoined] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const s = acquireSocket();
    const join = () => s.emit('order-track:join', { orderId }, (ack: Ack) => setJoined(!!ack?.ok));
    const onLoc = (e: RiderLocationEvent) => {
      if (e.orderId !== orderId) return;
      qc.setQueryData<OrderTrackingDTO>(trackingKey(number), (old) =>
        old ? { ...old, lastLocation: { lat: e.lat, lng: e.lng, at: e.at }, eta: e.eta ?? old.eta } : old,
      );
    };
    const onEnded = (e: { orderId: string }) => {
      if (e.orderId !== orderId) return;
      setJoined(false);
      void qc.invalidateQueries({ queryKey: trackingKey(number) });
      void qc.invalidateQueries({ queryKey: ['orders'] });
      void qc.invalidateQueries({ queryKey: ['seller'] });
    };
    const onDisconnect = () => setJoined(false);
    if (s.connected) join();
    s.on('connect', join);
    s.on('disconnect', onDisconnect);
    s.on('rider:location', onLoc);
    s.on('tracking:ended', onEnded);
    return () => {
      s.emit('order-track:leave', { orderId });
      s.off('connect', join);
      s.off('disconnect', onDisconnect);
      s.off('rider:location', onLoc);
      s.off('tracking:ended', onEnded);
      releaseSocket();
      setJoined(false);
    };
  }, [enabled, orderId, number, qc]);
  return joined;
}

const isDialable = (phone: string) => /^\+?\d{7,15}$/.test(phone.replace(/[\s-]/g, ''));

/** Live delivery tracking card (buyer and seller order detail) shown while out for delivery. */
export function LiveTracking({ orderId, number }: { orderId: string; number: string }) {
  const { t } = useTranslation();
  const lang = useUi((s) => s.language);
  const [live, setLive] = useState(true);
  const joined = useLiveRoom(orderId, number, live);
  const q = useOrderTracking(number, { poll: live && !joined });
  const active = q.data?.active ?? true;

  useEffect(() => {
    if (q.data && !q.data.active) setLive(false);
  }, [q.data]);

  if (q.isPending)
    return (
      <Card className="space-y-3 p-4 sm:p-5" aria-busy>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-56 w-full rounded-lg" />
      </Card>
    );
  if (q.isError)
    return (
      <Card>
        <ErrorState compact error={q.error} onRetry={() => void q.refetch()} />
      </Card>
    );

  const tr = q.data;
  if (!active) return null;
  const rider = tr.lastLocation;
  const dest = tr.destination.location ?? null;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-fg">
          <Bike className="size-4 text-primary-700" aria-hidden />
          {t('delivery.track.title')}
        </h2>
        <span className="inline-flex items-center gap-1.5 rounded-pill bg-success-soft px-2.5 py-1 text-[11px] font-bold text-success" role="status">
          <Radio className="size-3.5" aria-hidden />
          {joined ? t('delivery.track.live') : t('delivery.track.refreshing')}
        </span>
      </div>

      <div className="p-4 sm:p-5">
        {dest || rider ? (
          <Suspense fallback={<Skeleton className="h-60 w-full rounded-lg sm:h-72" />}>
            <TrackingMap destination={dest} rider={rider} className="h-60 sm:h-72" />
          </Suspense>
        ) : (
          <div className="grid h-40 place-items-center rounded-lg bg-surface-2 p-4 text-center text-sm text-fg-muted">{t('delivery.track.noMap')}</div>
        )}
        {!rider && <p className="mt-2 text-xs text-fg-muted">{t('delivery.track.waiting')}</p>}
        {rider && (
          <p className="mt-2 text-xs text-fg-subtle">{t('delivery.track.updated', { time: formatRelative(rider.at, lang) })}</p>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-md bg-accent-50 p-3 dark:bg-accent-950/30">
            <Clock className="size-5 shrink-0 text-accent-800" aria-hidden />
            <div>
              <p className="text-xs text-fg-muted">{t('delivery.track.eta')}</p>
              <p className="text-base font-extrabold text-fg">
                {tr.eta != null
                  ? t('delivery.track.etaMin', { count: Math.max(1, Math.round(tr.eta)) })
                  : dest
                    ? t('delivery.track.etaUnknown')
                    : t('delivery.track.etaNoPin')}
              </p>
            </div>
          </div>
          {tr.rider && (
            <div className="flex items-center gap-3 rounded-md bg-surface-2 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-fg-muted">{t('delivery.track.rider')}</p>
                <p className="truncate text-sm font-bold text-fg">{tr.rider.name}</p>
                <p className="latin text-xs text-fg-subtle" dir="ltr">
                  {tr.rider.phone}
                </p>
              </div>
              {isDialable(tr.rider.phone) && (
                <Button size="sm" variant="secondary" href={`tel:${tr.rider.phone}`} leftIcon={<Phone className="size-4" />}>
                  {t('delivery.track.call')}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

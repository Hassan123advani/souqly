import { useEffect, useRef, useState } from 'react';
import type { RiderLocationInput } from '@souqly/shared';
import { useRealtime } from '@/api/config';
import { postRiderLocation } from '@/api/delivery';
import { getErrorCode } from '@/api/client';
import { acquireSocket, releaseSocket } from '@/lib/socket';

export type LiveLocationStatus = 'idle' | 'locating' | 'sharing' | 'denied' | 'unavailable' | 'stopped';
export type LiveLocationState = {
  status: LiveLocationStatus;
  position: { lat: number; lng: number; accuracy?: number } | null;
  lastSentAt: number | null;
  wakeLock: boolean;
};

const SEND_EVERY_MS = 5_000;
type Ack = { ok?: boolean; error?: { code: string; message: string } };
type WakeLockSentinelLike = { release: () => Promise<void>; released: boolean };

function toInput(c: GeolocationCoordinates): RiderLocationInput {
  const out: RiderLocationInput = { lat: c.latitude, lng: c.longitude };
  if (Number.isFinite(c.accuracy)) out.accuracy = Math.min(100_000, Math.max(0, c.accuracy));
  if (c.heading != null && Number.isFinite(c.heading)) out.heading = Math.min(360, Math.max(0, c.heading));
  if (c.speed != null && Number.isFinite(c.speed)) out.speed = Math.min(100, Math.max(0, c.speed));
  return out;
}

/**
 * While `active`, watches GPS and sends the latest fix every ~5 s over the socket (`rider:location`
 * with ack), falling back to REST when the socket is down. Without realtime (serverless) every fix
 * goes over REST (`POST /rider/deliveries/:id/location`) and no socket is opened. Holds a screen wake lock when the
 * browser supports it. Everything stops when `active` turns false or the component unmounts.
 * `onRejected` fires when the server refuses a location for good (e.g. the order is no longer out
 * for delivery).
 */
export function useLiveLocation(orderId: string, active: boolean, onRejected?: (code: string) => void): LiveLocationState {
  const [state, setState] = useState<LiveLocationState>({ status: 'idle', position: null, lastSentAt: null, wakeLock: false });
  const latest = useRef<RiderLocationInput | null>(null);
  const rejected = useRef(onRejected);
  rejected.current = onRejected;
  const { live, poll } = useRealtime();

  useEffect(() => {
    if (!active) {
      setState((s) => ({ ...s, status: s.status === 'idle' ? 'idle' : 'stopped', wakeLock: false }));
      return;
    }
    // Wait for the public config so the transport is known before GPS starts.
    if (!live && !poll) return;
    if (!('geolocation' in navigator)) {
      setState((s) => ({ ...s, status: 'unavailable' }));
      return;
    }
    let stopped = false;
    let sending = false;
    let lock: WakeLockSentinelLike | null = null;
    const socket = live ? acquireSocket() : null;
    setState((s) => ({ ...s, status: 'locating' }));

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        latest.current = toInput(pos.coords);
        setState((s) => ({
          ...s,
          status: 'sharing',
          position: { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy },
        }));
      },
      (err) => setState((s) => ({ ...s, status: err.code === err.PERMISSION_DENIED ? 'denied' : s.position ? s.status : 'unavailable' })),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );

    const handleError = (code: string | undefined) => {
      if (!code || code === 'TOO_FAST' || code === 'INTERNAL_ERROR' || code === 'RATE_LIMITED') return;
      stopped = true;
      navigator.geolocation.clearWatch(watchId);
      setState((s) => ({ ...s, status: 'stopped' }));
      rejected.current?.(code);
    };
    const sent = () => setState((s) => ({ ...s, lastSentAt: Date.now() }));

    const send = () => {
      const loc = latest.current;
      if (!loc || stopped || sending) return;
      sending = true;
      const viaRest = () =>
        postRiderLocation(orderId, loc)
          .then(sent)
          .catch((e) => handleError(getErrorCode(e)))
          .finally(() => {
            sending = false;
          });
      if (!socket?.connected) return void viaRest();
      socket.timeout(4_000).emit('rider:location', { orderId, ...loc }, (err: Error | null, ack?: Ack) => {
        if (err) return void viaRest();
        sending = false;
        if (ack?.ok) sent();
        else handleError(ack?.error?.code);
      });
    };
    const timer = window.setInterval(send, SEND_EVERY_MS);

    const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinelLike> } }).wakeLock;
    const requestLock = () => {
      if (!wl || stopped || document.visibilityState !== 'visible' || (lock && !lock.released)) return;
      wl.request('screen')
        .then((l) => {
          lock = l;
          if (stopped) void l.release();
          else setState((s) => ({ ...s, wakeLock: true }));
        })
        .catch(() => setState((s) => ({ ...s, wakeLock: false })));
    };
    requestLock();
    // The browser drops the wake lock when the tab is hidden; take it again on return.
    document.addEventListener('visibilitychange', requestLock);

    return () => {
      stopped = true;
      navigator.geolocation.clearWatch(watchId);
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', requestLock);
      if (lock && !lock.released) void lock.release();
      if (socket) releaseSocket();
    };
  }, [orderId, active, live, poll]);

  return state;
}

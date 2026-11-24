import { io, type Socket } from 'socket.io-client';
import { refreshOnce } from '@/api/client';

const base = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || undefined;

let socket: Socket | null = null;
let users = 0;
/** False after logout: the socket stays down until the next sign-in. */
let signedIn = true;
let authRetries = 0;
/**
 * False when the server has no Socket.io endpoint (`integrations.realtime: false`, e.g. serverless).
 * Consumers then poll instead; this guard makes sure nothing here ever opens a connection.
 */
let realtimeAvailable = true;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
const MAX_AUTH_RETRIES = 5;
const AUTH_ERRORS = new Set(['TOKEN_EXPIRED', 'UNAUTHENTICATED']);

function clearRetry() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
}

/** Handshake rejected for auth: refresh the session (single flight) and reconnect, with backoff. */
function onConnectError(err: Error & { data?: { code?: string } }) {
  const s = socket;
  const code = err.data?.code ?? err.message;
  if (!AUTH_ERRORS.has(code) || !s || !signedIn || !realtimeAvailable || retryTimer || authRetries >= MAX_AUTH_RETRIES) return;
  const delay = Math.min(30_000, 1000 * 2 ** authRetries);
  authRetries++;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    refreshOnce()
      .then(() => {
        if (socket === s && signedIn && realtimeAvailable && !s.connected) s.connect();
      })
      .catch(() => {
        /* refresh failed: the session is gone; useMe() will report the user as signed out */
      });
  }, delay);
}

function onConnect() {
  authRetries = 0;
}

/** The server kicked us (e.g. memberships changed): reconnect with a fresh handshake while signed in. */
function onDisconnect(reason: Socket.DisconnectReason) {
  if (reason === 'io server disconnect' && signedIn && realtimeAvailable) socket?.connect();
}

/** Set from the public config (`useRealtime`). Turning it off drops any open connection. */
export function setRealtimeAvailable(available: boolean): void {
  if (realtimeAvailable === available) return;
  realtimeAvailable = available;
  if (!available) {
    clearRetry();
    socket?.disconnect();
  }
}

/**
 * Shared socket.io connection (cookie auth, so `withCredentials`). The server joins the user's
 * own room and the rooms of every store they belong to on connect. Ref-counted: the connection
 * closes when the last consumer releases it. When realtime is unavailable the socket is created
 * without connecting (consumers should not call this then; see `useRealtime`).
 */
export function acquireSocket(): Socket {
  if (!socket) {
    socket = io(base ?? '/', {
      path: '/socket.io',
      withCredentials: true,
      transports: ['websocket', 'polling'],
      autoConnect: realtimeAvailable,
    });
    socket.on('connect', onConnect);
    socket.on('connect_error', onConnectError);
    socket.on('disconnect', onDisconnect);
  }
  users++;
  return socket;
}

export function releaseSocket(): void {
  users = Math.max(0, users - 1);
  if (users === 0 && socket) {
    clearRetry();
    socket.disconnect();
    socket = null;
  }
}

/** Logout: drop the connection (listeners stay attached for the next session). */
export function socketSignedOut(): void {
  signedIn = false;
  clearRetry();
  authRetries = 0;
  socket?.disconnect();
}

/** Login (possibly as a different user): reconnect so the handshake picks up the new identity and rooms. */
export function socketSignedIn(): void {
  signedIn = true;
  clearRetry();
  authRetries = 0;
  if (socket && realtimeAvailable) {
    socket.disconnect();
    socket.connect();
  }
}

/** A short two-note chime generated with WebAudio (no audio asset needed). */
export function playChime(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t0 = now + i * 0.16;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.4);
    });
    setTimeout(() => void ctx.close(), 900);
  } catch {
    /* autoplay blocked or audio unavailable: the toast is still shown */
  }
}

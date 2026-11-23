import { io, type Socket } from 'socket.io-client';

const base = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || undefined;

let socket: Socket | null = null;
let users = 0;

/**
 * Shared socket.io connection (cookie auth, so `withCredentials`). The server joins the user's
 * own room and the rooms of every store they belong to on connect. Ref-counted: the connection
 * closes when the last consumer releases it.
 */
export function acquireSocket(): Socket {
  if (!socket) socket = io(base ?? '/', { path: '/socket.io', withCredentials: true, transports: ['websocket', 'polling'] });
  users++;
  return socket;
}

export function releaseSocket(): void {
  users = Math.max(0, users - 1);
  if (users === 0 && socket) {
    socket.disconnect();
    socket = null;
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

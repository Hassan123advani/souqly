/** In-memory ring buffer of the last 50 error-handler events (admin system health). No bodies, no secrets. */
export type ErrorEvent = { at: string; method: string; path: string; status: number; code: string; message: string };

const MAX = 50;
const ring: ErrorEvent[] = [];

export function recordError(e: ErrorEvent): void {
  ring.push({ ...e, message: e.message.slice(0, 300), path: e.path.slice(0, 200) });
  if (ring.length > MAX) ring.splice(0, ring.length - MAX);
}

/** Newest first. */
export function recentErrors(): ErrorEvent[] {
  return [...ring].reverse();
}

export function clearErrors(): void {
  ring.length = 0;
}

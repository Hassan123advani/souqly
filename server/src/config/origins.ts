import { env, isProd } from './env';

function originOf(url: string): string | undefined {
  try {
    const u = new URL(url.trim());
    return u.origin === 'null' ? undefined : u.origin;
  } catch {
    return undefined;
  }
}

/** Matches exactly `http://localhost:<port>` / `http://127.0.0.1:<port>` (no path, no userinfo). */
const LOCAL_DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

export type OriginPolicy = { production: boolean; clientUrl: string; extra?: string };

/** Origins allowed by the policy: CLIENT_URL + CORS_EXTRA_ORIGINS (+ any local http origin outside production). */
export function makeOriginCheck(policy: OriginPolicy): (origin: string) => boolean {
  const allowed = new Set(
    [policy.clientUrl, ...(policy.extra ?? '').split(',')]
      .map((o) => (o.trim() ? originOf(o) : undefined))
      .filter((o): o is string => !!o),
  );
  return (origin: string) => allowed.has(origin) || (!policy.production && LOCAL_DEV_ORIGIN.test(origin));
}

/** The app's policy (Express CORS + Socket.io). */
export const isAllowedOrigin = makeOriginCheck({ production: isProd, clientUrl: env.CLIENT_URL, ...(env.CORS_EXTRA_ORIGINS ? { extra: env.CORS_EXTRA_ORIGINS } : {}) });

/** `cors` / socket.io origin callback: echoes allowed origins, refuses others (no CORS headers). */
export function corsOrigin(origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void): void {
  cb(null, !origin || isAllowedOrigin(origin));
}

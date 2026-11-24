import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Express } from 'express';

/**
 * Serverless entry for Vercel (`api/index.mjs` re-exports this bundle's default handler).
 *
 * - This entry always runs with `SERVERLESS` on (unless explicitly set), so `/config/public` reports
 *   `realtime: false`, uploads require Cloudinary and the in-process scheduler is never started.
 * - Socket.io is NOT attached: every emit helper is a no-op when `getIO()` is undefined, and the
 *   client falls back to polling. Periodic sweeps run via Vercel Cron → `/api/v1/internal/cron/all`.
 * - Everything (env, db, app) is imported lazily so an invalid configuration answers a JSON 503 and
 *   is logged, instead of crashing the module load. The app + Mongo connection are built once per
 *   warm instance and reused across invocations; a failed init is retried on the next request.
 * - Nothing here writes to disk (the function filesystem is read-only except /tmp).
 */
process.env.SERVERLESS ??= '1';

let ready: Promise<Express> | null = null;

async function init(): Promise<Express> {
  const { connectDb } = await import('./config/db');
  await connectDb();
  // Idempotent legacy-data migration once per cold start (it no longer runs inside every billing sweep).
  const { migrateBilling } = await import('./modules/billing/billing.service');
  await migrateBilling().catch((err: unknown) => console.error('[souqly] Billing migration failed:', err instanceof Error ? err.message : err));
  const { app } = await import('./app');
  return app;
}

function unavailable(res: ServerResponse): void {
  if (res.headersSent) return;
  res.statusCode = 503;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Service is starting or misconfigured' } }));
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  ready ??= init().catch((err: unknown) => {
    ready = null; // retry on the next request instead of caching the failure
    throw err;
  });
  let app: Express;
  try {
    app = await ready;
  } catch (err) {
    try {
      const { logger } = await import('./lib/logger');
      logger.error({ err }, 'Serverless init failed');
    } catch {
      // The logger depends on a valid env; env.ts already printed the configuration issues.
      console.error('[souqly] Serverless init failed:', err instanceof Error ? err.message : err);
    }
    return unavailable(res);
  }
  // Resolve only when the response is done, so the runtime never freezes the instance mid-request.
  await new Promise<void>((resolve) => {
    res.once('finish', resolve);
    res.once('close', resolve);
    app(req as Parameters<Express>[0], res as Parameters<Express>[1]);
  });
}

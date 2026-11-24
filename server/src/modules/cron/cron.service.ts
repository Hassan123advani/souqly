import crypto from 'node:crypto';
import { logger } from '../../lib/logger';
import { SWEEPS, type SweepName, type SweepResult } from '../../services/jobs/sweeps';

export type CronJobResult = { job: SweepName; ok: boolean; ms: number; result?: SweepResult };

/** Runs the given sweeps one after another; a failing sweep is logged and does not stop the others. */
export async function runSweeps(names: readonly SweepName[]): Promise<CronJobResult[]> {
  const out: CronJobResult[] = [];
  for (const job of names) {
    const started = Date.now();
    try {
      const result = await SWEEPS[job]();
      out.push({ job, ok: true, ms: Date.now() - started, result });
      logger.info({ job, result, ms: Date.now() - started }, 'Cron sweep done');
    } catch (err) {
      out.push({ job, ok: false, ms: Date.now() - started });
      logger.error({ err, job }, 'Cron sweep failed');
    }
  }
  return out;
}

/**
 * Constant-time check of `Authorization: Bearer <secret>`. Both sides are hashed first so the
 * comparison never leaks the secret's length.
 */
export function isValidCronAuth(header: string | undefined, secret: string): boolean {
  if (!header?.startsWith('Bearer ')) return false;
  const a = crypto.createHash('sha256').update(header.slice('Bearer '.length)).digest();
  const b = crypto.createHash('sha256').update(secret).digest();
  return crypto.timingSafeEqual(a, b);
}

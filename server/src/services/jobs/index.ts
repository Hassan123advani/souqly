import { logger } from '../../lib/logger';

export type JobHandler<P = unknown> = (payload: P) => Promise<void> | void;

/**
 * Background jobs. Only an in-process implementation exists (Redis/BullMQ is not installed — see D-012).
 * Scheduled jobs are lost on restart, so handlers must be idempotent and periodic sweeps
 * (`every`) should re-derive pending work from the database.
 */
export interface JobQueue {
  readonly name: 'in-process' | 'redis';
  register<P>(name: string, handler: JobHandler<P>): void;
  schedule<P>(name: string, runAt: Date, payload: P): void;
  every(name: string, ms: number, fn: () => Promise<void> | void): void;
  stop(): void;
  /** Snapshot for the admin system-health page. */
  stats(): JobStats;
}

export type JobStats = { name: string; registered: string[]; periodic: string[]; scheduled: number; completed: number; failed: number; lastError?: { job: string; at: string } };

const MAX_TIMEOUT = 2_147_483_647; // setTimeout limit (~24.8 days)

class InProcessJobQueue implements JobQueue {
  readonly name = 'in-process' as const;
  private handlers = new Map<string, JobHandler<unknown>>();
  private timers = new Set<NodeJS.Timeout>();
  private intervals = new Map<string, NodeJS.Timeout>();
  private stopped = false;
  private completed = 0;
  private failed = 0;
  private lastError?: { job: string; at: string };

  stats(): JobStats {
    return {
      name: this.name,
      registered: [...this.handlers.keys()],
      periodic: [...this.intervals.keys()],
      scheduled: this.timers.size,
      completed: this.completed,
      failed: this.failed,
      ...(this.lastError ? { lastError: this.lastError } : {}),
    };
  }

  register<P>(name: string, handler: JobHandler<P>): void {
    this.handlers.set(name, handler as JobHandler<unknown>);
  }

  schedule<P>(name: string, runAt: Date, payload: P): void {
    if (this.stopped) return;
    const delay = Math.max(0, runAt.getTime() - Date.now());
    const t = setTimeout(() => {
      this.timers.delete(t);
      if (delay > MAX_TIMEOUT) return this.schedule(name, runAt, payload);
      void this.run(name, payload);
    }, Math.min(delay, MAX_TIMEOUT));
    t.unref();
    this.timers.add(t);
  }

  every(name: string, ms: number, fn: () => Promise<void> | void): void {
    if (this.stopped) return;
    const existing = this.intervals.get(name);
    if (existing) clearInterval(existing);
    let running = false;
    const t = setInterval(async () => {
      if (running) return; // never overlap runs of the same periodic job
      running = true;
      try {
        await fn();
      } catch (err) {
        logger.error({ err, job: name }, 'Periodic job failed');
      } finally {
        running = false;
      }
    }, ms);
    t.unref();
    this.intervals.set(name, t);
  }

  stop(): void {
    this.stopped = true;
    for (const t of this.timers) clearTimeout(t);
    for (const t of this.intervals.values()) clearInterval(t);
    this.timers.clear();
    this.intervals.clear();
  }

  private async run(name: string, payload: unknown) {
    const handler = this.handlers.get(name);
    if (!handler) return logger.error({ job: name }, 'No handler registered for job');
    try {
      await handler(payload);
      this.completed++;
    } catch (err) {
      this.failed++;
      this.lastError = { job: name, at: new Date().toISOString() };
      logger.error({ err, job: name }, 'Job failed');
    }
  }
}

let instance: JobQueue | undefined;

export function getJobs(): JobQueue {
  instance ??= new InProcessJobQueue();
  return instance;
}

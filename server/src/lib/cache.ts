import { isTest } from '../config/env';

/**
 * Tiny in-process TTL cache with in-flight de-duplication. Disabled under NODE_ENV=test so tests
 * always see fresh data. Single-instance only (fine for now; Redis can replace it later).
 */
export class TtlCache<T> {
  private store = new Map<string, { value: T; at: number }>();
  private inflight = new Map<string, Promise<T>>();
  constructor(private readonly ttlMs: number, private readonly maxEntries = 500) {}

  async get(key: string, load: () => Promise<T>): Promise<T> {
    if (isTest) return load();
    const hit = this.store.get(key);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.value;
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const p = load()
      .then((value) => {
        if (this.store.size >= this.maxEntries) this.store.delete(this.store.keys().next().value as string);
        this.store.set(key, { value, at: Date.now() });
        return value;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  clear(): void {
    this.store.clear();
  }
}

import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { getErrorCode, getErrorStatus } from '@/api/client';
import { posClient, type PosCatalogRow, type PosSaleBody, type PosSaleResult } from '@/api/growth';
import { getMeta, openPosDb, setMeta, toStored, type LocalReceipt, type PosDb, type QueuedSale } from './posDb';

const SYNC_BATCH = 50;
const SYNC_EVERY_MS = 30_000;
const KEEP_SYNCED_MS = 7 * 24 * 3600_000;
/** Safety cap on truncated catalog pages fetched in one refresh. */
const MAX_CATALOG_PAGES = 20;

/** Browser online state (navigator.onLine + events). */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

const isNetworkError = (err: unknown) => axios.isAxiosError(err) && !err.response;

/**
 * Offline-first POS engine for one store: catalog mirror in IndexedDB (delta-synced with
 * `updatedSince`), a durable sale queue keyed by an idempotent `clientId`, and a single-flight
 * sync loop (on load, on reconnect, every 30 s and after each sale).
 */
export function usePosEngine(storeId: string | undefined) {
  const online = useOnline();
  const dbRef = useRef<PosDb | null>(null);
  const syncing = useRef(false);
  const [catalog, setCatalog] = useState<Map<string, PosCatalogRow>>(new Map());
  const [queue, setQueue] = useState<QueuedSale[]>([]);
  const [ready, setReady] = useState(false);
  const [dbError, setDbError] = useState<unknown>(null);
  const [catalogError, setCatalogError] = useState<unknown>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const reloadQueue = useCallback(async () => {
    const db = dbRef.current;
    if (!db) return;
    const all = await db.getAll('queue');
    setQueue(all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }, []);

  const refreshCatalog = useCallback(
    async (full = false) => {
      const db = dbRef.current;
      if (!db || !storeId || !navigator.onLine) return;
      setRefreshing(true);
      try {
        let since = full ? undefined : await getMeta(db, 'serverTime');
        let clear = full;
        // Follow truncated pages (`hasMore`) so large catalogs are mirrored completely.
        for (let page = 0; page < MAX_CATALOG_PAGES; page++) {
          const { items, serverTime, hasMore } = await posClient(storeId).catalog(since);
          if (dbRef.current !== db) return;
          const tx = db.transaction('catalog', 'readwrite');
          if (clear) await tx.store.clear();
          for (const r of items) await tx.store.put(toStored(r));
          await tx.done;
          await setMeta(db, { key: 'serverTime', value: serverTime });
          setLastSync(serverTime);
          clear = false;
          since = serverTime;
          if (!hasMore || items.length === 0) break;
        }
        const rows = await db.getAll('catalog');
        setCatalog(new Map(rows.map((r) => [r.variantId, r])));
        setCatalogError(null);
      } catch (err) {
        // The DB is closed once the store changes or the page unmounts; that is not a catalog error.
        if (dbRef.current === db && !isNetworkError(err)) setCatalogError(err);
      } finally {
        setRefreshing(false);
      }
    },
    [storeId],
  );

  /** Writes server results for sent sales (non-retryable errors stop; SYNC_FAILED stays pending). */
  const applyResults = useCallback(async (db: PosDb, sent: QueuedSale[], results: PosSaleResult[]) => {
    const byId = new Map(results.map((r) => [r.clientId, r]));
    const tx = db.transaction('queue', 'readwrite');
    for (const p of sent) {
      const r = byId.get(p.clientId);
      if (!r) continue;
      const retryable = r.status === 'error' && r.error?.code === 'SYNC_FAILED';
      await tx.store.put({ ...p, result: r, attempts: p.attempts + 1, status: r.status === 'error' ? (retryable ? 'pending' : 'error') : 'synced' });
    }
    await tx.done;
  }, []);

  /**
   * Sends pending sales in batches of 50. Server results are idempotent per clientId. Never rejects:
   * it is fired with `void` from timers and effects, and the DB may be closed underneath it on unmount.
   */
  const flush = useCallback(async () => {
    const db = dbRef.current;
    if (!db || !storeId || syncing.current || !navigator.onLine) return;
    syncing.current = true;
    setIsSyncing(true);
    const client = posClient(storeId);
    const isValidation = (err: unknown) => getErrorStatus(err) === 400 && getErrorCode(err) === 'VALIDATION_ERROR';
    try {
      for (;;) {
        if (dbRef.current !== db) return;
        const pending = (await db.getAllFromIndex('queue', 'status', 'pending')).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(0, SYNC_BATCH);
        if (!pending.length) break;
        let results: PosSaleResult[];
        try {
          results = (await client.sync(pending.map((p) => p.body))).results;
        } catch (err) {
          if (!isValidation(err)) break; // offline, auth or server error: retry later
          // The batch was rejected by validation: resend one by one so only the invalid sales are marked as errors.
          let stop = false;
          for (const p of pending) {
            if (dbRef.current !== db) return;
            try {
              await applyResults(db, [p], (await client.sync([p.body])).results);
            } catch (one) {
              if (!isValidation(one)) {
                stop = true;
                break;
              }
              await db.put('queue', { ...p, status: 'error', attempts: p.attempts + 1, result: { clientId: p.clientId, status: 'error', error: { code: 'VALIDATION_ERROR', message: '' } } });
            }
          }
          if (stop) break;
          continue;
        }
        if (dbRef.current !== db) return;
        await applyResults(db, pending, results);
        if (results.some((r) => r.status === 'error' && r.error?.code === 'SYNC_FAILED')) break;
      }
    } catch (err) {
      // A closed DB (store switch / unmount) is expected; anything else is a storage failure.
      if (dbRef.current === db) setDbError(err);
    } finally {
      syncing.current = false;
      setIsSyncing(false);
      if (dbRef.current === db) await reloadQueue().catch(() => undefined);
    }
  }, [storeId, reloadQueue, applyResults]);

  // Open the store's DB, load the mirror + queue, prune old synced sales, then sync.
  useEffect(() => {
    if (!storeId) return;
    let cancelled = false;
    setReady(false);
    openPosDb(storeId)
      .then(async (db) => {
        if (cancelled) return db.close();
        dbRef.current = db;
        const now = Date.now();
        const old = (await db.getAllFromIndex('queue', 'status', 'synced')).filter((q) => now - new Date(q.createdAt).getTime() > KEEP_SYNCED_MS);
        for (const q of old) await db.delete('queue', q.clientId);
        const rows = await db.getAll('catalog');
        setCatalog(new Map(rows.map((r) => [r.variantId, r])));
        setLastSync((await getMeta(db, 'serverTime')) ?? null);
        await reloadQueue();
        setReady(true);
        void refreshCatalog(rows.length === 0);
        void flush();
      })
      .catch((err) => setDbError(err));
    return () => {
      cancelled = true;
      dbRef.current?.close();
      dbRef.current = null;
    };
  }, [storeId, refreshCatalog, flush, reloadQueue]);

  useEffect(() => {
    if (!online || !ready) return;
    void flush();
    void refreshCatalog();
    const id = setInterval(() => void flush(), SYNC_EVERY_MS);
    return () => clearInterval(id);
  }, [online, ready, flush, refreshCatalog]);

  /** Exact barcode / SKU match, locally first, then the server when online. */
  const lookup = useCallback(
    async (code: string): Promise<PosCatalogRow | null> => {
      const db = dbRef.current;
      const c = code.trim();
      if (!db || !c) return null;
      const hit = (await db.getFromIndex('catalog', 'barcode', c)) ?? (await db.getFromIndex('catalog', 'skuLower', c.toLowerCase()));
      if (hit) return hit;
      if (!storeId || !navigator.onLine) return null;
      try {
        const row = await posClient(storeId).lookup(c);
        await db.put('catalog', toStored(row));
        setCatalog((m) => new Map(m).set(row.variantId, row));
        return row;
      } catch {
        return null;
      }
    },
    [storeId],
  );

  /** Durably queues a sale, decrements the local stock mirror and triggers a sync. */
  const enqueue = useCallback(
    async (body: PosSaleBody, receipt: LocalReceipt) => {
      const db = dbRef.current;
      if (!db) throw new Error('POS storage is not ready');
      const item: QueuedSale = { clientId: body.clientId, body, receipt, status: 'pending', attempts: 0, createdAt: body.createdAt };
      const tx = db.transaction(['queue', 'catalog'], 'readwrite');
      await tx.objectStore('queue').put(item);
      for (const i of body.items) {
        const row = await tx.objectStore('catalog').get(i.variantId);
        if (row) await tx.objectStore('catalog').put({ ...row, stock: Math.max(0, row.stock - i.qty) });
      }
      await tx.done;
      setCatalog((m) => {
        const next = new Map(m);
        for (const i of body.items) {
          const r = next.get(i.variantId);
          if (r) next.set(i.variantId, { ...r, stock: Math.max(0, r.stock - i.qty) });
        }
        return next;
      });
      await reloadQueue();
      void flush();
      return item;
    },
    [flush, reloadQueue],
  );

  const retry = useCallback(
    async (clientId: string) => {
      const db = dbRef.current;
      const q = db && (await db.get('queue', clientId));
      if (!db || !q) return;
      await db.put('queue', { ...q, status: 'pending' });
      await reloadQueue();
      void flush();
    },
    [flush, reloadQueue],
  );

  const discard = useCallback(
    async (clientId: string) => {
      const db = dbRef.current;
      if (!db) return;
      await db.delete('queue', clientId);
      await reloadQueue();
    },
    [reloadQueue],
  );

  return {
    online,
    ready,
    dbError,
    catalogError,
    catalog,
    queue,
    pendingCount: queue.filter((q) => q.status === 'pending').length,
    errorCount: queue.filter((q) => q.status === 'error').length,
    isSyncing,
    refreshing,
    lastSync,
    refreshCatalog,
    flush,
    lookup,
    enqueue,
    retry,
    discard,
    db: dbRef,
  };
}

export type PosEngine = ReturnType<typeof usePosEngine>;

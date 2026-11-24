import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { PosCatalogRow, PosSaleBody, PosSaleResult, PosShift } from '@/api/growth';

/** Receipt snapshot kept with every queued sale so it can be printed while offline. */
export type LocalReceipt = {
  clientId: string;
  at: string;
  store: { name: string; address: string; phone: string | null };
  items: { title: string; options: Record<string, string>; qty: number; price: number; discount: number; lineTotal: number }[];
  subtotal: number;
  discount: number;
  total: number;
  payments: { method: 'cash' | 'card' | 'wallet'; amount: number }[];
  change: number;
  customer: { phone?: string; name?: string } | null;
};

export type QueuedSale = {
  clientId: string;
  body: PosSaleBody;
  receipt: LocalReceipt;
  /** pending = waiting to sync, synced = saved on the server, error = rejected (needs attention). */
  status: 'pending' | 'synced' | 'error';
  result?: PosSaleResult;
  attempts: number;
  createdAt: string;
};

type Meta = { key: 'serverTime'; value: string } | { key: 'shift'; value: PosShift | null };

interface PosDB extends DBSchema {
  catalog: { key: string; value: PosCatalogRow & { skuLower: string }; indexes: { barcode: string; skuLower: string } };
  queue: { key: string; value: QueuedSale; indexes: { status: string } };
  meta: { key: string; value: Meta };
}

export type PosDb = IDBPDatabase<PosDB>;

/** One database per store, so a cashier who works for two stores never mixes catalogs or queues. */
export function openPosDb(storeId: string): Promise<PosDb> {
  return openDB<PosDB>(`souqly-pos-${storeId}`, 1, {
    upgrade(db) {
      const catalog = db.createObjectStore('catalog', { keyPath: 'variantId' });
      catalog.createIndex('barcode', 'barcode');
      catalog.createIndex('skuLower', 'skuLower');
      const queue = db.createObjectStore('queue', { keyPath: 'clientId' });
      queue.createIndex('status', 'status');
      db.createObjectStore('meta', { keyPath: 'key' });
    },
  });
}

export const toStored = (r: PosCatalogRow) => ({ ...r, skuLower: r.sku.toLowerCase() });

type MetaValues = { serverTime: string; shift: PosShift | null };

export async function getMeta<K extends keyof MetaValues>(db: PosDb, key: K): Promise<MetaValues[K] | undefined> {
  const row = await db.get('meta', key);
  return row?.value as MetaValues[K] | undefined;
}

export async function setMeta(db: PosDb, meta: Meta): Promise<void> {
  await db.put('meta', meta);
}

/** UUID v4 for idempotent sale ids (crypto.randomUUID needs a secure context). */
export function newClientId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** What the cart needs to render a line without refetching the product. Prices in minor units. */
export type CartSnapshot = {
  title: string;
  slug: string;
  image: string;
  price: number;
  compareAtPrice?: number;
  sku?: string;
  /** Selected option values, e.g. { color: 'White', size: 'M' }. */
  options?: Record<string, string>;
  store: { slug: string; name: string };
  /** Available stock when added; caps the quantity. */
  maxQty: number;
};

export type CartItem = { productId: string; variantId: string; qty: number; snapshot: CartSnapshot; addedAt: number };

type AddInput = Omit<CartItem, 'addedAt'>;
export type ServerLine = { productId: string; variantId: string; qty: number };
/** Adds a line to the signed-in user's server cart; registered by <CartSync />. */
export type ServerAdder = (item: ServerLine) => Promise<void>;

type CartState = {
  /** Guest lines (localStorage). Empty while signed in: they are merged into the server cart on login. */
  items: CartItem[];
  /** 'server' once the user is signed in and the guest cart has been merged. */
  mode: 'guest' | 'server';
  /** Units in the server cart (kept in sync by <CartSync />). */
  serverCount: number;
  /** Units in the active cart, used by the header and bottom-nav badges. */
  count: number;
  /** Adds to the server cart when signed in, else to the local guest cart. */
  add: (item: AddInput) => void;
  setQty: (productId: string, variantId: string, qty: number) => void;
  remove: (productId: string, variantId: string) => void;
  clear: () => void;
  setServer: (mode: 'guest' | 'server', serverCount?: number) => void;
};

const sum = (items: CartItem[]) => items.reduce((n, i) => n + i.qty, 0);
const same = (a: { productId: string; variantId: string }, productId: string, variantId: string) =>
  a.productId === productId && a.variantId === variantId;
const clampQty = (qty: number, max: number) => Math.max(1, Math.min(Math.floor(qty), Math.max(1, max), 99));

let serverAdder: ServerAdder | null = null;
export function registerServerAdder(fn: ServerAdder | null) {
  serverAdder = fn;
}

/** Adds made while the guest cart is being merged on login; flushed to the server afterwards. */
let mergeQueue: ServerLine[] | null = null;
export function beginMerge() {
  mergeQueue = [];
}
/** Ends the merge window and returns the adds queued during it. */
export function endMerge(): ServerLine[] {
  const queued = mergeQueue ?? [];
  mergeQueue = null;
  return queued;
}

/** Guest lines + badge count for the given mode. */
const withItems = (s: CartState, items: CartItem[]) => ({ items, count: s.mode === 'server' ? s.serverCount : sum(items) });

/**
 * Cart entry point for the whole app. Guests keep lines in localStorage ("souqly-cart");
 * signed-in users use the server cart (TanStack Query, see api/cart.ts) and <CartSync /> merges
 * the guest lines once on login.
 */
export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      mode: 'guest',
      serverCount: 0,
      count: 0,
      add: ({ productId, variantId, qty, snapshot }) => {
        if (mergeQueue) {
          // A guest line added now would be left behind by the merge: queue it for the server cart.
          mergeQueue.push({ productId, variantId, qty });
          set((s) => ({ count: s.count + qty }));
          return;
        }
        if (get().mode === 'server' && serverAdder) {
          void serverAdder({ productId, variantId, qty });
          return;
        }
        set((s) => {
          const existing = s.items.find((i) => same(i, productId, variantId));
          const items = existing
            ? s.items.map((i) =>
                same(i, productId, variantId) ? { ...i, snapshot, qty: clampQty(i.qty + qty, snapshot.maxQty) } : i,
              )
            : [...s.items, { productId, variantId, qty: clampQty(qty, snapshot.maxQty), snapshot, addedAt: Date.now() }];
          return withItems(s, items);
        });
      },
      setQty: (productId, variantId, qty) =>
        set((s) => withItems(s, s.items.map((i) => (same(i, productId, variantId) ? { ...i, qty: clampQty(qty, i.snapshot.maxQty) } : i)))),
      remove: (productId, variantId) => set((s) => withItems(s, s.items.filter((i) => !same(i, productId, variantId)))),
      clear: () => set((s) => withItems(s, [])),
      setServer: (mode, serverCount) =>
        set((s) => {
          const sc = serverCount ?? s.serverCount;
          return { mode, serverCount: sc, count: mode === 'server' ? sc : sum(s.items) };
        }),
    }),
    {
      name: 'souqly-cart',
      version: 1,
      partialize: (s) => ({ items: s.items }),
      // Recompute the badge count from the stored lines.
      merge: (persisted, current) => {
        const items = Array.isArray((persisted as { items?: unknown })?.items) ? (persisted as { items: CartItem[] }).items : [];
        return { ...current, items, count: sum(items) };
      },
    },
  ),
);

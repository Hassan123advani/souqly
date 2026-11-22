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

type CartState = {
  items: CartItem[];
  /** Total units, used by the header and bottom-nav badges. */
  count: number;
  add: (item: Omit<CartItem, 'addedAt'>) => void;
  setQty: (productId: string, variantId: string, qty: number) => void;
  remove: (productId: string, variantId: string) => void;
  clear: () => void;
};

const sum = (items: CartItem[]) => items.reduce((n, i) => n + i.qty, 0);
const same = (a: { productId: string; variantId: string }, productId: string, variantId: string) =>
  a.productId === productId && a.variantId === variantId;
const clampQty = (qty: number, max: number) => Math.max(1, Math.min(Math.floor(qty), Math.max(1, max), 99));

/**
 * Guest cart kept in localStorage ("souqly-cart"). Phase 6 syncs it with the server cart on login;
 * the shape { productId, variantId, qty, snapshot } is what that sync will send.
 */
export const useCart = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      count: 0,
      add: ({ productId, variantId, qty, snapshot }) =>
        set((s) => {
          const existing = s.items.find((i) => same(i, productId, variantId));
          const items = existing
            ? s.items.map((i) =>
                same(i, productId, variantId) ? { ...i, snapshot, qty: clampQty(i.qty + qty, snapshot.maxQty) } : i,
              )
            : [...s.items, { productId, variantId, qty: clampQty(qty, snapshot.maxQty), snapshot, addedAt: Date.now() }];
          return { items, count: sum(items) };
        }),
      setQty: (productId, variantId, qty) =>
        set((s) => {
          const items = s.items.map((i) => (same(i, productId, variantId) ? { ...i, qty: clampQty(qty, i.snapshot.maxQty) } : i));
          return { items, count: sum(items) };
        }),
      remove: (productId, variantId) =>
        set((s) => {
          const items = s.items.filter((i) => !same(i, productId, variantId));
          return { items, count: sum(items) };
        }),
      clear: () => set({ items: [], count: 0 }),
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

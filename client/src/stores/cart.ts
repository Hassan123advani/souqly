import { create } from 'zustand';

/**
 * Phase 1 placeholder: only the badge count lives here.
 * Phase 4 replaces it with the server-backed cart (TanStack Query) and keeps this for the drawer state.
 */
type CartState = {
  count: number;
  setCount: (n: number) => void;
};

export const useCart = create<CartState>()((set) => ({
  count: 0,
  setCount: (count) => set({ count: Math.max(0, count) }),
}));

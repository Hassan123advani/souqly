import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type ActiveStoreState = {
  /** Store the user chose in the Seller Center switcher (verified server-side against membership). */
  storeId: string | null;
  setStoreId: (id: string) => void;
  /** Forget the choice (logout / another user signs in). */
  reset: () => void;
};

export const useActiveStore = create<ActiveStoreState>()(
  persist((set) => ({ storeId: null, setStoreId: (storeId) => set({ storeId }), reset: () => set({ storeId: null }) }), {
    name: 'souqly-seller-store',
  }),
);

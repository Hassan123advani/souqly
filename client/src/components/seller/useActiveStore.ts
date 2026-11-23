import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useMe } from '@/api/auth';

type ActiveStoreState = {
  /** Store the user chose in the Seller Center switcher (verified server-side against membership). */
  storeId: string | null;
  setStoreId: (id: string) => void;
};

export const useActiveStore = create<ActiveStoreState>()(
  persist((set) => ({ storeId: null, setStoreId: (storeId) => set({ storeId }) }), { name: 'souqly-seller-store' }),
);

/** Id of the store the Seller Center acts on: the persisted choice if still a membership, else the first store. */
export function useActiveStoreId(): string | undefined {
  const { data: me } = useMe();
  const chosen = useActiveStore((s) => s.storeId);
  const stores = me?.stores ?? [];
  return stores.find((s) => s.id === chosen)?.id ?? stores[0]?.id;
}


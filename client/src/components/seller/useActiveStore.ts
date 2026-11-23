import { useMe } from '@/api/auth';
import { useActiveStore } from '@/stores/activeStore';

export { useActiveStore };

/** Id of the store the Seller Center acts on: the persisted choice if still a membership, else the first store. */
export function useActiveStoreId(): string | undefined {
  const { data: me } = useMe();
  const chosen = useActiveStore((s) => s.storeId);
  const stores = me?.stores ?? [];
  return stores.find((s) => s.id === chosen)?.id ?? stores[0]?.id;
}

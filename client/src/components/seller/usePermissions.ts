import type { Permission } from '@souqly/shared';
import { useSellerStore } from '@/api/seller';

/** True when the signed-in member holds `perm` in the active store (from GET /seller/store `myPermissions`). */
export function useCan(): (perm: Permission) => boolean {
  const { data } = useSellerStore();
  const granted = data?.myPermissions ?? [];
  return (perm) => granted.includes(perm);
}

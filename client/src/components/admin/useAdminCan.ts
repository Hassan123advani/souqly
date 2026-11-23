import { useCallback } from 'react';
import type { Permission } from '@souqly/shared';
import { useMe } from '@/api/auth';

/** `can(perm)` for the signed-in staff member (server enforces too; this only hides UI). */
export function useAdminCan() {
  const { data: me } = useMe();
  return useCallback((p: Permission) => !!me?.permissions.includes(p), [me]);
}

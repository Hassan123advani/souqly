import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { setRealtimeAvailable } from '@/lib/socket';
import { get } from './client';
import type { PublicConfig } from './types';

/** Public site config: announcement, enabled integrations and feature flags. */
export function usePublicConfig() {
  return useQuery({
    queryKey: ['config', 'public'],
    queryFn: () => get<PublicConfig>('/config/public'),
    staleTime: 10 * 60_000,
    retry: 1,
  });
}

/** True only when the server explicitly enabled the flag. Unknown/offline => hidden. */
export function useFlag(flag: string): boolean {
  const { data } = usePublicConfig();
  return !!data?.flags?.[flag];
}

/**
 * Whether live updates come over Socket.io (`live`) or TanStack Query polling (`poll`).
 * Serverless deployments report `integrations.realtime: false`; anything else (including a
 * config that failed to load) keeps the socket. Both are false while the config is loading, so
 * nothing connects before we know the socket server exists.
 */
export function useRealtime(): { live: boolean; poll: boolean } {
  const { data, isPending } = usePublicConfig();
  const enabled = data?.integrations.realtime !== false;
  // Sync the socket module outside render; this effect runs before the caller's own effects that connect.
  useEffect(() => {
    if (!isPending) setRealtimeAvailable(enabled);
  }, [isPending, enabled]);
  if (isPending) return { live: false, poll: false };
  return { live: enabled, poll: !enabled };
}

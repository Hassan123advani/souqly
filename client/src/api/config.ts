import { useQuery } from '@tanstack/react-query';
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

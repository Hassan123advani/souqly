import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/** List filters kept in the URL (shareable, survive reloads). Empty values are removed. */
export function useUrlFilters<K extends string>(keys: readonly K[]) {
  const [sp, setSp] = useSearchParams();
  const values = Object.fromEntries(keys.map((k) => [k, sp.get(k) ?? ''])) as Record<K, string>;
  const set = useCallback(
    (patch: Partial<Record<K, string>>) => {
      setSp(
        (prev) => {
          const n = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch) as [string, string | undefined][]) {
            if (v) n.set(k, v);
            else n.delete(k);
          }
          return n;
        },
        { replace: true },
      );
    },
    [setSp],
  );
  return [values, set] as const;
}

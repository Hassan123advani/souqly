import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMe } from '@/api/auth';

/** Runs `fn` for signed-in users; guests are sent to login and come back here afterwards. */
export function useAuthGate() {
  const { data: me } = useMe();
  const navigate = useNavigate();
  const loc = useLocation();
  return useCallback(
    (fn: () => void) => {
      if (me) fn();
      else navigate(`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`);
    },
    [me, navigate, loc.pathname, loc.search],
  );
}

import { useMutation, useQuery, useQueryClient, type Query, type QueryClient } from '@tanstack/react-query';
import type { LoginInput, SignupInput } from '@souqly/shared';
import { clearRecentlyViewed } from '@/lib/recentlyViewed';
import { clearRecentSearches } from '@/lib/recentSearches';
import { socketSignedIn, socketSignedOut } from '@/lib/socket';
import { useActiveStore } from '@/stores/activeStore';
import { get, getErrorStatus, post } from './client';
import type { MeUser } from './types';

export const meKey = ['me'] as const;

/** Current user, or `null` when signed out. Never throws on 401. */
export function useMe() {
  return useQuery<MeUser | null>({
    queryKey: meKey,
    queryFn: async () => {
      try {
        const { user } = await get<{ user: MeUser }>('/auth/me');
        return user;
      } catch (err) {
        if (getErrorStatus(err) === 401) return null;
        throw err;
      }
    },
    staleTime: 5 * 60_000,
    // Fail fast: guarded pages show a retryable error instead of a long spinner.
    retry: false,
  });
}

/**
 * Drops everything cached for the previous user (the effect of `queryClient.clear()`) and the
 * seller store choice, then sets the new `me`. Not `clear()` itself: that detaches mounted
 * observers, so `useMe()` consumers would keep rendering the old user. Instead inactive queries
 * are removed, active ones reset (data dropped, refetched with the new cookies), and the existing
 * `me` query is updated in place so every consumer re-renders.
 */
function resetSession(qc: QueryClient, user: MeUser | null) {
  const notMe = (q: Query) => q.queryKey[0] !== meKey[0];
  useActiveStore.getState().reset();
  qc.removeQueries({ predicate: notMe, type: 'inactive' });
  qc.setQueryData(meKey, user);
  void qc.resetQueries({ predicate: notMe, type: 'active' });
}

/** A fresh sign-in (password, OTP, Google 2FA, signup): never show the previous user's cache. */
function useSignedIn() {
  const qc = useQueryClient();
  return (user: MeUser) => {
    resetSession(qc, user);
    socketSignedIn();
  };
}

export function useLogin() {
  const signedIn = useSignedIn();
  return useMutation({
    mutationFn: (body: LoginInput) => post<{ user: MeUser }>('/auth/login', body),
    onSuccess: (d) => signedIn(d.user),
  });
}

export function useSignup() {
  const signedIn = useSignedIn();
  return useMutation({
    mutationFn: (body: SignupInput) => post<{ user: MeUser }>('/auth/signup', body),
    onSuccess: (d) => signedIn(d.user),
  });
}

/** Local sign-out (logout, revoke-all incl. current, account deletion): forget every trace of the user. */
export function useSignedOut() {
  const qc = useQueryClient();
  return () => {
    socketSignedOut();
    clearRecentlyViewed();
    clearRecentSearches();
    resetSession(qc, null);
  };
}

export function useLogout() {
  const signedOut = useSignedOut();
  return useMutation({
    mutationFn: () => post<void>('/auth/logout'),
    onSettled: signedOut,
  });
}

export function useOtpRequest() {
  return useMutation({
    mutationFn: (body: { phone: string }) => post<{ sent: boolean; devCode?: string }>('/auth/otp/request', body),
  });
}

export function useOtpVerify() {
  const signedIn = useSignedIn();
  return useMutation({
    mutationFn: (body: { phone: string; code: string; totp?: string }) => post<{ user: MeUser; isNew: boolean }>('/auth/otp/verify', body),
    onSuccess: (d) => signedIn(d.user),
  });
}

/** Completes a Google sign-in for a 2FA account (`/login?google2fa=<ticket>`). */
export function useGoogleTwoFactor() {
  const signedIn = useSignedIn();
  return useMutation({
    mutationFn: (body: { ticket: string; totp: string }) => post<{ user: MeUser; next?: string | null }>('/auth/google/2fa', body),
    onSuccess: (d) => signedIn(d.user),
  });
}

export function useForgotPassword() {
  return useMutation({ mutationFn: (body: { email: string }) => post<unknown>('/auth/forgot-password', body) });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (body: { token: string; password: string }) => post<unknown>('/auth/reset-password', body),
  });
}

export function useVerifyEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { token: string }) => post<{ verified: boolean }>('/auth/verify-email', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: meKey }),
  });
}

export function useResendVerification() {
  return useMutation({ mutationFn: () => post<unknown>('/auth/resend-verification') });
}

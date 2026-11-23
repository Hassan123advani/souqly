import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LoginInput, SignupInput } from '@souqly/shared';
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

function useSetMe() {
  const qc = useQueryClient();
  return (user: MeUser | null) => qc.setQueryData(meKey, user);
}

export function useLogin() {
  const setMe = useSetMe();
  return useMutation({
    mutationFn: (body: LoginInput) => post<{ user: MeUser }>('/auth/login', body),
    onSuccess: (d) => setMe(d.user),
  });
}

export function useSignup() {
  const setMe = useSetMe();
  return useMutation({
    mutationFn: (body: SignupInput) => post<{ user: MeUser }>('/auth/signup', body),
    onSuccess: (d) => setMe(d.user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => post<void>('/auth/logout'),
    onSettled: () => {
      qc.setQueryData(meKey, null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] === 'account' });
    },
  });
}

export function useOtpRequest() {
  return useMutation({
    mutationFn: (body: { phone: string }) => post<{ sent: boolean; devCode?: string }>('/auth/otp/request', body),
  });
}

export function useOtpVerify() {
  const setMe = useSetMe();
  return useMutation({
    mutationFn: (body: { phone: string; code: string; totp?: string }) => post<{ user: MeUser; isNew: boolean }>('/auth/otp/verify', body),
    onSuccess: (d) => setMe(d.user),
  });
}

/** Completes a Google sign-in for a 2FA account (`/login?google2fa=<ticket>`). */
export function useGoogleTwoFactor() {
  const setMe = useSetMe();
  return useMutation({
    mutationFn: (body: { ticket: string; totp: string }) => post<{ user: MeUser }>('/auth/google/2fa', body),
    onSuccess: (d) => setMe(d.user),
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

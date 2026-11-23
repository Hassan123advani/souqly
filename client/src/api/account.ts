import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AddressInput, ChangePasswordInput, UserMode } from '@souqly/shared';
import { api, del, get, patch, post } from './client';
import { meKey, useSignedOut } from './auth';
import type { Address, MeUser, PreferencesPatch, SessionInfo } from './types';

const keys = {
  sessions: ['account', 'sessions'] as const,
  addresses: ['account', 'addresses'] as const,
};

function useSetMe() {
  const qc = useQueryClient();
  return (user: MeUser) => qc.setQueryData(meKey, user);
}

/** Re-authentication for sensitive actions: `password`, or `otpCode` for passwordless accounts. */
export type ReauthPayload = { password?: string; otpCode?: string };
export type OtpSent = { sent: boolean; devCode?: string };

// ---- Profile ----
export type ProfilePatch = { name?: string; phone?: string } & ReauthPayload;

export function useUpdateProfile() {
  const setMe = useSetMe();
  return useMutation({
    mutationFn: (body: ProfilePatch) =>
      patch<{ user: MeUser; phoneVerification?: OtpSent }>('/account/profile', body),
    onSuccess: (d) => d?.user && setMe(d.user),
  });
}

export function useVerifyPhone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => post<{ user: MeUser }>('/account/phone/verify', { code }),
    onSuccess: (d) => d?.user && qc.setQueryData(meKey, d.user),
    // PHONE_TAKEN / NO_PENDING_PHONE clear the pending change server-side.
    onError: () => qc.invalidateQueries({ queryKey: meKey }),
  });
}

/** Sends a re-auth code to the verified phone of a passwordless account. */
export function useReauthOtp() {
  return useMutation({ mutationFn: () => post<OtpSent>('/account/reauth/otp') });
}

export function useUploadAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return post<{ avatarUrl: string }>('/account/avatar', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: (d) => {
      qc.setQueryData<MeUser | null>(meKey, (u) => (u ? { ...u, avatarUrl: d.avatarUrl } : u));
    },
  });
}

// ---- Preferences ----
export function useUpdatePreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PreferencesPatch) => patch<{ user: MeUser }>('/account/preferences', body),
    onSuccess: (d) => d?.user && qc.setQueryData(meKey, d.user),
  });
}

// ---- Mode ----
export function useSwitchMode() {
  const setMe = useSetMe();
  return useMutation({
    mutationFn: (mode: UserMode) => post<{ user: MeUser }>('/account/mode', { mode }),
    onSuccess: (d) => d?.user && setMe(d.user),
  });
}

// ---- Security ----
export function useChangePassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ChangePasswordInput) => post<unknown>('/account/change-password', body),
    onSuccess: () => {
      qc.setQueryData<MeUser | null>(meKey, (u) => (u ? { ...u, passwordChangeRecommended: false } : u));
      qc.invalidateQueries({ queryKey: keys.sessions });
    },
  });
}

export function useChangeEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { newEmail: string; password: string }) =>
      post<{ changed: boolean; verificationSent: boolean; revokedSessions: number }>('/account/change-email', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: meKey }),
  });
}

export function useSessions(enabled = true) {
  return useQuery({ queryKey: keys.sessions, queryFn: () => get<SessionInfo[]>('/account/sessions'), enabled });
}

export function useRevokeSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => del(`/account/sessions/${encodeURIComponent(id)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.sessions }),
  });
}

export function useRevokeAllSessions() {
  const qc = useQueryClient();
  const signedOut = useSignedOut();
  return useMutation({
    mutationFn: (includeCurrent: boolean) => post<unknown>('/account/sessions/revoke-all', { includeCurrent }),
    onSuccess: (_d, includeCurrent) => {
      if (includeCurrent) signedOut();
      else qc.invalidateQueries({ queryKey: keys.sessions });
    },
  });
}

export function useTwoFactorSetup() {
  return useMutation({
    mutationFn: (body: ReauthPayload) =>
      post<{ secret: string; otpauthUrl: string; qrDataUrl: string }>('/account/2fa/setup', body),
  });
}

export function useTwoFactorEnable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { code: string } & ReauthPayload) =>
      post<{ enabled: boolean; recoveryCodes: string[] }>('/account/2fa/enable', body),
    onSuccess: () => qc.setQueryData<MeUser | null>(meKey, (u) => (u ? { ...u, twoFactorEnabled: true } : u)),
  });
}

export function useTwoFactorDisable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { code: string } & ReauthPayload) => post<unknown>('/account/2fa/disable', body),
    onSuccess: () => qc.setQueryData<MeUser | null>(meKey, (u) => (u ? { ...u, twoFactorEnabled: false } : u)),
  });
}

// ---- Addresses ----
export function useAddresses() {
  return useQuery({ queryKey: keys.addresses, queryFn: () => get<Address[]>('/account/addresses') });
}

export function useSaveAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: AddressInput }) =>
      id ? patch<Address>(`/account/addresses/${encodeURIComponent(id)}`, body) : post<Address>('/account/addresses', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.addresses }),
  });
}

export function useDeleteAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => del(`/account/addresses/${encodeURIComponent(id)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.addresses }),
  });
}

export function useSetDefaultAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => post<unknown>(`/account/addresses/${encodeURIComponent(id)}/default`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.addresses }),
  });
}

// ---- Data & deletion ----
/** Downloads the JSON export through the authenticated axios client and saves it as a file. */
export function useExportData() {
  return useMutation({
    mutationFn: async () => {
      const res = await api.get('/account/export', { responseType: 'blob' });
      const blob = res.data instanceof Blob ? res.data : new Blob([JSON.stringify(res.data)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `souqly-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  });
}

export function useDeleteAccount() {
  const signedOut = useSignedOut();
  return useMutation({
    mutationFn: (body: ReauthPayload) => del('/account', { data: { ...body, confirm: 'DELETE' } }),
    onSuccess: signedOut,
  });
}

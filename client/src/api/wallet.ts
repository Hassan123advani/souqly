import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CheckInStatusDTO, CoinTransactionDTO, ReferralSummaryDTO, WalletTransactionDTO } from '@souqly/shared';
import { api, get, post } from './client';
import { getPage, nextCursor } from './social';

export const walletKeys = {
  wallet: ['wallet'] as const,
  walletTx: ['wallet', 'tx'] as const,
  coins: ['coins'] as const,
  checkIn: ['coins', 'check-in'] as const,
  referrals: ['referrals'] as const,
};

export function useWallet() {
  return useQuery({ queryKey: walletKeys.wallet, queryFn: () => get<{ balance: number }>('/wallet') });
}

export function useWalletTransactions() {
  return useInfiniteQuery({
    queryKey: walletKeys.walletTx,
    queryFn: ({ pageParam }) => getPage<WalletTransactionDTO>('/wallet/transactions', { cursor: pageParam, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
  });
}

type CoinsPage = { data: { balance: number; worth: number; history: CoinTransactionDTO[] }; meta?: { nextCursor?: string | null } };
export function useCoins(enabled = true) {
  return useInfiniteQuery({
    queryKey: walletKeys.coins,
    queryFn: async ({ pageParam }) =>
      (await api.get<CoinsPage>('/coins', { params: { limit: 20, ...(pageParam ? { cursor: pageParam } : {}) } })).data,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
    enabled,
  });
}

export function useCheckInStatus(enabled = true) {
  return useQuery({ queryKey: walletKeys.checkIn, queryFn: () => get<CheckInStatusDTO>('/coins/check-in'), enabled });
}

export function useCheckIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => post<{ coins: number; streak: number; balance: number }>('/coins/check-in'),
    onSuccess: () => void qc.invalidateQueries({ queryKey: walletKeys.coins }),
  });
}

export function useReferrals() {
  return useQuery({ queryKey: walletKeys.referrals, queryFn: () => get<ReferralSummaryDTO>('/referrals') });
}

export function useRedeemGiftCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => post<unknown>('/gift-cards/redeem', { code }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: walletKeys.wallet }),
  });
}

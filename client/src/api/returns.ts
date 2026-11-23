import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosRequestConfig } from 'axios';
import type { CreateReturnInput, ReturnRequestDTO, ReturnStatus } from '@souqly/shared';
import { useActiveStoreId } from '@/components/seller/useActiveStore';
import { api, get, post } from './client';
import { useSellerKey } from './seller';

type Page = { data: ReturnRequestDTO[]; meta?: { nextCursor: string | null; counts?: Partial<Record<ReturnStatus | 'all', number>> } };

// ---------------------------------------------------------------------------------------------
// Buyer
// ---------------------------------------------------------------------------------------------
export const returnKeys = {
  list: ['returns', 'list'] as const,
  one: (id: string) => ['returns', 'one', id] as const,
};

export function useMyReturns() {
  return useInfiniteQuery({
    queryKey: returnKeys.list,
    queryFn: async ({ pageParam }) =>
      (await api.get<Page>('/returns', { params: { limit: 20, ...(pageParam ? { cursor: pageParam } : {}) } })).data,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
}

export function useMyReturn(id: string | undefined) {
  return useQuery({ queryKey: returnKeys.one(id ?? ''), queryFn: () => get<ReturnRequestDTO>(`/returns/${id}`), enabled: !!id });
}

export function useCreateReturn(number: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateReturnInput) => post<ReturnRequestDTO>(`/orders/${encodeURIComponent(number)}/returns`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['returns'] });
      void qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export function useEscalateReturn(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (message: string) => post<ReturnRequestDTO>(`/returns/${id}/escalate`, { message }),
    onSuccess: (r) => {
      qc.setQueryData(returnKeys.one(id), r);
      void qc.invalidateQueries({ queryKey: returnKeys.list });
    },
  });
}

// ---------------------------------------------------------------------------------------------
// Seller (/seller/returns)
// ---------------------------------------------------------------------------------------------
function cfg(sid: string | undefined, extra: AxiosRequestConfig = {}): AxiosRequestConfig {
  return { ...extra, headers: { ...(sid && sid !== 'none' ? { 'x-store-id': sid } : {}), ...(extra.headers ?? {}) } };
}

export function useSellerReturns(status: ReturnStatus | undefined) {
  const sid = useActiveStoreId();
  const key = useSellerKey();
  return useInfiniteQuery({
    queryKey: [...key, 'returns', 'list', status ?? 'all'],
    queryFn: async ({ pageParam }) =>
      (
        await api.get<Page>(
          '/seller/returns',
          cfg(sid, { params: { limit: 20, ...(status ? { status } : {}), ...(pageParam ? { cursor: pageParam } : {}) } }),
        )
      ).data,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  });
}

export function useSellerReturn(id: string | undefined) {
  const sid = useActiveStoreId();
  const key = useSellerKey();
  return useQuery({
    queryKey: [...key, 'returns', 'one', id],
    queryFn: async () => (await api.get<{ data: ReturnRequestDTO }>(`/seller/returns/${id}`, cfg(sid))).data.data,
    enabled: !!id,
  });
}

export type SellerReturnAction = 'approve' | 'reject' | 'received' | 'refund';

export function useSellerReturnAction(id: string) {
  const sid = useActiveStoreId();
  const key = useSellerKey();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ action, note }: { action: SellerReturnAction; note?: string }) =>
      (await api.post<{ data: ReturnRequestDTO }>(`/seller/returns/${id}/${action}`, note ? { note } : {}, cfg(sid))).data.data,
    onSuccess: (r) => {
      qc.setQueryData([...key, 'returns', 'one', id], r);
      void qc.invalidateQueries({ queryKey: [...key, 'returns', 'list'] });
      void qc.invalidateQueries({ queryKey: [...key, 'orders'] });
    },
  });
}

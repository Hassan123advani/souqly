import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosRequestConfig } from 'axios';
import type {
  DeliverInput,
  DeliveryFailReason,
  OrderTrackingDTO,
  RiderCodDTO,
  RiderDeliveryDTO,
  RiderLocationInput,
  RiderMeDTO,
  SellerRiderDTO,
} from '@souqly/shared';
import { useActiveStoreId } from '@/components/seller/useActiveStore';
import { api, get, post } from './client';
import { useSellerKey } from './seller';

export type UploadedImage = { key: string; url: string; ref: string };
export type RiderRange = 'today' | 'upcoming' | 'history';

// ---------------------------------------------------------------------------------------------
// Rider (/rider/*)
// ---------------------------------------------------------------------------------------------
export const riderKeys = {
  all: ['rider'] as const,
  me: ['rider', 'me'] as const,
  list: (range: RiderRange) => ['rider', 'deliveries', range] as const,
  one: (id: string) => ['rider', 'delivery', id] as const,
  cod: ['rider', 'cod'] as const,
};

export function useRiderMe(enabled = true) {
  return useQuery({ queryKey: riderKeys.me, queryFn: () => get<RiderMeDTO>('/rider/me'), enabled, retry: false, staleTime: 30_000 });
}

export function useRiderDeliveries(range: RiderRange) {
  return useInfiniteQuery({
    queryKey: riderKeys.list(range),
    queryFn: async ({ pageParam }) => {
      const res = await api.get<{ data: RiderDeliveryDTO[]; meta?: { nextCursor: string | null } }>('/rider/deliveries', {
        params: { date: range, limit: 20, ...(pageParam ? { cursor: pageParam } : {}) },
      });
      return res.data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
    refetchInterval: range === 'history' ? false : 60_000,
  });
}

export function useRiderDelivery(orderId: string | undefined) {
  return useQuery({
    queryKey: riderKeys.one(orderId ?? ''),
    queryFn: () => get<RiderDeliveryDTO>(`/rider/deliveries/${orderId}`),
    enabled: !!orderId,
  });
}

function useRiderAction<V>(orderId: string, fn: (v: V) => Promise<RiderDeliveryDTO>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (d) => {
      qc.setQueryData(riderKeys.one(orderId), d);
      void qc.invalidateQueries({ queryKey: ['rider', 'deliveries'] });
      void qc.invalidateQueries({ queryKey: riderKeys.me });
      void qc.invalidateQueries({ queryKey: riderKeys.cod });
    },
    onError: () => void qc.invalidateQueries({ queryKey: riderKeys.one(orderId) }),
  });
}

export function useStartDelivery(orderId: string) {
  return useRiderAction<void>(orderId, () => post<RiderDeliveryDTO>(`/rider/deliveries/${orderId}/start`));
}
export function useDeliverOrder(orderId: string) {
  return useRiderAction<DeliverInput>(orderId, (body) => post<RiderDeliveryDTO>(`/rider/deliveries/${orderId}/deliver`, body));
}
export function useFailDelivery(orderId: string) {
  return useRiderAction<{ reason: DeliveryFailReason; note?: string }>(orderId, (body) =>
    post<RiderDeliveryDTO>(`/rider/deliveries/${orderId}/fail`, body),
  );
}

/** REST fallback for live location (the socket is preferred). */
export function postRiderLocation(orderId: string, loc: RiderLocationInput) {
  return post<{ at: string; eta: number | null }>(`/rider/deliveries/${orderId}/location`, loc);
}

export function uploadImage(url: string, file: File): Promise<UploadedImage> {
  const fd = new FormData();
  fd.append('file', file);
  return post<UploadedImage>(url, fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60_000 });
}

export function useRiderCod() {
  return useQuery({ queryKey: riderKeys.cod, queryFn: () => get<RiderCodDTO>('/rider/cod') });
}

// ---------------------------------------------------------------------------------------------
// Live tracking (buyer / store member)
// ---------------------------------------------------------------------------------------------
export const trackingKey = (number: string) => ['tracking', number] as const;

/** `pollMs`: refetch interval while the live socket room is unavailable (off when omitted). */
export function useOrderTracking(number: string, { enabled = true, pollMs }: { enabled?: boolean; pollMs?: number } = {}) {
  return useQuery({
    queryKey: trackingKey(number),
    queryFn: () => get<OrderTrackingDTO>(`/orders/${encodeURIComponent(number)}/tracking`),
    enabled: enabled && !!number,
    refetchInterval: pollMs ?? false,
  });
}

// ---------------------------------------------------------------------------------------------
// Seller riders (/seller/riders, store-scoped)
// ---------------------------------------------------------------------------------------------
function cfg(sid: string | undefined, extra: AxiosRequestConfig = {}): AxiosRequestConfig {
  return { ...extra, headers: { ...(sid && sid !== 'none' ? { 'x-store-id': sid } : {}), ...(extra.headers ?? {}) } };
}

export function useSellerRiders() {
  const sid = useActiveStoreId();
  const key = useSellerKey();
  return useQuery({
    queryKey: [...key, 'riders', 'list'],
    queryFn: async () => (await api.get<{ data: SellerRiderDTO[] }>('/seller/riders', cfg(sid))).data.data,
    placeholderData: keepPreviousData,
  });
}

export function useRiderSettings() {
  const sid = useActiveStoreId();
  const key = useSellerKey();
  return useQuery({
    queryKey: [...key, 'riders', 'settings'],
    queryFn: async () => (await api.get<{ data: { riderFee: number } }>('/seller/riders/settings', cfg(sid))).data.data,
  });
}

export function useSaveRiderSettings() {
  const sid = useActiveStoreId();
  const key = useSellerKey();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { riderFee: number }) =>
      (await api.patch<{ data: { riderFee: number } }>('/seller/riders/settings', body, cfg(sid))).data.data,
    onSuccess: (d) => qc.setQueryData([...key, 'riders', 'settings'], d),
  });
}

export function useSettleCod() {
  const sid = useActiveStoreId();
  const key = useSellerKey();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ memberId, amount }: { memberId: string; amount: number }) =>
      (await api.post(`/seller/riders/${memberId}/cod-settle`, { amount }, cfg(sid))).data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: [...key, 'riders'] }),
  });
}

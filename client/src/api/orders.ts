import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BUYER_ORDER_TABS, CartDTO, OrderDTO, OrderStatus } from '@souqly/shared';
import { api, get, post } from './client';
import { cartKey } from './cart';

export type BuyerOrderTab = keyof typeof BUYER_ORDER_TABS;

export type TrackingStep = { status: OrderStatus; done: boolean; at: string | null; current: boolean };
export type BuyerOrderDetail = OrderDTO & { trackingSteps: TrackingStep[]; canCancel: boolean };
type OrdersMeta = { nextCursor: string | null; counts?: Partial<Record<BuyerOrderTab, number>> };

export const orderKeys = {
  list: (tab: BuyerOrderTab) => ['orders', 'list', tab] as const,
  detail: (number: string) => ['orders', 'detail', number] as const,
};

export function useBuyerOrders(tab: BuyerOrderTab) {
  return useInfiniteQuery({
    queryKey: orderKeys.list(tab),
    queryFn: async ({ pageParam }) => {
      const res = await api.get<{ data: OrderDTO[]; meta: OrdersMeta }>('/orders', {
        params: { tab, limit: 10, ...(pageParam ? { cursor: pageParam } : {}) },
      });
      return res.data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
}

export function useBuyerOrder(number: string) {
  return useQuery({
    queryKey: orderKeys.detail(number),
    queryFn: () => get<BuyerOrderDetail>(`/orders/${encodeURIComponent(number)}`),
  });
}

export function useCancelOrder(number: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) => post<BuyerOrderDetail>(`/orders/${encodeURIComponent(number)}/cancel`, { reason }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  });
}

export function useReorder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (number: string) => {
      const res = await api.post<{ data: CartDTO; meta: { added: number; skipped: number } }>(`/orders/${encodeURIComponent(number)}/reorder`);
      return res.data;
    },
    onSuccess: ({ data }) => qc.setQueryData(cartKey, data),
  });
}

/** Fetches the invoice PDF through the authenticated client and saves it. */
export function useDownloadInvoice() {
  return useMutation({
    mutationFn: async (number: string) => {
      const res = await api.get<Blob>(`/orders/${encodeURIComponent(number)}/invoice.pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-${number}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    },
  });
}

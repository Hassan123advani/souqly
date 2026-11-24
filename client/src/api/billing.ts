import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminBillingOverviewDTO,
  AdminBillingStoreDetailDTO,
  AdminBillingStoreRowDTO,
  BillingAdjustmentDTO,
  BillingPaymentStatus,
  BillingReportDTO,
  BillingReportRowDTO,
  BillingScheduledChangeDTO,
  BillingSummaryDTO,
  ChangePlanInput,
  ChangePlanResultDTO,
  CommissionChannel,
  CommissionEntryDTO,
  CommissionStatus,
  InvoiceDetailDTO,
  InvoiceDTO,
  InvoiceKind,
  InvoiceLineDTO,
  InvoicePaymentDTO,
  InvoiceStatus,
  ManualAccount,
  PayInvoiceInput,
  PaymentOptionsDTO,
  PlansCatalogDTO,
  PlanUsageDTO,
  PublicPlansDTO,
  SubscriptionDTO,
} from '@souqly/shared';
import { useActiveStoreId } from '@/components/seller/useActiveStore';
import { get } from './client';
import { downloadStoreFile } from './growth';
import { useSc, useSellerKey, type CursorMeta } from './seller';

/**
 * Seller subscriptions, 15% commission and monthly billing (docs/api-billing.md).
 * Request bodies, enums and response DTOs come from @souqly/shared (shared/src/types/billing.ts);
 * the short aliases below keep page imports stable.
 */

// ---------------------------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------------------------

export type ScheduledChange = BillingScheduledChangeDTO;
export type Subscription = SubscriptionDTO;
export type InvoiceLine = InvoiceLineDTO;
export type Invoice = InvoiceDTO;
export type CommissionEntry = CommissionEntryDTO;
export type InvoicePayment = InvoicePaymentDTO;
export type InvoiceDetail = InvoiceDetailDTO;
export type BillingSummary = BillingSummaryDTO;
export type PlanUsage = PlanUsageDTO;
export type PlansCatalog = PlansCatalogDTO;
export type PublicPlans = PublicPlansDTO;
export type PaymentOptions = PaymentOptionsDTO;
export type ChangePlanResult = ChangePlanResultDTO;

/** `GET /seller/finance/summary` (docs/api-growth.md). */
export type FinanceSummary = {
  available: number;
  onHold: number;
  pendingPayouts: number;
  lifetime: number;
  paidOut: number;
  refunds: number;
  holdDays: number;
  minPayout: number;
  currency: 'PKR';
};
export type PayoutStatus = 'requested' | 'approved' | 'paid' | 'rejected';
export type SellerPayout = {
  id: string;
  amount: number;
  status: PayoutStatus;
  method: { type?: string; bankName?: string; accountTitle?: string; accountMasked?: string };
  reference: string | null;
  createdAt: string;
  paidAt: string | null;
  rejectedAt: string | null;
};

// ---- admin ----
export type AdminBillingOverview = AdminBillingOverviewDTO;
export type AdminBillingStoreRow = AdminBillingStoreRowDTO;
export type BillingAdjustment = BillingAdjustmentDTO;
export type AdminBillingStoreDetail = AdminBillingStoreDetailDTO;
export type BillingReportRow = BillingReportRowDTO;
export type BillingReport = BillingReportDTO;
export type AdminBillingSettings = { graceDays: number; manualAccounts: ManualAccount[] };

// ---------------------------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------------------------

/** `GET /plans` (no auth): plan catalog for the Become-a-Seller wizard. */
export function usePublicPlans() {
  return useQuery({ queryKey: ['plans', 'public'], queryFn: () => get<PublicPlans>('/plans'), staleTime: 10 * 60_000 });
}

// ---------------------------------------------------------------------------------------------
// Seller (`/seller/billing/*`, `/seller/finance/*`)
// ---------------------------------------------------------------------------------------------

function useBillingKey() {
  return [...useSellerKey(), 'billing'] as const;
}

type ListParams = Record<string, string | undefined>;

function useSellerList<T>(path: string, name: string, params: ListParams) {
  const s = useSc();
  const key = useBillingKey();
  return useInfiniteQuery({
    queryKey: [...key, name, params],
    queryFn: ({ pageParam }) => s.page<T, CursorMeta>(path, { ...params, cursor: pageParam, limit: 25 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
    enabled: key[1] !== 'none',
  });
}

export function useBillingSummary(enabled = true) {
  const s = useSc();
  const key = useBillingKey();
  return useQuery({
    queryKey: [...key, 'summary'],
    queryFn: () => s.get<BillingSummary>('/seller/billing/summary'),
    enabled: enabled && key[1] !== 'none',
    staleTime: 60_000,
  });
}

export function useBillingPlans() {
  const s = useSc();
  const key = useBillingKey();
  return useQuery({ queryKey: [...key, 'plans'], queryFn: () => s.get<PlansCatalog>('/seller/billing/plans'), enabled: key[1] !== 'none' });
}

export function usePaymentOptions(enabled = true) {
  const s = useSc();
  const key = useBillingKey();
  return useQuery({ queryKey: [...key, 'payment-options'], queryFn: () => s.get<PaymentOptions>('/seller/billing/payment-options'), enabled: enabled && key[1] !== 'none' });
}

export const useInvoices = (params: { status?: InvoiceStatus; kind?: InvoiceKind }) => useSellerList<Invoice>('/seller/billing/invoices', 'invoices', params);
export const useBillingPayments = (params: { status?: BillingPaymentStatus }) => useSellerList<InvoicePayment>('/seller/billing/payments', 'payments', params);
export const useCommissions = (params: { status?: CommissionStatus; channel?: CommissionChannel; kind?: 'charge' | 'reversal' }) =>
  useSellerList<CommissionEntry>('/seller/billing/commissions', 'commissions', params);

/** Poll every 5 s for at most ~2 min while a gateway payment awaits its webhook. */
const GATEWAY_POLL_MS = 5_000;
const GATEWAY_POLL_MAX = 24;

/**
 * One invoice. `awaitingGateway` (e.g. the Stripe return `?paid=1`) keeps polling while the invoice
 * is still unpaid, so the page flips to paid once the webhook lands; a pending gateway payment
 * on the invoice also triggers polling. Both stop after GATEWAY_POLL_MAX refetches.
 */
export function useInvoice(id: string | undefined, { awaitingGateway = false }: { awaitingGateway?: boolean } = {}) {
  const s = useSc();
  const key = useBillingKey();
  return useQuery({
    queryKey: [...key, 'invoice', id],
    queryFn: () => s.get<InvoiceDetail>(`/seller/billing/invoices/${id}`),
    enabled: !!id && key[1] !== 'none',
    refetchInterval: (query) => {
      const inv = query.state.data;
      if (!inv || query.state.dataUpdateCount > GATEWAY_POLL_MAX) return false;
      const unpaid = inv.status === 'open' || inv.status === 'overdue';
      const pending = inv.pendingPayment?.method === 'gateway' || (awaitingGateway && !inv.pendingPayment);
      return unpaid && pending ? GATEWAY_POLL_MS : false;
    },
  });
}

/** Refreshes everything a billing change can move: billing, plan gates, store, finance balance. */
export function useBillingInvalidate() {
  const qc = useQueryClient();
  const root = useSellerKey();
  return () => {
    for (const k of ['billing', 'plan', 'store', 'finance'] as const) void qc.invalidateQueries({ queryKey: [...root, k] });
  };
}

export function useChangePlan() {
  const s = useSc();
  const done = useBillingInvalidate();
  return useMutation({
    mutationFn: (body: ChangePlanInput) =>
      body.plan === 'free' ? s.send<ChangePlanResult>('post', '/seller/billing/cancel') : s.send<ChangePlanResult>('post', '/seller/billing/change-plan', body),
    onSuccess: done,
  });
}

export function useCancelScheduledChange() {
  const s = useSc();
  const done = useBillingInvalidate();
  return useMutation({ mutationFn: () => s.send<{ subscription: Subscription }>('delete', '/seller/billing/scheduled-change'), onSuccess: done });
}

export function usePayInvoice(id: string) {
  const s = useSc();
  const done = useBillingInvalidate();
  return useMutation({ mutationFn: (body: PayInvoiceInput) => s.send<InvoicePayment>('post', `/seller/billing/invoices/${id}/pay`, body), onSuccess: done });
}

export function useInvoicePdf() {
  const sid = useActiveStoreId();
  return useMutation({ mutationFn: (inv: { id: string; number: string }) => downloadStoreFile(sid, `/seller/billing/invoices/${inv.id}/pdf`, {}, `${inv.number}.pdf`) });
}

export function useFinanceSummary(enabled = true) {
  const s = useSc();
  const key = useSellerKey();
  return useQuery({ queryKey: [...key, 'finance', 'summary'], queryFn: () => s.get<FinanceSummary>('/seller/finance/summary'), enabled: enabled && key[1] !== 'none' });
}

export function usePayouts() {
  const s = useSc();
  const key = useSellerKey();
  return useInfiniteQuery({
    queryKey: [...key, 'finance', 'payouts'],
    queryFn: ({ pageParam }) => s.page<SellerPayout, CursorMeta>('/seller/finance/payout-requests', { cursor: pageParam, limit: 25 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
    enabled: key[1] !== 'none',
  });
}

export function useRequestPayout() {
  const s = useSc();
  const done = useBillingInvalidate();
  return useMutation({ mutationFn: (amount: number) => s.send<SellerPayout>('post', '/seller/finance/payout-requests', { amount }), onSuccess: done });
}

// ---------------------------------------------------------------------------------------------
// Admin (`/admin/billing/*`) — read through useAdminGet / useAdminList from ./admin
// ---------------------------------------------------------------------------------------------

/**
 * Admin cache groups a billing mutation can move. `useAdminGet('billing/…')` caches under `billing`;
 * `useAdminList('billing/<x>')` caches under the full path, so each list is listed here.
 */
export const ADMIN_BILLING_GROUPS = ['billing', 'billing/stores', 'billing/invoices', 'billing/payments', 'billing/commissions', 'billing/adjustments', 'stores'];

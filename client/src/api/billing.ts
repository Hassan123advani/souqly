import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BillingAdjustmentType,
  BillingPaymentMethod,
  BillingPaymentStatus,
  ChangePlanInput,
  CommissionChannel,
  CommissionStatus,
  InvoiceKind,
  InvoiceLineType,
  InvoiceStatus,
  ManualAccount,
  ManualPaymentChannel,
  PayInvoiceInput,
  PlanDefinition,
  StoreLayout,
  StorePlan,
} from '@souqly/shared';
import { useActiveStoreId } from '@/components/seller/useActiveStore';
import { get } from './client';
import { downloadStoreFile } from './growth';
import { useSc, useSellerKey, type CursorMeta } from './seller';

/**
 * Seller subscriptions, 15% commission and monthly billing (docs/api-billing.md).
 * Request bodies / enums come from @souqly/shared; the response DTOs below mirror the server
 * (they are not exported from shared yet).
 */

// ---------------------------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------------------------

export type ScheduledChange = { plan: StorePlan; effectiveAt: string; kind: 'downgrade' | 'cancel' };
export type Subscription = {
  plan: StorePlan;
  billingStatus: 'active' | 'suspended';
  suspension: { reason: 'overdue' | 'admin'; invoiceId: string | null; note: string | null; at: string } | null;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  scheduledChange: ScheduledChange | null;
  pendingUpgrade: { plan: StorePlan; invoiceId: string; invoiceNumber: string; amountDue: number; dueDate: string } | null;
};

export type InvoiceLine = {
  type: InvoiceLineType;
  description: string;
  amount: number;
  plan?: StorePlan;
  periodStart?: string;
  periodEnd?: string;
  entries?: number;
};
export type Invoice = {
  id: string;
  number: string;
  kind: InvoiceKind;
  status: InvoiceStatus;
  plan: StorePlan;
  periodStart: string;
  periodEnd: string;
  lines: InvoiceLine[];
  total: number;
  amountPaid: number;
  amountWaived: number;
  amountDue: number;
  issuedAt: string;
  dueDate: string;
  paidAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  pendingPayment: { id: string; method: 'manual' | 'gateway'; createdAt: string } | null;
  /** Admin responses only. */
  store?: { id: string; name: string; slug: string };
};

export type CommissionEntry = {
  id: string;
  kind: 'charge' | 'reversal';
  channel: CommissionChannel;
  orderId: string;
  orderNumber: string;
  base: number;
  bps: number;
  amount: number;
  orderTotal: number;
  status: CommissionStatus;
  invoiceId: string | null;
  invoiceNumber: string | null;
  reason: 'delivered' | 'return_refund' | 'cancelled_after_delivery';
  at: string;
  settledAt: string | null;
  /** Admin responses only. */
  storeId?: string;
};

export type InvoicePayment = {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  method: BillingPaymentMethod;
  amount: number;
  status: BillingPaymentStatus;
  channel: ManualPaymentChannel | null;
  reference: string | null;
  proofUrl: string | null;
  note: string | null;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  checkoutUrl?: string;
  /** Admin responses only. */
  storeId?: string;
  store?: { id: string; name: string; slug: string };
  gateway?: { provider: string; transactionId: string | null; failure: string | null } | null;
};

export type InvoiceDetail = Invoice & { commissions: CommissionEntry[]; payments: InvoicePayment[] };

export type BillingSummary = {
  subscription: Subscription;
  plan: PlanDefinition;
  nextInvoiceEstimate: { date: string; plan: StorePlan; fee: number; commission: number; balanceRecovery: number; total: number };
  outstanding: { invoices: number; amountDue: number; overdue: number; nextDueDate: string | null };
  totals: {
    grossSales: number;
    codSales: number;
    onlineSales: number;
    commissionBase: number;
    totalCommission: number;
    paidCommission: number;
    unpaidCodCommission: number;
    availableBalance: number;
    onHold: number;
    pendingPayouts: number;
  };
  commissionBps: number;
  graceDays: number;
  currency: 'PKR';
};

export type PlanUsage = { products: number; liveProducts: number; staff: number; sections: number; layoutTemplate?: StoreLayout };
export type PlansCatalog = { current: StorePlan; plans: PlanDefinition[]; usage: PlanUsage; commissionBps: number };
export type PublicPlans = { commissionBps: number; plans: PlanDefinition[] };

export type PaymentOptions = {
  balance: { available: number };
  manualAccounts: ManualAccount[];
  gateways: { stripe: boolean; jazzcash?: boolean; easypaisa?: boolean };
};

export type ChangePlanResult = { subscription: Subscription; invoice: Invoice | null; effective: 'on_payment' | 'period_end' | 'now' };

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
export type AdminBillingOverview = {
  sellers: { registered: number; approved: number; billingSuspended: number };
  subscribers: Record<StorePlan, number>;
  mrr: number;
  subscriptionRevenue: { thisMonth: number; allTime: number };
  commission: { total: number; online: number; cod: number; codOutstanding: number; codPaid: number; reversed?: number };
  invoices: { open: number; overdue: number; amountDue: number };
  pendingManualPayments: number;
  payoutsPending: { count: number; amount: number };
  commissionBps?: number;
};
export type AdminBillingStoreRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: StorePlan;
  billingStatus: 'active' | 'suspended';
  suspensionReason: 'overdue' | 'admin' | null;
  currentPeriodEnd: string | null;
  scheduledChange: { plan: StorePlan; effectiveAt: string | null } | null;
  outstanding: number;
  overdue: number;
  unbilledCommission: number;
};
export type BillingAdjustment = {
  id: string;
  storeId: string;
  type: BillingAdjustmentType;
  invoiceId: string | null;
  paymentId: string | null;
  amount: number;
  reason: string;
  meta: Record<string, unknown>;
  by: string | null;
  createdAt: string;
};
export type AdminBillingStoreDetail = {
  store: { id: string; name: string; slug: string; status: string; ownerId: string; createdAt: string | null };
  subscription: Subscription;
  totals: {
    grossSales: number;
    codSales: number;
    onlineSales: number;
    commissionBase: number;
    totalCommission: number;
    paidCommission: number;
    unpaidCodCommission: number;
    onlineCommission: number;
    codCommission: number;
    reversed: number;
    availableBalance: number;
    onHold: number;
    pendingPayouts: number;
    paidOut: number;
  };
  outstanding: { invoices: number; amountDue: number };
  invoices: Invoice[];
  payments: InvoicePayment[];
  commissions: CommissionEntry[];
  adjustments: BillingAdjustment[];
};
export type BillingReportRow = {
  storeId: string;
  store: string;
  plan: string;
  feesBilled: number;
  feesPaid: number;
  codCommission: number;
  onlineCommission: number;
  reversals: number;
  waived: number;
  outstanding: number;
};
export type BillingReport = { from: string; to: string; rows: BillingReportRow[] };
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

export function useInvoice(id: string | undefined) {
  const s = useSc();
  const key = useBillingKey();
  return useQuery({ queryKey: [...key, 'invoice', id], queryFn: () => s.get<InvoiceDetail>(`/seller/billing/invoices/${id}`), enabled: !!id && key[1] !== 'none' });
}

/** Refreshes everything a billing change can move: billing, plan gates, store, finance balance. */
function useBillingInvalidate() {
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

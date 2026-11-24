import type {
  BillingAdjustmentType,
  BillingPaymentMethod,
  BillingPaymentStatus,
  CommissionChannel,
  CommissionStatus,
  InvoiceKind,
  InvoiceLineType,
  InvoiceStatus,
  ManualPaymentChannel,
} from '../constants/billing';
import type { PlanDefinition } from '../constants/plans';
import type { StoreLayout, StorePlan } from '../schemas/catalog';
import type { ManualAccount } from '../schemas/billing';

/** Billing response DTOs (docs/api-billing.md). All money in paisa, dates ISO strings. */

export type BillingScheduledChangeDTO = { plan: StorePlan; effectiveAt: string; kind: 'downgrade' | 'cancel' };

export type SubscriptionDTO = {
  plan: StorePlan;
  billingStatus: 'active' | 'suspended';
  suspension: { reason: 'overdue' | 'admin'; invoiceId: string | null; note: string | null; at: string } | null;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  scheduledChange: BillingScheduledChangeDTO | null;
  pendingUpgrade: { plan: StorePlan; invoiceId: string; invoiceNumber: string; amountDue: number; dueDate: string } | null;
};

export type InvoiceLineDTO = {
  type: InvoiceLineType;
  description: string;
  amount: number;
  plan?: StorePlan;
  periodStart?: string;
  periodEnd?: string;
  entries?: number;
};

export type BillingStoreRefDTO = { id: string; name: string; slug: string };

export type InvoiceDTO = {
  id: string;
  number: string;
  kind: InvoiceKind;
  status: InvoiceStatus;
  plan: StorePlan;
  periodStart: string;
  periodEnd: string;
  lines: InvoiceLineDTO[];
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
  store?: BillingStoreRefDTO;
};

export type CommissionEntryDTO = {
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
  storeName?: string;
  storeSlug?: string;
};

export type InvoicePaymentDTO = {
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
  /** Gateway payments while pending. */
  checkoutUrl?: string;
  /** Admin responses only. */
  storeId?: string;
  store?: BillingStoreRefDTO;
  gateway?: { provider: string; transactionId: string | null; failure: string | null } | null;
};

export type InvoiceDetailDTO = InvoiceDTO & { commissions: CommissionEntryDTO[]; payments: InvoicePaymentDTO[] };

export type BillingSummaryDTO = {
  subscription: SubscriptionDTO;
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

export type PlanUsageDTO = { products: number; liveProducts: number; staff: number; sections: number; layoutTemplate: StoreLayout };
export type PlansCatalogDTO = { current: StorePlan; commissionBps: number; plans: PlanDefinition[]; usage: PlanUsageDTO };
export type PublicPlansDTO = { commissionBps: number; plans: PlanDefinition[] };

export type PaymentOptionsDTO = {
  balance: { available: number };
  manualAccounts: ManualAccount[];
  gateways: { stripe: boolean; jazzcash: boolean; easypaisa: boolean };
};

export type ChangePlanResultDTO = { subscription: SubscriptionDTO; invoice: InvoiceDTO | null; effective: 'on_payment' | 'period_end' | 'now' };

// ---- admin ----
export type AdminBillingOverviewDTO = {
  sellers: { registered: number; approved: number; billingSuspended: number };
  subscribers: Record<StorePlan, number>;
  mrr: number;
  subscriptionRevenue: { thisMonth: number; allTime: number };
  commission: { total: number; online: number; cod: number; codOutstanding: number; codPaid: number; reversed: number };
  invoices: { open: number; overdue: number; amountDue: number };
  pendingManualPayments: number;
  payoutsPending: { count: number; amount: number };
  commissionBps: number;
};

export type AdminBillingStoreRowDTO = {
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

export type BillingAdjustmentDTO = {
  id: string;
  storeId: string;
  storeName: string;
  storeSlug: string;
  type: BillingAdjustmentType;
  invoiceId: string | null;
  paymentId: string | null;
  amount: number;
  reason: string;
  meta: Record<string, unknown>;
  by: string | null;
  createdAt: string;
};

export type AdminBillingStoreDetailDTO = {
  store: { id: string; name: string; slug: string; status: string; ownerId: string; createdAt: string | null };
  subscription: SubscriptionDTO;
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
  invoices: InvoiceDTO[];
  payments: InvoicePaymentDTO[];
  commissions: CommissionEntryDTO[];
  adjustments: BillingAdjustmentDTO[];
};

export type BillingReportRowDTO = {
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
export type BillingReportDTO = { from: string; to: string; rows: BillingReportRowDTO[] };

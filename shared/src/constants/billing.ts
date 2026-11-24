import { applyBps } from '../utils/money';

/**
 * Flat platform commission on every successful (delivered) marketplace sale, for every plan:
 * 1500 bps = 15%. The single source of truth (docs/api-billing.md §2).
 */
export const PLATFORM_COMMISSION_BPS = 1500;

/**
 * Affiliate commission (Phase 10, flag `affiliateLinks`): 200 bps = 2% of the item value (items - promo -
 * store voucher), paid to the affiliate's wallet once the order's return window has passed.
 */
export const AFFILIATE_BPS = 200;

/**
 * Highest shipping rate a seller may charge per order (Rs 1,500). Shipping is outside the commission base,
 * so an inflated shipping fee would dodge commission: zone rates are capped at this value and any shipping
 * above it (legacy settings) is added to the commission base (security review M2, D-091).
 */
export const SHIPPING_RATE_CAP_MINOR = 150_000;

/** Default days after the billing cut-off before an invoice is overdue (admin setting `billing.graceDays`). */
export const DEFAULT_BILLING_GRACE_DAYS = 7;

/**
 * Commission split for one sub-order. `base` = product subtotal after seller-funded discounts (platform
 * vouchers/coins do not reduce it) plus any shipping above SHIPPING_RATE_CAP_MINOR; normal shipping is
 * excluded. Rounded half-up (applyBps).
 */
export function commissionSplit(base: number, shipping = 0): { base: number; bps: number; commission: number; sellerNet: number } {
  const b = Math.max(0, Math.trunc(base)) + Math.max(0, Math.trunc(shipping) - SHIPPING_RATE_CAP_MINOR);
  const commission = applyBps(b, PLATFORM_COMMISSION_BPS);
  return { base: b, bps: PLATFORM_COMMISSION_BPS, commission, sellerNet: b + Math.max(0, shipping) - commission };
}

export const INVOICE_STATUSES = ['open', 'overdue', 'paid', 'waived', 'void'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export const INVOICE_KINDS = ['renewal', 'upgrade'] as const;
export type InvoiceKind = (typeof INVOICE_KINDS)[number];
export const INVOICE_LINE_TYPES = ['subscription', 'commission', 'proration_credit', 'balance_recovery'] as const;
export type InvoiceLineType = (typeof INVOICE_LINE_TYPES)[number];

export const COMMISSION_STATUSES = ['unpaid', 'invoiced', 'paid', 'deducted', 'credited', 'waived'] as const;
export type CommissionStatus = (typeof COMMISSION_STATUSES)[number];
export const COMMISSION_CHANNELS = ['cod', 'online'] as const;
export type CommissionChannel = (typeof COMMISSION_CHANNELS)[number];

export const BILLING_PAYMENT_METHODS = ['balance', 'manual', 'gateway', 'admin'] as const;
export type BillingPaymentMethod = (typeof BILLING_PAYMENT_METHODS)[number];
export const BILLING_PAYMENT_STATUSES = ['pending', 'succeeded', 'rejected', 'failed', 'cancelled'] as const;
export type BillingPaymentStatus = (typeof BILLING_PAYMENT_STATUSES)[number];
export const MANUAL_PAYMENT_CHANNELS = ['bank', 'jazzcash', 'easypaisa', 'other'] as const;
export type ManualPaymentChannel = (typeof MANUAL_PAYMENT_CHANNELS)[number];
export const BILLING_GATEWAYS = ['stripe', 'jazzcash', 'easypaisa'] as const;
export type BillingGateway = (typeof BILLING_GATEWAYS)[number];

export const BILLING_ADJUSTMENT_TYPES = ['waiver', 'extension', 'plan_change', 'manual_payment', 'suspension', 'reactivation'] as const;
export type BillingAdjustmentType = (typeof BILLING_ADJUSTMENT_TYPES)[number];

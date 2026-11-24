import { z } from 'zod';
import { BILLING_ADJUSTMENT_TYPES, BILLING_PAYMENT_STATUSES, COMMISSION_CHANNELS, COMMISSION_STATUSES, INVOICE_KINDS, INVOICE_STATUSES, MANUAL_PAYMENT_CHANNELS } from '../constants/billing';
import { STORE_PLANS } from './catalog';
import { objectIdSchema } from './common';

/** Seller subscriptions / commission / invoices request schemas (docs/api-billing.md). */

const cursor = z.string().max(200).optional();
const limit = z.coerce.number().int().min(1).max(100).default(30);
const reason = z.string().trim().min(5, 'Please give a reason (at least 5 characters)').max(500);
const uploadedMedia = z.object({ url: z.string().trim().min(1).max(500), key: z.string().trim().min(1).max(300) }).strict();

export const changePlanSchema = z.object({ plan: z.enum(STORE_PLANS) }).strict();
export type ChangePlanInput = z.infer<typeof changePlanSchema>;

export const invoiceListQuerySchema = z.object({ cursor, limit, status: z.enum(INVOICE_STATUSES).optional(), kind: z.enum(INVOICE_KINDS).optional() });
export const billingPaymentListQuerySchema = z.object({ cursor, limit, status: z.enum(BILLING_PAYMENT_STATUSES).optional() });
export const commissionListQuerySchema = z.object({
  cursor,
  limit,
  status: z.enum(COMMISSION_STATUSES).optional(),
  channel: z.enum(COMMISSION_CHANNELS).optional(),
  kind: z.enum(['charge', 'reversal']).optional(),
});

export const payInvoiceSchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('balance'), idempotencyKey: z.string().trim().min(8).max(100).optional() }).strict(),
  z
    .object({
      method: z.literal('manual'),
      channel: z.enum(MANUAL_PAYMENT_CHANNELS),
      reference: z.string().trim().min(3, 'Enter the transaction reference').max(80).regex(/^[A-Za-z0-9 ._/#-]+$/, 'Use letters, digits and - _ . / #'),
      proof: uploadedMedia.optional(),
      note: z.string().trim().max(500).optional(),
    })
    .strict(),
  z.object({ method: z.literal('gateway'), provider: z.enum(['stripe', 'jazzcash', 'easypaisa']) }).strict(),
]);
export type PayInvoiceInput = z.infer<typeof payInvoiceSchema>;

// ---- admin ----
export const adminBillingStoreListQuerySchema = z.object({
  cursor,
  limit,
  q: z.string().trim().max(80).optional(),
  plan: z.enum(STORE_PLANS).optional(),
  billingStatus: z.enum(['active', 'suspended']).optional(),
});
export const adminBillingInvoiceListQuerySchema = z.object({
  cursor,
  limit,
  status: z.enum(INVOICE_STATUSES).optional(),
  kind: z.enum(INVOICE_KINDS).optional(),
  storeId: objectIdSchema.optional(),
  format: z.enum(['json', 'csv']).default('json'),
});
export const adminBillingPaymentListQuerySchema = z.object({
  cursor,
  limit,
  status: z.enum(BILLING_PAYMENT_STATUSES).optional(),
  method: z.enum(['balance', 'manual', 'gateway', 'admin']).optional(),
  storeId: objectIdSchema.optional(),
});
export const adminCommissionListQuerySchema = commissionListQuerySchema.extend({ storeId: objectIdSchema.optional() });
export const adminAdjustmentListQuerySchema = z.object({ cursor, limit, storeId: objectIdSchema.optional(), type: z.enum(BILLING_ADJUSTMENT_TYPES).optional() });
export const adminBillingReportQuerySchema = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional(), format: z.enum(['json', 'csv']).default('json') });

export const adminBillingPlanSchema = z.object({ plan: z.enum(STORE_PLANS), reason }).strict();
export const adminBillingExtendSchema = z.object({ days: z.number().int().min(1).max(365), reason }).strict();
export const adminBillingReasonSchema = z.object({ reason }).strict();
export const adminWaiveSchema = z.object({ amount: z.number().int().min(1).max(100_000_000_000).optional(), reason }).strict();
export const adminApprovePaymentSchema = z.object({ amount: z.number().int().min(1).max(100_000_000_000).optional(), note: z.string().trim().max(500).optional() }).strict();
export const adminRejectPaymentSchema = z.object({ reason }).strict();

export const manualAccountSchema = z
  .object({
    channel: z.enum(MANUAL_PAYMENT_CHANNELS),
    title: z.string().trim().min(2).max(80),
    accountName: z.string().trim().min(2).max(80),
    accountNumber: z.string().trim().min(4).max(40),
    iban: z.string().trim().max(40).optional(),
    instructions: z.string().trim().max(500).optional(),
  })
  .strict();
export const billingSettingsSchema = z
  .object({
    graceDays: z.number().int().min(0).max(60),
    manualAccounts: z.array(manualAccountSchema).max(5).default([]),
  })
  .strict();
export type BillingSettings = z.infer<typeof billingSettingsSchema>;
export type ManualAccount = z.infer<typeof manualAccountSchema>;

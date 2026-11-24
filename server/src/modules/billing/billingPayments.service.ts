import type { InvoicePaymentDTO, PayInvoiceInput } from '@souqly/shared';
import type { Request } from 'express';
import { Types } from 'mongoose';
import { env } from '../../config/env';
import { AppError, notFound } from '../../lib/AppError';
import { logger } from '../../lib/logger';
import { isDuplicateKey, withTx } from '../../lib/tx';
import { STRIPE_REQUIRED_ENV, createStripeCheckout, isStripeConfigured } from '../../services/payment/stripe';
import { audit } from '../audit/audit.service';
import { reconcileLedger } from '../finance/finance.service';
import { computeBalance } from '../finance/hold';
import { SellerLedger } from '../finance/ledger.model';
import { assertOwnedMedia, storePrefix, tmpPrefix } from '../onboarding/media';
import { BillingAdjustment } from './adjustment.model';
import { addToInvoice, afterSettlement } from './billing.service';
import { BillingPayment, type BillingPaymentLean } from './billingPayment.model';
import { Invoice, amountDue, type InvoiceLean } from './invoice.model';
import { ensureSubscription, lockStoreFinance } from './subscription.service';

/** Paying billing invoices: balance, manual transfer (admin-verified), gateway (webhook-verified). D-084. */

const oid = (s: string | Types.ObjectId) => new Types.ObjectId(String(s));
const iso = (d?: Date | null) => (d ? new Date(d).toISOString() : null);
const PAYABLE = ['open', 'overdue'];

export function paymentDTO(p: BillingPaymentLean, opts: { admin?: boolean } = {}): InvoicePaymentDTO {
  return {
    id: String(p._id),
    invoiceId: String(p.invoiceId),
    invoiceNumber: p.invoiceNumber,
    method: p.method,
    amount: p.amount,
    status: p.status,
    channel: p.channel ?? null,
    reference: p.reference ?? null,
    proofUrl: p.proof?.url ?? null,
    note: p.note ?? null,
    reviewNote: p.reviewNote ?? null,
    createdAt: iso(p.createdAt)!,
    reviewedAt: iso(p.reviewedAt),
    ...(p.method === 'gateway' && p.status === 'pending' && p.gateway?.checkoutUrl ? { checkoutUrl: p.gateway.checkoutUrl } : {}),
    ...(opts.admin ? { storeId: String(p.storeId), gateway: p.gateway ? { provider: p.gateway.provider, transactionId: p.gateway.transactionId ?? null, failure: p.gateway.failure ?? null } : null } : {}),
  };
}

async function ownInvoice(storeId: Types.ObjectId, id: string): Promise<InvoiceLean> {
  const inv = await Invoice.findOne({ _id: oid(id), storeId }).lean<InvoiceLean>();
  if (!inv) throw notFound('Invoice');
  if (!PAYABLE.includes(inv.status) || amountDue(inv) <= 0) throw new AppError(409, 'INVOICE_NOT_PAYABLE', `This invoice is ${inv.status}`);
  return inv;
}

export async function payInvoice(req: Request, invoiceId: string, input: PayInvoiceInput) {
  if (input.method === 'balance') return payFromBalance(req, invoiceId, input.idempotencyKey);
  if (input.method === 'manual') return submitManual(req, invoiceId, input);
  return startGateway(req, invoiceId, input.provider);
}

/** Atomic internal transfer from the seller's available Souqly balance (full amount due only). */
async function payFromBalance(req: Request, invoiceId: string, idempotencyKey?: string) {
  const storeId = req.store!._id;
  if (idempotencyKey) {
    const prior = await BillingPayment.findOne({ storeId, idempotencyKey }).lean<BillingPaymentLean>();
    if (prior) return { payment: paymentDTO(prior), invoice: null, replay: true };
  }
  const inv = await ownInvoice(storeId, invoiceId);
  await ensureSubscription(storeId);
  await reconcileLedger(storeId); // make sure every credit is in the ledger before checking the balance
  const now = new Date();
  let result;
  try {
    result = await withTx(async (session) => {
      await lockStoreFinance(storeId, session);
      const fresh = await Invoice.findOne({ _id: inv._id, storeId }).session(session).lean<InvoiceLean>();
      if (!fresh || !PAYABLE.includes(fresh.status)) throw new AppError(409, 'INVOICE_NOT_PAYABLE', 'This invoice is already settled');
      const due = amountDue(fresh);
      const rows = await SellerLedger.find({ storeId }).select('type amount availableAt').session(session).lean();
      const available = computeBalance(rows, now).available;
      if (available < due) throw new AppError(400, 'INSUFFICIENT_BALANCE', 'Your available balance does not cover this invoice', { available, amountDue: due });
      const [payment] = await BillingPayment.create(
        [{ storeId, invoiceId: fresh._id, invoiceNumber: fresh.number, method: 'balance', amount: due, status: 'succeeded', submittedBy: oid(req.user!.id), ...(idempotencyKey ? { idempotencyKey } : {}) }],
        { session },
      );
      await SellerLedger.create([{ storeId, type: 'invoice_payment', amount: -due, ref: `invoice_payment:${String(payment!._id)}`, invoiceId: fresh._id, availableAt: now, at: now }], { session });
      const settle = await addToInvoice(fresh._id, { paid: due }, now, session);
      return { payment: payment!.toObject() as BillingPaymentLean, settle };
    });
  } catch (err) {
    if (isDuplicateKey(err) && idempotencyKey) {
      const prior = await BillingPayment.findOne({ storeId, idempotencyKey }).lean<BillingPaymentLean>();
      if (prior) return { payment: paymentDTO(prior), invoice: null, replay: true };
    }
    throw err;
  }
  await audit({ action: 'billing.paid_from_balance', targetType: 'Invoice', targetId: inv._id, meta: { amount: result.payment.amount, number: inv.number, paymentId: String(result.payment._id) }, req });
  await afterSettlement(result.settle, req);
  return { payment: paymentDTO(result.payment), invoice: String(result.settle.invoice._id), replay: false };
}

/** Manual bank / wallet transfer: recorded as pending for admin verification (no money is assumed). */
async function submitManual(req: Request, invoiceId: string, input: Extract<PayInvoiceInput, { method: 'manual' }>) {
  const storeId = req.store!._id;
  const inv = await ownInvoice(storeId, invoiceId);
  if (input.proof) assertOwnedMedia(input.proof, [tmpPrefix(req.user!.id), storePrefix(String(storeId))]);
  // Any abandoned gateway attempt is cancelled so the manual claim can be reviewed.
  await BillingPayment.updateMany({ invoiceId: inv._id, status: 'pending', method: 'gateway' }, { $set: { status: 'cancelled' } });
  try {
    const p = await BillingPayment.create({
      storeId,
      invoiceId: inv._id,
      invoiceNumber: inv.number,
      method: 'manual',
      amount: amountDue(inv),
      status: 'pending',
      channel: input.channel,
      reference: input.reference,
      refLock: `${input.channel}:${input.reference.toUpperCase().replace(/\s+/g, '')}`,
      ...(input.proof ? { proof: input.proof } : {}),
      ...(input.note ? { note: input.note } : {}),
      submittedBy: oid(req.user!.id),
    });
    await audit({ action: 'billing.manual_payment_submitted', targetType: 'BillingPayment', targetId: p._id, meta: { invoice: inv.number, amount: p.amount, channel: input.channel }, req });
    return { payment: paymentDTO(p.toObject() as BillingPaymentLean), invoice: String(inv._id), replay: false };
  } catch (err) {
    if (isDuplicateKey(err)) {
      const msg = String((err as Error).message ?? '');
      if (msg.includes('manual_reference_once')) throw new AppError(409, 'DUPLICATE_REFERENCE', 'This transaction reference was already submitted');
      throw new AppError(409, 'PAYMENT_PENDING', 'A payment for this invoice is already waiting for verification');
    }
    throw err;
  }
}

const GATEWAY_ENV: Record<'jazzcash' | 'easypaisa', string[]> = {
  jazzcash: ['JAZZCASH_MERCHANT_ID', 'JAZZCASH_PASSWORD', 'JAZZCASH_INTEGRITY_SALT'],
  easypaisa: ['EASYPAISA_STORE_ID', 'EASYPAISA_HASH_KEY'],
};

/** Hosted gateway checkout. The invoice is settled only by the signature-verified webhook. */
async function startGateway(req: Request, invoiceId: string, provider: 'stripe' | 'jazzcash' | 'easypaisa') {
  if (provider !== 'stripe') {
    throw new AppError(503, 'PAYMENT_NOT_CONFIGURED', `${provider === 'jazzcash' ? 'JazzCash' : 'EasyPaisa'} invoice payments are not available yet`, { provider, requiredEnv: GATEWAY_ENV[provider], note: 'Merchant integration not built yet' });
  }
  if (!isStripeConfigured()) throw new AppError(503, 'PAYMENT_NOT_CONFIGURED', 'Card payments are not configured yet', { provider, requiredEnv: STRIPE_REQUIRED_ENV });
  const storeId = req.store!._id;
  const inv = await ownInvoice(storeId, invoiceId);
  if (await BillingPayment.exists({ invoiceId: inv._id, status: 'pending', method: 'manual' })) throw new AppError(409, 'PAYMENT_PENDING', 'A payment for this invoice is already waiting for verification');
  await BillingPayment.updateMany({ invoiceId: inv._id, status: 'pending', method: 'gateway' }, { $set: { status: 'cancelled' } });
  const p = await BillingPayment.create({ storeId, invoiceId: inv._id, invoiceNumber: inv.number, method: 'gateway', amount: amountDue(inv), status: 'pending', gateway: { provider }, submittedBy: oid(req.user!.id) });
  try {
    const base = `${env.CLIENT_URL}/seller/billing/invoices/${String(inv._id)}`;
    const s = await createStripeCheckout({ paymentId: String(p._id), invoiceNumber: inv.number, amountMinor: p.amount, currency: 'pkr', successUrl: `${base}?paid=1`, cancelUrl: base });
    await BillingPayment.updateOne({ _id: p._id }, { $set: { 'gateway.sessionId': s.sessionId, 'gateway.checkoutUrl': s.url } });
    await audit({ action: 'billing.gateway_started', targetType: 'BillingPayment', targetId: p._id, meta: { invoice: inv.number, amount: p.amount, provider }, req });
    return { payment: paymentDTO((await BillingPayment.findById(p._id).lean<BillingPaymentLean>())!), invoice: String(inv._id), replay: false };
  } catch (err) {
    await BillingPayment.updateOne({ _id: p._id }, { $set: { status: 'failed', 'gateway.failure': 'checkout_create_failed' } });
    throw err;
  }
}

type StripeSession = { id?: string; payment_status?: string; amount_total?: number; currency?: string; payment_intent?: string | null; metadata?: Record<string, string> };

/**
 * Verified Stripe event → settle the invoice. Idempotent: the gateway transaction id is unique and a
 * payment is only moved from pending/cancelled once. Amount + currency must match exactly.
 */
export async function handleStripeEvent(event: { id?: string; type?: string; data?: { object?: StripeSession } }): Promise<{ handled: boolean; result: string }> {
  if (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.async_payment_succeeded') return { handled: false, result: 'ignored' };
  const s = event.data?.object ?? {};
  if (s.payment_status !== 'paid' || !s.id) return { handled: false, result: 'not_paid' };
  const payment = await BillingPayment.findOne({ 'gateway.sessionId': s.id }).lean<BillingPaymentLean>();
  if (!payment) return { handled: false, result: 'unknown_session' };
  if (payment.status === 'succeeded') return { handled: true, result: 'duplicate' };
  const txn = String(s.payment_intent ?? s.id);
  if (s.amount_total !== payment.amount || (s.currency ?? '').toLowerCase() !== 'pkr') {
    await BillingPayment.updateOne({ _id: payment._id, status: { $in: ['pending', 'cancelled'] } }, { $set: { status: 'failed', 'gateway.failure': `amount_mismatch:${s.amount_total}:${s.currency}`, 'gateway.transactionId': txn } });
    await audit({ action: 'billing.gateway_amount_mismatch', actorRole: 'system', targetType: 'BillingPayment', targetId: payment._id, storeId: payment.storeId, meta: { expected: payment.amount, got: s.amount_total, currency: s.currency } });
    logger.error({ paymentId: String(payment._id) }, 'Gateway amount mismatch: invoice left unpaid for admin review');
    return { handled: true, result: 'amount_mismatch' };
  }
  await ensureSubscription(payment.storeId);
  const now = new Date();
  try {
    const settle = await withTx(async (session) => {
      await lockStoreFinance(payment.storeId, session);
      const moved = await BillingPayment.updateOne(
        { _id: payment._id, status: { $in: ['pending', 'cancelled'] } },
        { $set: { status: 'succeeded', 'gateway.transactionId': txn, reviewedAt: now } },
        { session },
      );
      if (!moved.modifiedCount) return null;
      const inv = await Invoice.findById(payment.invoiceId).session(session).lean<InvoiceLean>();
      if (!inv || !PAYABLE.includes(inv.status) || amountDue(inv) < payment.amount) {
        // Money arrived but the invoice was settled another way: keep the record for an admin refund.
        await BillingPayment.updateOne({ _id: payment._id }, { $set: { 'gateway.failure': 'invoice_already_settled_refund_required' } }, { session });
        return 'overpaid' as const;
      }
      return addToInvoice(inv._id, { paid: payment.amount }, now, session);
    });
    if (settle === 'overpaid') {
      await audit({ action: 'billing.gateway_overpaid', actorRole: 'system', targetType: 'BillingPayment', targetId: payment._id, storeId: payment.storeId, meta: { amount: payment.amount } });
      return { handled: true, result: 'overpaid' };
    }
    if (!settle) return { handled: true, result: 'duplicate' };
    await audit({ action: 'billing.gateway_paid', actorRole: 'system', targetType: 'Invoice', targetId: payment.invoiceId, storeId: payment.storeId, meta: { amount: payment.amount, provider: 'stripe', eventId: event.id } });
    await afterSettlement(settle);
    return { handled: true, result: 'paid' };
  } catch (err) {
    if (isDuplicateKey(err)) return { handled: true, result: 'duplicate' };
    throw err;
  }
}

// ---------------- admin verification ----------------
export async function approvePayment(req: Request, id: string, amount?: number, note?: string) {
  const p = await BillingPayment.findById(oid(id)).lean<BillingPaymentLean>();
  if (!p) throw notFound('Payment');
  if (p.method !== 'manual' || p.status !== 'pending') throw new AppError(409, 'INVALID_PAYMENT_STATE', 'Only pending manual payments can be approved');
  const approved = amount ?? p.amount;
  await ensureSubscription(p.storeId);
  const now = new Date();
  const settle = await withTx(async (session) => {
    await lockStoreFinance(p.storeId, session);
    const moved = await BillingPayment.updateOne(
      { _id: p._id, status: 'pending' },
      { $set: { status: 'succeeded', amount: approved, reviewedBy: oid(req.user!.id), reviewedAt: now, ...(note ? { reviewNote: note } : {}) } },
      { session },
    );
    if (!moved.modifiedCount) throw new AppError(409, 'INVALID_PAYMENT_STATE', 'This payment was just reviewed');
    const res = await addToInvoice(p.invoiceId, { paid: approved }, now, session);
    await BillingAdjustment.create(
      [{ storeId: p.storeId, type: 'manual_payment', invoiceId: p.invoiceId, paymentId: p._id, amount: approved, reason: note ?? `Verified ${p.channel ?? 'manual'} transfer ${p.reference ?? ''}`.trim(), by: oid(req.user!.id), meta: { claimed: p.amount, partial: approved < p.amount } }],
      { session },
    );
    return res;
  });
  await audit({ action: 'admin.billing_payment_approved', targetType: 'BillingPayment', targetId: p._id, storeId: p.storeId, meta: { amount: approved, claimed: p.amount, invoice: p.invoiceNumber }, req });
  await afterSettlement(settle, req);
  return paymentDTO((await BillingPayment.findById(p._id).lean<BillingPaymentLean>())!, { admin: true });
}

export async function rejectPayment(req: Request, id: string, reason: string) {
  const p = await BillingPayment.findOneAndUpdate(
    { _id: oid(id), method: 'manual', status: 'pending' },
    { $set: { status: 'rejected', reviewedBy: oid(req.user!.id), reviewedAt: new Date(), reviewNote: reason }, $unset: { refLock: 1 } },
    { new: true },
  ).lean<BillingPaymentLean>();
  if (!p) {
    if (!(await BillingPayment.exists({ _id: oid(id) }))) throw notFound('Payment');
    throw new AppError(409, 'INVALID_PAYMENT_STATE', 'Only pending manual payments can be rejected');
  }
  await audit({ action: 'admin.billing_payment_rejected', targetType: 'BillingPayment', targetId: p._id, storeId: p.storeId, meta: { reason, invoice: p.invoiceNumber }, req });
  return paymentDTO(p, { admin: true });
}

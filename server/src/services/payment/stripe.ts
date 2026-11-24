import crypto from 'node:crypto';
import { env } from '../../config/env';
import { AppError } from '../../lib/AppError';

/**
 * Minimal Stripe Checkout integration over the REST API (no SDK). Used for seller invoice payments
 * (docs/api-billing.md §4). Only "configured" when BOTH the secret key and the webhook secret exist:
 * a payment is never marked received without a signature-verified webhook.
 */
export const STRIPE_REQUIRED_ENV = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'] as const;

export function isStripeConfigured(): boolean {
  return !!env.STRIPE_SECRET_KEY && !!env.STRIPE_WEBHOOK_SECRET;
}

export type StripeCheckoutInput = {
  /** Our payment id: idempotency key + metadata. */
  paymentId: string;
  invoiceNumber: string;
  amountMinor: number;
  currency: 'pkr';
  successUrl: string;
  cancelUrl: string;
};

export async function createStripeCheckout(input: StripeCheckoutInput): Promise<{ sessionId: string; url: string }> {
  if (!isStripeConfigured()) throw new AppError(503, 'PAYMENT_NOT_CONFIGURED', 'Card payments are not configured', { provider: 'stripe', requiredEnv: STRIPE_REQUIRED_ENV });
  const body = new URLSearchParams({
    mode: 'payment',
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.paymentId,
    'metadata[paymentId]': input.paymentId,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': input.currency,
    'line_items[0][price_data][unit_amount]': String(input.amountMinor),
    'line_items[0][price_data][product_data][name]': `Souqly invoice ${input.invoiceNumber}`,
  });
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': `souqly-${input.paymentId}` },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as { id?: string; url?: string; error?: { message?: string } };
  if (!res.ok || !json.id || !json.url) throw new AppError(502, 'GATEWAY_ERROR', 'The payment gateway could not start the payment. Please try again.');
  return { sessionId: json.id, url: json.url };
}

/**
 * Verifies a `Stripe-Signature` header (`t=<ts>,v1=<hex>`): HMAC-SHA256 of `${t}.${rawBody}` with the
 * webhook secret, constant-time compare, and a 5-minute timestamp tolerance (replay protection).
 */
export function verifyStripeSignature(rawBody: Buffer | string, header: string | undefined, secret: string, now = Date.now(), toleranceSec = 300): boolean {
  if (!header || !secret) return false;
  const parts = header.split(',').map((p) => p.trim().split('='));
  const t = parts.find(([k]) => k === 't')?.[1];
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v ?? '');
  if (!t || !/^\d+$/.test(t) || !sigs.length) return false;
  if (Math.abs(now / 1000 - Number(t)) > toleranceSec) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8')}`).digest();
  return sigs.some((s) => {
    if (!/^[0-9a-f]{64}$/i.test(s)) return false;
    return crypto.timingSafeEqual(Buffer.from(s, 'hex'), expected);
  });
}

/** Test/dev helper: builds a valid signature header for a payload. */
export function signStripePayload(rawBody: string, secret: string, at = Math.floor(Date.now() / 1000)): string {
  const sig = crypto.createHmac('sha256', secret).update(`${at}.${rawBody}`).digest('hex');
  return `t=${at},v1=${sig}`;
}

import {
  PERMISSIONS,
  PLANS,
  PLATFORM_COMMISSION_BPS,
  billingPaymentListQuerySchema,
  changePlanSchema,
  commissionListQuerySchema,
  emptyBodySchema,
  invoiceListQuerySchema,
  objectIdSchema,
  payInvoiceSchema,
} from '@souqly/shared';
import express, { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { env } from '../../config/env';
import { AppError } from '../../lib/AppError';
import { asyncHandler } from '../../lib/asyncHandler';
import { logger } from '../../lib/logger';
import { requireAuth } from '../../middleware/auth';
import { forbidImpersonatedWrites } from '../../middleware/impersonation';
import { requirePermission } from '../../middleware/permissions';
import { storeContext } from '../../middleware/storeContext';
import { validate } from '../../middleware/validate';
import { verifyStripeSignature } from '../../services/payment/stripe';
import { audit } from '../audit/audit.service';
import { cancelScheduledChange, changePlan } from './billing.service';
import { handleStripeEvent, payInvoice } from './billingPayments.service';
import * as read from './billingRead.service';
import { Invoice, type InvoiceLean } from './invoice.model';
import { renderBillingInvoice } from './pdf';

/**
 * Seller billing (`/seller/billing/*`, docs/api-billing.md §5). storeId comes ONLY from req.store.
 * storeContext lets billing-suspended stores in (only moderation suspension locks the Seller Center),
 * so a suspended seller can always see and pay dues.
 */
export const sellerBillingRouter = Router();
// Impersonating admins can view billing but never change plans or pay (security review H1).
sellerBillingRouter.use(requireAuth, forbidImpersonatedWrites, storeContext);
const VIEW = requirePermission(PERMISSIONS.STORE_FINANCE_VIEW);
const MANAGE = requirePermission(PERMISSIONS.STORE_FINANCE_MANAGE);
const idParams = z.object({ id: objectIdSchema });
type Page = { cursor?: string; limit: number };

sellerBillingRouter.get('/summary', VIEW, asyncHandler(async (req, res) => res.json({ data: await read.sellerSummary(req.store!._id) })));
sellerBillingRouter.get('/plans', VIEW, asyncHandler(async (req, res) => res.json({ data: await read.plansCatalog(req.store!._id, req.store!.plan) })));
sellerBillingRouter.get('/payment-options', VIEW, asyncHandler(async (req, res) => res.json({ data: await read.paymentOptions(req.store!._id) })));

sellerBillingRouter.post(
  '/change-plan',
  MANAGE,
  validate({ body: changePlanSchema }),
  asyncHandler(async (req, res) => {
    const r = await changePlan(req, req.body.plan);
    res.status(r.invoice ? 201 : 200).json({ data: r });
  }),
);
sellerBillingRouter.post(
  '/cancel',
  MANAGE,
  validate({ body: emptyBodySchema }),
  asyncHandler(async (req, res) => res.json({ data: await changePlan(req, 'free') })),
);
sellerBillingRouter.delete('/scheduled-change', MANAGE, validate({ body: emptyBodySchema }), asyncHandler(async (req, res) => res.json({ data: await cancelScheduledChange(req) })));

sellerBillingRouter.get(
  '/invoices',
  VIEW,
  validate({ query: invoiceListQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof invoiceListQuerySchema>;
    const { items, nextCursor } = await read.listInvoices({ storeId: req.store!._id, ...(q.status ? { status: q.status } : {}), ...(q.kind ? { kind: q.kind } : {}) }, q);
    res.json({ data: items, meta: { nextCursor } });
  }),
);
sellerBillingRouter.get(
  '/invoices/:id',
  VIEW,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => res.json({ data: await read.invoiceDetail({ _id: new Types.ObjectId(req.params.id!), storeId: req.store!._id }) })),
);
sellerBillingRouter.get(
  '/invoices/:id/pdf',
  VIEW,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const inv = await Invoice.findOne({ _id: req.params.id, storeId: req.store!._id }).lean<InvoiceLean>();
    if (!inv) throw new AppError(404, 'NOT_FOUND', 'Invoice not found');
    const pdf = await renderBillingInvoice(inv, { name: req.store!.name, slug: req.store!.slug });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${inv.number.replace(/[^A-Za-z0-9_-]/g, '_')}.pdf"`);
    res.send(pdf);
  }),
);
sellerBillingRouter.post(
  '/invoices/:id/pay',
  MANAGE,
  validate({ params: idParams, body: payInvoiceSchema }),
  asyncHandler(async (req, res) => {
    const r = await payInvoice(req, req.params.id!, req.body);
    res.status(r.replay ? 200 : 201).json({ data: r.payment });
  }),
);
sellerBillingRouter.get(
  '/payments',
  VIEW,
  validate({ query: billingPaymentListQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof billingPaymentListQuerySchema>;
    const { items, nextCursor } = await read.listPayments({ storeId: req.store!._id, ...(q.status ? { status: q.status } : {}) }, q);
    res.json({ data: items, meta: { nextCursor } });
  }),
);
sellerBillingRouter.get(
  '/commissions',
  VIEW,
  validate({ query: commissionListQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof commissionListQuerySchema> & Page;
    const { items, nextCursor } = await read.listCommissions({ storeId: req.store!._id, ...(q.status ? { status: q.status } : {}), ...(q.channel ? { channel: q.channel } : {}), ...(q.kind ? { kind: q.kind } : {}) }, q);
    res.json({ data: items, meta: { nextCursor } });
  }),
);

/** Public plan catalog (`GET /plans`) for the plan page and the Become-a-Seller wizard. */
export const publicPlansRouter = Router();
publicPlansRouter.get('/plans', (_req, res) => {
  res.json({ data: { commissionBps: PLATFORM_COMMISSION_BPS, plans: Object.values(PLANS) } });
});

/**
 * Gateway webhooks (`POST /api/v1/webhooks/stripe`). Mounted on the app BEFORE the JSON parser: the
 * signature is computed over the raw body. Unsigned / badly signed calls get 400 and change nothing.
 */
export const webhookRouter = Router();
webhookRouter.post(
  '/stripe',
  express.raw({ type: '*/*', limit: '256kb' }),
  asyncHandler(async (req, res) => {
    const secret = env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new AppError(404, 'NOT_FOUND', 'Route not found');
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    if (!verifyStripeSignature(raw, req.header('stripe-signature'), secret)) {
      await audit({ action: 'billing.webhook_rejected', actorRole: 'system', meta: { provider: 'stripe' } });
      throw new AppError(400, 'INVALID_SIGNATURE', 'Invalid signature');
    }
    let event: Parameters<typeof handleStripeEvent>[0];
    try {
      event = JSON.parse(raw.toString('utf8'));
    } catch {
      throw new AppError(400, 'INVALID_PAYLOAD', 'Invalid payload');
    }
    const r = await handleStripeEvent(event);
    logger.info({ provider: 'stripe', type: event.type, result: r.result }, 'Webhook processed');
    res.json({ data: { received: true, result: r.result } });
  }),
);

import {
  PERMISSIONS,
  adminAdjustmentListQuerySchema,
  adminApprovePaymentSchema,
  adminBillingExtendSchema,
  adminBillingInvoiceListQuerySchema,
  adminBillingPaymentListQuerySchema,
  adminBillingPlanSchema,
  adminBillingReasonSchema,
  adminBillingReportQuerySchema,
  adminBillingStoreListQuerySchema,
  adminCommissionListQuerySchema,
  adminRejectPaymentSchema,
  adminWaiveSchema,
  billingSettingsSchema,
  objectIdSchema,
} from '@souqly/shared';
import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler';
import { streamCsv } from '../../lib/csv';
import { validate } from '../../middleware/validate';
import { can, range } from '../admin/common';
import { audit } from '../audit/audit.service';
import { adminExtend, adminReactivate, adminSetPlan, adminSuspend, adminWaive, getBillingSettings, runBillingSweep, setBillingSettings } from './billing.service';
import { approvePayment, rejectPayment } from './billingPayments.service';
import * as read from './billingRead.service';
import { Invoice, amountDue, type InvoiceLean } from './invoice.model';
import { renderBillingInvoice } from './pdf';
import { notFound } from '../../lib/AppError';
import { Store } from '../stores/store.model';

/**
 * Admin billing (`/admin/billing/*`, docs/api-billing.md §6). Per-route `can()` only: this router is
 * mounted at /admin, so a router-level `.use()` would run for every admin path (D-076).
 */
export const adminBillingRouter = Router();
const VIEW = can(PERMISSIONS.ADMIN_BILLING_VIEW);
const MANAGE = can(PERMISSIONS.ADMIN_BILLING_MANAGE);
const oid = (s: string) => new Types.ObjectId(s);
const storeParams = z.object({ storeId: objectIdSchema });
const idParams = z.object({ id: objectIdSchema });
const P = '/billing';

adminBillingRouter.get(`${P}/overview`, ...VIEW, asyncHandler(async (_req, res) => res.json({ data: await read.adminOverview() })));

adminBillingRouter.get(
  `${P}/stores`,
  ...VIEW,
  validate({ query: adminBillingStoreListQuerySchema }),
  asyncHandler(async (req, res) => {
    const { items, nextCursor } = await read.adminStoreList(req.query as unknown as z.infer<typeof adminBillingStoreListQuerySchema>);
    res.json({ data: items, meta: { nextCursor } });
  }),
);
adminBillingRouter.get(`${P}/stores/:storeId`, ...VIEW, validate({ params: storeParams }), asyncHandler(async (req, res) => res.json({ data: await read.adminStoreDetail(oid(req.params.storeId!)) })));
adminBillingRouter.post(
  `${P}/stores/:storeId/plan`,
  ...MANAGE,
  validate({ params: storeParams, body: adminBillingPlanSchema }),
  asyncHandler(async (req, res) => res.json({ data: await adminSetPlan(req, oid(req.params.storeId!), req.body.plan, req.body.reason) })),
);
adminBillingRouter.post(
  `${P}/stores/:storeId/extend`,
  ...MANAGE,
  validate({ params: storeParams, body: adminBillingExtendSchema }),
  asyncHandler(async (req, res) => res.json({ data: await adminExtend(req, oid(req.params.storeId!), req.body.days, req.body.reason) })),
);
adminBillingRouter.post(
  `${P}/stores/:storeId/suspend`,
  ...MANAGE,
  validate({ params: storeParams, body: adminBillingReasonSchema }),
  asyncHandler(async (req, res) => res.json({ data: await adminSuspend(req, oid(req.params.storeId!), req.body.reason) })),
);
adminBillingRouter.post(
  `${P}/stores/:storeId/reactivate`,
  ...MANAGE,
  validate({ params: storeParams, body: adminBillingReasonSchema }),
  asyncHandler(async (req, res) => res.json({ data: await adminReactivate(req, oid(req.params.storeId!), req.body.reason) })),
);

type InvoiceQuery = z.infer<typeof adminBillingInvoiceListQuerySchema>;
const invoiceFilter = (q: InvoiceQuery) => ({ ...(q.status ? { status: q.status } : {}), ...(q.kind ? { kind: q.kind } : {}), ...(q.storeId ? { storeId: oid(q.storeId) } : {}) });

adminBillingRouter.get(
  `${P}/invoices`,
  ...VIEW,
  validate({ query: adminBillingInvoiceListQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as InvoiceQuery;
    if (q.format === 'csv') {
      await audit({ action: 'admin.export_csv', targetType: 'Invoice', meta: { resource: 'billing-invoices' }, req });
      const cursor = Invoice.find(invoiceFilter(q)).sort({ issuedAt: -1 }).lean<InvoiceLean[]>().cursor() as AsyncIterable<InvoiceLean>;
      return streamCsv(res, 'billing-invoices.csv', [
        { header: 'number', value: (i: InvoiceLean) => i.number },
        { header: 'storeId', value: (i) => String(i.storeId) },
        { header: 'kind', value: (i) => i.kind },
        { header: 'status', value: (i) => i.status },
        { header: 'plan', value: (i) => i.plan },
        { header: 'total_minor', value: (i) => i.total },
        { header: 'paid_minor', value: (i) => i.amountPaid },
        { header: 'waived_minor', value: (i) => i.amountWaived },
        { header: 'due_minor', value: (i) => amountDue(i) },
        { header: 'issuedAt', value: (i) => i.issuedAt },
        { header: 'dueDate', value: (i) => i.dueDate },
        { header: 'paidAt', value: (i) => i.paidAt },
      ], cursor);
    }
    const { items, nextCursor } = await read.listInvoices(invoiceFilter(q), q, true);
    res.json({ data: items, meta: { nextCursor } });
  }),
);
adminBillingRouter.get(`${P}/invoices/:id`, ...VIEW, validate({ params: idParams }), asyncHandler(async (req, res) => res.json({ data: await read.invoiceDetail({ _id: oid(req.params.id!) }, true) })));
adminBillingRouter.get(
  `${P}/invoices/:id/pdf`,
  ...VIEW,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const inv = await Invoice.findById(oid(req.params.id!)).lean<InvoiceLean>();
    if (!inv) throw notFound('Invoice');
    const store = await Store.findById(inv.storeId).select('name slug').lean();
    const pdf = await renderBillingInvoice(inv, { name: store?.name ?? 'Store', slug: store?.slug ?? '' });
    await audit({ action: 'admin.billing_invoice_pdf', targetType: 'Invoice', targetId: inv._id, storeId: inv.storeId, meta: { number: inv.number }, req });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${inv.number.replace(/[^A-Za-z0-9_-]/g, '_')}.pdf"`);
    res.send(pdf);
  }),
);
adminBillingRouter.post(
  `${P}/invoices/:id/waive`,
  ...MANAGE,
  validate({ params: idParams, body: adminWaiveSchema }),
  asyncHandler(async (req, res) => res.json({ data: await adminWaive(req, oid(req.params.id!), req.body.amount, req.body.reason) })),
);

adminBillingRouter.get(
  `${P}/payments`,
  ...VIEW,
  validate({ query: adminBillingPaymentListQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof adminBillingPaymentListQuerySchema>;
    const filter = { ...(q.status ? { status: q.status } : {}), ...(q.method ? { method: q.method } : {}), ...(q.storeId ? { storeId: oid(q.storeId) } : {}) };
    const { items, nextCursor } = await read.listPayments(filter, q, true);
    res.json({ data: items, meta: { nextCursor } });
  }),
);
adminBillingRouter.post(
  `${P}/payments/:id/approve`,
  ...MANAGE,
  validate({ params: idParams, body: adminApprovePaymentSchema }),
  asyncHandler(async (req, res) => res.json({ data: await approvePayment(req, req.params.id!, req.body.amount, req.body.note) })),
);
adminBillingRouter.post(
  `${P}/payments/:id/reject`,
  ...MANAGE,
  validate({ params: idParams, body: adminRejectPaymentSchema }),
  asyncHandler(async (req, res) => res.json({ data: await rejectPayment(req, req.params.id!, req.body.reason) })),
);

adminBillingRouter.get(
  `${P}/commissions`,
  ...VIEW,
  validate({ query: adminCommissionListQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof adminCommissionListQuerySchema>;
    const filter = { ...(q.storeId ? { storeId: oid(q.storeId) } : {}), ...(q.status ? { status: q.status } : {}), ...(q.channel ? { channel: q.channel } : {}), ...(q.kind ? { kind: q.kind } : {}) };
    const { items, nextCursor } = await read.listCommissions(filter, q, true);
    res.json({ data: items, meta: { nextCursor } });
  }),
);
adminBillingRouter.get(
  `${P}/adjustments`,
  ...VIEW,
  validate({ query: adminAdjustmentListQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof adminAdjustmentListQuerySchema>;
    const { items, nextCursor } = await read.listAdjustments({ ...(q.storeId ? { storeId: oid(q.storeId) } : {}), ...(q.type ? { type: q.type } : {}) }, q);
    res.json({ data: items, meta: { nextCursor } });
  }),
);

adminBillingRouter.get(
  `${P}/report`,
  ...VIEW,
  validate({ query: adminBillingReportQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof adminBillingReportQuerySchema>;
    const { from, to } = range(q.from, q.to);
    const rows = await read.billingReport(from, to);
    if (q.format === 'csv') {
      await audit({ action: 'admin.export_csv', targetType: 'BillingReport', meta: { resource: 'billing-report', from, to }, req });
      async function* gen() {
        yield* rows;
      }
      return streamCsv(res, 'billing-report.csv', [
        { header: 'store', value: (r: read.BillingReportRow) => r.store },
        { header: 'storeId', value: (r) => r.storeId },
        { header: 'plan', value: (r) => r.plan },
        { header: 'fees_billed_minor', value: (r) => r.feesBilled },
        { header: 'fees_paid_minor', value: (r) => r.feesPaid },
        { header: 'fees_waived_minor', value: (r) => r.waived },
        { header: 'cod_commission_minor', value: (r) => r.codCommission },
        { header: 'online_commission_minor', value: (r) => r.onlineCommission },
        { header: 'reversals_minor', value: (r) => r.reversals },
        { header: 'outstanding_minor', value: (r) => r.outstanding },
      ], gen());
    }
    res.json({ data: { from: from.toISOString(), to: to.toISOString(), rows } });
  }),
);

adminBillingRouter.get(`${P}/settings`, ...VIEW, asyncHandler(async (_req, res) => res.json({ data: await getBillingSettings() })));
adminBillingRouter.put(
  `${P}/settings`,
  ...MANAGE,
  validate({ body: billingSettingsSchema }),
  asyncHandler(async (req, res) => res.json({ data: await setBillingSettings(req, req.body) })),
);
adminBillingRouter.post(
  `${P}/sweep`,
  ...MANAGE,
  asyncHandler(async (req, res) => {
    const result = await runBillingSweep();
    await audit({ action: 'admin.billing_sweep_run', targetType: 'Billing', meta: result, req });
    res.json({ data: result });
  }),
);


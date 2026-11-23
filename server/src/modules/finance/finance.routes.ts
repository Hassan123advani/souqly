import { PERMISSIONS, financeTransactionsQuerySchema, formatMoney, objectIdSchema, payoutRequestSchema, statementQuerySchema, cursorQuerySchema } from '@souqly/shared';
import { Router } from 'express';
import PDFDocument from 'pdfkit';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler';
import { csvRow } from '../../lib/csv';
import { requireAuth } from '../../middleware/auth';
import { requirePermission } from '../../middleware/permissions';
import { storeContext } from '../../middleware/storeContext';
import { validate } from '../../middleware/validate';
import { audit } from '../audit/audit.service';
import * as svc from './finance.service';

/** Seller finance (`/seller/finance/*`). storeId comes ONLY from req.store. */
export const sellerFinanceRouter = Router();
sellerFinanceRouter.use(requireAuth, storeContext);
const VIEW = requirePermission(PERMISSIONS.STORE_FINANCE_VIEW);
const MANAGE = requirePermission(PERMISSIONS.STORE_FINANCE_MANAGE);

sellerFinanceRouter.get('/summary', VIEW, asyncHandler(async (req, res) => res.json({ data: await svc.financeSummary(req.store!._id) })));

sellerFinanceRouter.get(
  '/transactions',
  VIEW,
  validate({ query: financeTransactionsQuerySchema }),
  asyncHandler(async (req, res) => {
    const { items, nextCursor } = await svc.listTransactions(req.store!._id, req.query as unknown as z.infer<typeof financeTransactionsQuerySchema>);
    res.json({ data: items, meta: { nextCursor } });
  }),
);

sellerFinanceRouter.get(
  '/orders/:id/commission',
  VIEW,
  validate({ params: z.object({ id: objectIdSchema }) }),
  asyncHandler(async (req, res) => res.json({ data: await svc.orderCommission(req.store!._id, req.params.id!) })),
);

sellerFinanceRouter.get(
  '/payout-requests',
  VIEW,
  validate({ query: cursorQuerySchema }),
  asyncHandler(async (req, res) => {
    const { items, nextCursor } = await svc.listPayouts(req.store!._id, req.query as unknown as { cursor?: string; limit: number });
    res.json({ data: items, meta: { nextCursor } });
  }),
);

sellerFinanceRouter.post(
  '/payout-requests',
  MANAGE,
  validate({ body: payoutRequestSchema }),
  asyncHandler(async (req, res) => res.status(201).json({ data: await svc.requestPayout(req, req.body.amount) })),
);

const safe = (s: string) => s.replace(/[^\x20-\x7E\n]/g, '?');

sellerFinanceRouter.get(
  '/statements',
  VIEW,
  validate({ query: statementQuerySchema }),
  asyncHandler(async (req, res) => {
    const { month, format } = req.query as unknown as z.infer<typeof statementQuerySchema>;
    const st = await svc.statement(req.store!._id, month);
    if (format === 'json') return void res.json({ data: st });
    await audit({ action: 'store.statement_exported', targetType: 'Store', targetId: req.store!._id, meta: { month, format }, req });
    const filename = `statement-${req.store!.slug}-${month}`.replace(/[^a-z0-9._-]/gi, '_');
    if (format === 'csv') {
      let out = '﻿' + csvRow(['date', 'type', 'reference', 'order', 'amount_minor', 'commission_minor']);
      for (const e of st.entries) out += csvRow([e.at, e.type, e.ref, e.orderNumber ?? '', e.amount, e.commission?.amount ?? '']);
      out += csvRow(['', 'opening', '', '', st.opening, '']) + csvRow(['', 'closing', '', '', st.closing, '']);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      return void res.send(out);
    }
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
    doc.pipe(res);
    doc.fillColor('#0E5E5A').fontSize(20).text(safe(`${req.store!.name} - Statement ${month}`));
    doc.fillColor('#8A8178').fontSize(10).text('Souqly seller statement. Amounts in PKR.').moveDown();
    doc.fillColor('#2A2622').fontSize(11);
    doc.text(safe(`Opening balance: ${formatMoney(st.opening)}`));
    doc.text(safe(`Sales (net): ${formatMoney(st.totals.sales)}   Commission: ${formatMoney(st.totals.commission)}`));
    doc.text(safe(`Refunds: ${formatMoney(st.totals.refunds)}   Payouts: ${formatMoney(st.totals.payouts)}   Reversals: ${formatMoney(st.totals.reversals)}`));
    doc.text(safe(`Closing balance: ${formatMoney(st.closing)}`)).moveDown();
    doc.fontSize(9);
    for (const e of st.entries) doc.text(safe(`${e.at.slice(0, 10)}  ${e.type.padEnd(16)} ${(e.orderNumber ?? '').padEnd(22)} ${formatMoney(e.amount)}`));
    doc.end();
  }),
);

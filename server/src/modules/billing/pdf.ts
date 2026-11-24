import { formatMoney } from '@souqly/shared';
import PDFDocument from 'pdfkit';
import type { InvoiceLean } from './invoice.model';
import { amountDue } from './invoice.model';

const TEAL = '#0E5E5A';
const SAFFRON = '#F2A93B';
const INK = '#2A2622';
const MUTED = '#8A8178';

/** PDF core fonts are WinAnsi: anything else becomes '?'. */
const safe = (s: string | undefined | null) => (s ?? '').replace(/[^\x20-\x7E\n]/g, '?');
const money = (m: number) => safe(formatMoney(m));
const day = (d?: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : '-');

/** Branded A4 billing invoice (Souqly → seller). */
export function renderBillingInvoice(inv: InvoiceLean, store: { name: string; slug: string }): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `Souqly invoice ${inv.number}`, Author: 'Souqly' } });
  const done = new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  const W = doc.page.width - 96;
  doc.rect(0, 0, doc.page.width, 84).fill(TEAL);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(24).text('Souqly', 48, 28);
  doc.fillColor(SAFFRON).font('Helvetica').fontSize(10).text('Seller billing', 48, 56);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(16).text('INVOICE', 48, 32, { width: W, align: 'right' });

  doc.fillColor(INK).font('Helvetica-Bold').fontSize(10).text('Billed to', 48, 104).font('Helvetica');
  doc.text(safe(`${store.name} (/${store.slug})`), 48, 118);
  doc.font('Helvetica-Bold').text('Invoice details', 48 + W / 2, 104).font('Helvetica');
  doc.text(
    [`Invoice: ${inv.number}`, `Type: ${inv.kind === 'upgrade' ? 'Plan upgrade' : 'Monthly'}`, `Issued: ${day(inv.issuedAt)}`, `Due: ${day(inv.dueDate)}`, `Status: ${inv.status.toUpperCase()}`, `Period: ${day(inv.periodStart)} to ${day(inv.periodEnd)}`]
      .map(safe)
      .join('\n'),
    48 + W / 2,
    118,
  );

  let y = 220;
  doc.rect(48, y, W, 20).fill('#F3EEE6');
  doc.fillColor(INK).font('Helvetica-Bold').text('Description', 56, y + 6).text('Amount', 48, y + 6, { width: W - 8, align: 'right' });
  y += 26;
  doc.font('Helvetica');
  for (const l of inv.lines) {
    const extra = l.entries ? ` (${l.entries} entries)` : '';
    doc.fillColor(INK).text(safe(l.description + extra), 56, y, { width: W - 140 });
    doc.text(money(l.amount), 48, y, { width: W - 8, align: 'right' });
    y += 22;
  }
  y += 8;
  doc.moveTo(48, y).lineTo(48 + W, y).strokeColor(MUTED).stroke();
  y += 10;
  const row = (label: string, value: number, bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(INK).text(label, 48 + W / 2, y).text(money(value), 48, y, { width: W - 8, align: 'right' });
    y += 18;
  };
  row('Total', inv.total, true);
  if (inv.amountPaid) row('Paid', -inv.amountPaid);
  if (inv.amountWaived) row('Waived', -inv.amountWaived);
  row('Amount due', amountDue(inv), true);
  doc.fillColor(MUTED).font('Helvetica').fontSize(8).text('Amounts in PKR. Commission is 15% of the product value of delivered orders (shipping excluded).', 48, 760, { width: W, align: 'center' });
  doc.end();
  return done;
}

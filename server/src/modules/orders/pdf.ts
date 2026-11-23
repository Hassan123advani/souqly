import { formatMoney } from '@souqly/shared';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import type { OrderLean } from './order.model';

const TEAL = '#0E5E5A';
const SAFFRON = '#F2A93B';
const INK = '#2A2622';
const MUTED = '#8A8178';

type StoreForPdf = { name: string; address?: { line1?: string; area?: string; city?: string }; contact?: { phone?: string; email?: string } };

/** Collects the document's output; call `doc.end()` after drawing to resolve it. */
function collect(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

/** PDF core fonts are WinAnsi; strip characters they cannot render (Urdu/Arabic names fall back to '?'). */
const safe = (s: string | undefined | null) => (s ?? '').replace(/[^\x20-\x7E -ÿ\n]/g, '?');
const money = (m: number) => safe(formatMoney(m));

function addressLines(a: OrderLean['shippingAddress']): string[] {
  return [a.fullName, a.line1, a.line2, [a.area, a.city].filter(Boolean).join(', '), a.postalCode, a.phone].filter(Boolean).map((x) => safe(String(x)));
}

/** Branded A4 invoice for one sub-order. */
export async function renderInvoice(order: OrderLean, store: StoreForPdf): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `Invoice ${order.invoiceNumber}`, Author: 'Souqly' } });
  const done = collect(doc);
  const W = doc.page.width - 96;

  doc.rect(0, 0, doc.page.width, 84).fill(TEAL);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(24).text('Souqly', 48, 28);
  doc.fillColor(SAFFRON).font('Helvetica').fontSize(10).text('Every shop, one souq.', 48, 56);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(16).text('INVOICE', 48, 32, { width: W, align: 'right' });

  doc.fillColor(INK).font('Helvetica').fontSize(10);
  let y = 104;
  doc.font('Helvetica-Bold').text('Sold by', 48, y).font('Helvetica');
  doc.text(safe(store.name), 48, y + 14);
  const storeAddr = [store.address?.line1, [store.address?.area, store.address?.city].filter(Boolean).join(', '), store.contact?.phone].filter(Boolean).map((x) => safe(String(x)));
  doc.fillColor(MUTED).text(storeAddr.join('\n'), 48, y + 28, { width: W / 2 - 10 });

  doc.fillColor(INK).font('Helvetica-Bold').text('Invoice details', 48 + W / 2, y).font('Helvetica');
  doc.text(
    [`Invoice: ${order.invoiceNumber}`, `Order: ${order.number}`, `Date: ${order.createdAt.toISOString().slice(0, 10)}`, `Payment: ${order.payment.method.toUpperCase()} (${order.payment.status})`].join('\n'),
    48 + W / 2,
    y + 14,
  );

  y = 200;
  doc.font('Helvetica-Bold').text('Ship to', 48, y).font('Helvetica').text(addressLines(order.shippingAddress).join('\n'), 48, y + 14);

  // Items table
  y = 290;
  const cols = [48, 300, 370, 430, 490];
  doc.rect(48, y - 6, W, 22).fill('#F3EEE6');
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(9);
  ['Item', 'SKU', 'Qty', 'Price', 'Total'].forEach((h, i) => doc.text(h, cols[i]!, y, { width: i === 0 ? 245 : 60, align: i >= 2 ? 'right' : 'left' }));
  y += 24;
  doc.font('Helvetica').fontSize(9);
  for (const it of order.items) {
    const opts = Object.entries(it.options ?? {}).map(([k, v]) => `${k}: ${v}`).join(', ');
    const title = safe(it.title) + (opts ? `\n${safe(opts)}` : '');
    const h = Math.max(doc.heightOfString(title, { width: 245 }), 12);
    if (y + h > doc.page.height - 160) {
      doc.addPage();
      y = 48;
    }
    doc.fillColor(INK).text(title, cols[0]!, y, { width: 245 });
    doc.fillColor(MUTED).text(safe(it.sku), cols[1]!, y, { width: 60 });
    doc.fillColor(INK).text(String(it.qty), cols[2]!, y, { width: 50, align: 'right' });
    doc.text(money(it.price), cols[3]!, y, { width: 55, align: 'right' });
    doc.text(money(it.lineTotal), cols[4]!, y, { width: 58, align: 'right' });
    y += h + 8;
    doc.moveTo(48, y - 4).lineTo(48 + W, y - 4).strokeColor('#EFE9DF').stroke();
  }

  y += 8;
  const rows: [string, string][] = [
    ['Subtotal', money(order.subtotal)],
    ...(order.discounts.store ? ([['Store discount', `- ${money(order.discounts.store)}`]] as [string, string][]) : []),
    ...(order.discounts.platform ? ([['Souqly voucher', `- ${money(order.discounts.platform)}`]] as [string, string][]) : []),
    ['Shipping', order.shippingFee ? money(order.shippingFee) : 'Free'],
  ];
  doc.fontSize(10);
  for (const [k, v] of rows) {
    doc.fillColor(MUTED).text(k, 330, y, { width: 120 }).fillColor(INK).text(v, 450, y, { width: 98, align: 'right' });
    y += 16;
  }
  doc.rect(330, y, 218, 26).fill(TEAL);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').text('Total', 338, y + 8).text(money(order.total), 450, y + 8, { width: 90, align: 'right' });

  doc.fillColor(MUTED).font('Helvetica').fontSize(8).text('Thank you for shopping on Souqly. This is a computer-generated invoice and needs no signature.', 48, doc.page.height - 72, { width: W, align: 'center' });
  doc.end();
  return done;
}

/** 4x6 inch shipping label with a QR code of the order number. */
export async function renderLabel(order: OrderLean, store: StoreForPdf): Promise<Buffer> {
  const qr = await QRCode.toBuffer(order.number, { type: 'png', margin: 1, width: 240, errorCorrectionLevel: 'M' });
  const doc = new PDFDocument({ size: [288, 432], margin: 14, info: { Title: `Label ${order.number}`, Author: 'Souqly' } });
  const done = collect(doc);
  const W = 288 - 28;

  doc.rect(0, 0, 288, 40).fill(TEAL);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(16).text('Souqly', 14, 12);
  doc.fillColor(SAFFRON).fontSize(10).text(order.payment.method === 'cod' ? `COD ${money(order.total)}` : 'PREPAID', 14, 15, { width: W, align: 'right' });

  doc.fillColor(INK).font('Helvetica-Bold').fontSize(9).text('TO', 14, 52);
  doc.font('Helvetica-Bold').fontSize(13).text(safe(order.shippingAddress.fullName), 14, 64, { width: W });
  doc.font('Helvetica').fontSize(10).text(addressLines({ ...order.shippingAddress, fullName: '' }).filter(Boolean).join('\n'), 14, doc.y + 2, { width: W });

  const fromY = Math.max(doc.y + 10, 170);
  doc.moveTo(14, fromY - 4).lineTo(14 + W, fromY - 4).strokeColor('#CCCCCC').stroke();
  doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED).text('FROM', 14, fromY);
  doc.font('Helvetica').fontSize(9).fillColor(INK).text([safe(store.name), safe(store.address?.city), safe(store.contact?.phone)].filter(Boolean).join('  |  '), 14, fromY + 11, { width: W });

  doc.image(qr, 14, 240, { width: 130 });
  doc.font('Helvetica-Bold').fontSize(11).text(order.number, 154, 248, { width: W - 140 });
  doc.font('Helvetica').fontSize(9).text(`Items: ${order.items.reduce((a, i) => a + i.qty, 0)}`, 154, 270);
  if (order.tracking?.trackingNumber) doc.text(`${safe(order.tracking.courier)}: ${safe(order.tracking.trackingNumber)}`, 154, 284, { width: W - 140 });
  doc.text(`Date: ${order.createdAt.toISOString().slice(0, 10)}`, 154, 312);
  doc.fontSize(7).fillColor(MUTED).text('Scan to open the order in the Souqly rider / seller app.', 14, 400, { width: W, align: 'center' });
  doc.end();
  return done;
}

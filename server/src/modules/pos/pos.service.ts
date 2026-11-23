import type { PosSaleInput } from '@souqly/shared';
import { createHmac } from 'node:crypto';
import type { Request } from 'express';
import { Types } from 'mongoose';
import QRCode from 'qrcode';
import { env } from '../../config/env';
import { AppError, notFound } from '../../lib/AppError';
import { safeEqual } from '../../lib/crypto';
import { escapeRegex } from '../../lib/text';
import { logger } from '../../lib/logger';
import { audit } from '../audit/audit.service';
import { Product } from '../catalog/product.model';
import { adjustStock, recordMovement } from '../inventory/inventory.service';
import { Order, type OrderLean } from '../orders/order.model';
import { invoiceNumberFor, newCheckoutNumber } from '../orders/order.service';
import { Store } from '../stores/store.model';
import { PosShift, type PosShiftLean } from './posShift.model';

/** Offline POS (Phase 10). storeId ALWAYS comes from req.store; ids in bodies are checked against it. */

const oid = (id: string | Types.ObjectId) => new Types.ObjectId(String(id));

// ---------------- catalog / lookup ----------------
type CompactRow = { productId: string; variantId: string; title: string; options: Record<string, string>; sku: string; barcode: string | null; price: number; stock: number; image: string | null; isActive: boolean; updatedAt: string };

function compact(p: { _id: Types.ObjectId; title: string; images?: { url: string }[]; status: string; updatedAt: Date; variants: { _id: Types.ObjectId; sku: string; barcode?: string; options?: Record<string, string>; price: number; stock: number; reserved?: number; isActive: boolean; images?: string[] }[] }): CompactRow[] {
  return p.variants.map((v) => ({
    productId: String(p._id),
    variantId: String(v._id),
    title: p.title,
    options: v.options ?? {},
    sku: v.sku,
    barcode: v.barcode ?? null,
    price: v.price,
    stock: Math.max(0, v.stock - (v.reserved ?? 0)),
    image: v.images?.[0] ?? p.images?.[0]?.url ?? null,
    isActive: v.isActive && p.status !== 'archived',
    updatedAt: p.updatedAt.toISOString(),
  }));
}

const POS_FIELDS = 'title images status updatedAt variants._id variants.sku variants.barcode variants.options variants.price variants.stock variants.reserved variants.isActive variants.images';

export async function posCatalog(storeId: Types.ObjectId, updatedSince?: Date) {
  const rows = await Product.find({ storeId, deletedAt: { $exists: false }, ...(updatedSince ? { updatedAt: { $gt: updatedSince } } : {}) })
    .select(POS_FIELDS)
    .sort({ updatedAt: 1 })
    .limit(5000)
    .lean();
  return { items: rows.flatMap((p) => compact(p as never)), serverTime: new Date().toISOString() };
}

export async function posLookup(storeId: Types.ObjectId, code: string) {
  const exact = new RegExp(`^${escapeRegex(code)}$`, 'i');
  const p = await Product.findOne({ storeId, deletedAt: { $exists: false }, $or: [{ 'variants.barcode': code }, { 'variants.sku': exact }] }).select(POS_FIELDS).lean();
  if (!p) throw notFound('Product');
  const row = compact(p as never).find((r) => r.barcode === code || r.sku.toLowerCase() === code.toLowerCase());
  if (!row) throw notFound('Product');
  return row;
}

// ---------------- sales sync ----------------
export type PosSaleResult = { clientId: string; status: 'created' | 'duplicate' | 'error'; orderId?: string; number?: string; stockConflict?: boolean; error?: { code: string; message: string } };

/** Pure totals for one POS sale (unit-tested). */
export function posTotals(sale: Pick<PosSaleInput, 'items' | 'payments' | 'discount'>) {
  const lines = sale.items.map((i) => ({ ...i, lineTotal: Math.max(0, i.price * i.qty - i.discount) }));
  const subtotal = sale.items.reduce((a, i) => a + i.price * i.qty, 0);
  const lineDiscounts = sale.items.reduce((a, i) => a + Math.min(i.discount, i.price * i.qty), 0);
  const discount = Math.min(subtotal, lineDiscounts + sale.discount);
  const total = subtotal - discount;
  const paid = sale.payments.reduce((a, p) => a + p.amount, 0);
  const cashPaid = sale.payments.filter((p) => p.method === 'cash').reduce((a, p) => a + p.amount, 0);
  // Change can only be given from cash.
  const change = Math.max(0, paid - total);
  return { lines, subtotal, discount, total, paid, change, valid: paid >= total && change <= cashPaid };
}

async function decrementWithClamp(storeId: Types.ObjectId, productId: Types.ObjectId, variantId: Types.ObjectId, qty: number, orderId: string, actorId: string): Promise<boolean> {
  const base = { storeId, productId, variantId, reason: 'sale' as const, ref: { type: 'pos' as const, id: orderId }, actorId };
  try {
    await adjustStock({ ...base, delta: -qty, note: 'POS sale' });
    return false;
  } catch (err) {
    if (!(err instanceof AppError) || err.code !== 'INSUFFICIENT_STOCK') throw err;
  }
  // Offline reality: the sale already happened. Clamp at 0 and record the shortfall.
  const p = await Product.findOne({ _id: productId, storeId }).select('variants._id variants.stock').lean();
  const have = p?.variants.find((v) => v._id.equals(variantId))?.stock ?? 0;
  const note = `POS stock conflict: sold ${qty}, had ${have}`;
  if (have > 0) {
    try {
      await adjustStock({ ...base, delta: -have, note });
      return true;
    } catch (err) {
      logger.warn({ err }, 'POS clamp adjust failed');
    }
  }
  await recordMovement({ ...base, delta: 0, note, balanceAfter: 0 });
  return true;
}

async function syncOne(req: Request, sale: PosSaleInput): Promise<PosSaleResult> {
  const store = req.store!;
  const storeId = store._id;
  const existing = await Order.findOne({ storeId, 'pos.clientId': sale.clientId }).select('number pos.stockConflict').lean();
  if (existing) return { clientId: sale.clientId, status: 'duplicate', orderId: String(existing._id), number: existing.number, stockConflict: !!existing.pos?.stockConflict };
  const fail = (code: string, message: string): PosSaleResult => ({ clientId: sale.clientId, status: 'error', error: { code, message } });

  if (sale.createdAt.getTime() > Date.now() + 5 * 60_000) return fail('INVALID_DATE', 'Sale time is in the future');
  if (sale.shiftId && !(await PosShift.exists({ _id: oid(sale.shiftId), storeId }))) return fail('SHIFT_NOT_FOUND', 'Shift not found');
  const variantIds = sale.items.map((i) => oid(i.variantId));
  const products = await Product.find({ storeId, 'variants._id': { $in: variantIds } }).select('title slug images categoryPath variants._id variants.sku variants.options variants.images').lean();
  const byVariant = new Map<string, { p: (typeof products)[number]; v: (typeof products)[number]['variants'][number] }>();
  for (const p of products) for (const v of p.variants) byVariant.set(String(v._id), { p, v });
  if (sale.items.some((i) => !byVariant.has(i.variantId))) return fail('VARIANT_NOT_FOUND', 'Some items are not in this store');
  const t = posTotals(sale);
  if (!t.valid) return fail('UNDERPAID', 'Payments do not cover the total');

  const number = `${newCheckoutNumber(sale.createdAt)}-P`;
  const cashier = oid(req.user!.id);
  let order: OrderLean;
  try {
    const doc = await Order.create({
      storeId,
      number,
      buyerId: null,
      items: t.lines.map((l) => {
        const { p, v } = byVariant.get(l.variantId)!;
        return {
          productId: p._id,
          variantId: v._id,
          title: p.title,
          slug: p.slug,
          image: v.images?.[0] ?? p.images?.[0]?.url,
          options: v.options ?? {},
          sku: v.sku,
          categoryPath: p.categoryPath ?? [],
          price: l.price,
          qty: l.qty,
          lineTotal: l.lineTotal,
        };
      }),
      subtotal: t.subtotal,
      shippingFee: 0,
      discounts: { store: t.discount, platform: 0, shipping: 0, coins: 0, promo: 0 },
      vouchers: {},
      total: t.total,
      // In-store sales: no platform commission; the cash never passes through Souqly (not in the ledger).
      commission: { bps: 0, amount: 0 },
      sellerNet: t.total,
      status: 'delivered',
      timeline: [{ status: 'delivered', at: sale.createdAt, by: cashier, actor: 'seller', note: 'POS sale' }],
      payment: { method: 'cod', status: 'paid' },
      shippingAddress: { fullName: sale.customer?.name || 'Walk-in customer', phone: sale.customer?.phone ?? '', country: 'PK', city: store.address?.city ?? '', line1: 'In-store' },
      sellerNotes: [],
      channel: 'pos',
      invoiceNumber: invoiceNumberFor(number),
      pos: {
        clientId: sale.clientId,
        ...(sale.shiftId ? { shiftId: oid(sale.shiftId) } : {}),
        cashierId: cashier,
        payments: sale.payments,
        change: t.change,
        ...(sale.customer ? { customer: sale.customer } : {}),
        stockConflict: false,
        soldAt: sale.createdAt,
      },
      stockRestored: false,
      createdAt: sale.createdAt,
    });
    order = doc.toObject() as OrderLean;
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      const dup = await Order.findOne({ storeId, 'pos.clientId': sale.clientId }).select('number').lean();
      return { clientId: sale.clientId, status: 'duplicate', ...(dup ? { orderId: String(dup._id), number: dup.number } : {}) };
    }
    throw err;
  }

  let conflict = false;
  for (const l of order.items) {
    try {
      if (await decrementWithClamp(storeId, l.productId, l.variantId, l.qty, String(order._id), req.user!.id)) conflict = true;
    } catch (err) {
      conflict = true;
      logger.error({ err, order: order.number }, 'POS stock decrement failed');
    }
  }
  if (conflict) await Order.updateOne({ _id: order._id, storeId }, { $set: { 'pos.stockConflict': true } });
  return { clientId: sale.clientId, status: 'created', orderId: String(order._id), number: order.number, stockConflict: conflict };
}

/** Batch sync: each sale is independent and idempotent by clientId; one bad sale never blocks the rest. */
export async function syncSales(req: Request, sales: PosSaleInput[]): Promise<PosSaleResult[]> {
  const results: PosSaleResult[] = [];
  for (const s of sales) {
    try {
      results.push(await syncOne(req, s));
    } catch (err) {
      logger.error({ err }, 'POS sale sync failed');
      results.push({ clientId: s.clientId, status: 'error', error: { code: 'SYNC_FAILED', message: 'Could not save this sale. It will be retried.' } });
    }
  }
  const created = results.filter((r) => r.status === 'created');
  if (created.length) await audit({ action: 'store.pos_synced', targetType: 'Store', targetId: req.store!._id, meta: { created: created.length, conflicts: created.filter((r) => r.stockConflict).length }, req });
  return results;
}

// ---------------- receipts ----------------
const receiptSig = (orderId: string) => createHmac('sha256', env.DATA_KEY).update(`receipt:${orderId}`).digest('base64url').slice(0, 32);
export const receiptToken = (orderId: string) => `${orderId}.${receiptSig(orderId)}`;

export function verifyReceiptToken(token: string): string | null {
  const [id, sig] = token.split('.');
  if (!id || !sig || !Types.ObjectId.isValid(id) || !/^[a-f0-9]{24}$/i.test(id)) return null;
  return safeEqual(sig, receiptSig(id)) ? id : null;
}

function receiptBody(o: OrderLean) {
  return {
    receiptNumber: o.invoiceNumber,
    number: o.number,
    at: (o.pos?.soldAt ?? o.createdAt).toISOString(),
    items: o.items.map((i) => ({ title: i.title, options: i.options, qty: i.qty, price: i.price, lineTotal: i.lineTotal })),
    subtotal: o.subtotal,
    discount: o.discounts?.store ?? 0,
    total: o.total,
    payments: (o.pos?.payments ?? []).map((p) => ({ method: p.method, amount: p.amount })),
    change: o.pos?.change ?? 0,
  };
}

export async function receipt(storeId: Types.ObjectId, orderId: string) {
  const o = await Order.findOne({ _id: oid(orderId), storeId, channel: 'pos' }).lean<OrderLean>();
  if (!o) throw notFound('Sale');
  const store = await Store.findById(storeId).select('name address contact.phone').lean();
  const token = receiptToken(String(o._id));
  const url = `${env.CLIENT_URL.replace(/\/$/, '')}/r/${token}`;
  return {
    store: { name: store?.name ?? '', address: [store?.address?.line1, store?.address?.area, store?.address?.city].filter(Boolean).join(', '), phone: store?.contact?.phone ?? null },
    ...receiptBody(o),
    customer: o.pos?.customer ?? null,
    stockConflict: !!o.pos?.stockConflict,
    digitalReceiptUrl: url,
    qr: await QRCode.toDataURL(url, { margin: 1, width: 200 }),
  };
}

/** Public digital receipt: store name + items/totals only (no customer data). */
export async function publicReceipt(token: string) {
  const id = verifyReceiptToken(token);
  if (!id) throw notFound('Receipt');
  const o = await Order.findOne({ _id: oid(id), channel: 'pos' }).lean<OrderLean>();
  if (!o) throw notFound('Receipt');
  const store = await Store.findById(o.storeId).select('name slug').lean();
  return { store: { name: store?.name ?? '', slug: store?.slug ?? '' }, ...receiptBody(o) };
}

// ---------------- shifts ----------------
const shiftDTO = (s: PosShiftLean) => ({
  id: String(s._id),
  status: s.status,
  openedBy: String(s.openedBy),
  openingCash: s.openingCash,
  openedAt: s.openedAt.toISOString(),
  closedAt: s.closedAt?.toISOString() ?? null,
  countedCash: s.countedCash ?? null,
  expectedCash: s.expectedCash ?? null,
  variance: s.variance ?? null,
  cashSales: s.cashSales ?? null,
  cashRefunds: s.cashRefunds ?? null,
  salesCount: s.salesCount ?? null,
  salesTotal: s.salesTotal ?? null,
});

export async function openShift(req: Request, openingCash: number) {
  try {
    const s = await PosShift.create({ storeId: req.store!._id, openedBy: oid(req.user!.id), openingCash, openedAt: new Date() });
    await audit({ action: 'store.pos_shift_opened', targetType: 'PosShift', targetId: s._id, meta: { openingCash }, req });
    return shiftDTO(s.toObject() as PosShiftLean);
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw new AppError(409, 'SHIFT_OPEN', 'You already have an open shift');
    throw err;
  }
}

/** Pure: expected cash in the drawer and the variance against the count (unit-tested). */
export function shiftVariance(openingCash: number, cashSales: number, cashRefunds: number, countedCash: number) {
  const expectedCash = openingCash + cashSales - cashRefunds;
  return { expectedCash, variance: countedCash - expectedCash };
}

export async function closeShift(req: Request, id: string, countedCash: number, note?: string) {
  const storeId = req.store!._id;
  const shift = await PosShift.findOne({ _id: oid(id), storeId }).lean<PosShiftLean>();
  if (!shift) throw notFound('Shift');
  if (shift.status !== 'open') throw new AppError(409, 'SHIFT_CLOSED', 'This shift is already closed');
  const sales = await Order.find({ storeId, channel: 'pos', 'pos.shiftId': shift._id }).select('status total pos.payments pos.change').lean();
  let cashSales = 0;
  let cashRefunds = 0;
  for (const o of sales) {
    const cash = (o.pos?.payments ?? []).filter((p) => p.method === 'cash').reduce((a, p) => a + p.amount, 0) - (o.pos?.change ?? 0);
    cashSales += cash;
    if (o.status === 'refunded' || o.status === 'returned') cashRefunds += cash;
  }
  const { expectedCash, variance } = shiftVariance(shift.openingCash, cashSales, cashRefunds, countedCash);
  const updated = await PosShift.findOneAndUpdate(
    { _id: shift._id, storeId, status: 'open' },
    {
      $set: {
        status: 'closed',
        closedAt: new Date(),
        closedBy: oid(req.user!.id),
        countedCash,
        expectedCash,
        variance,
        cashSales,
        cashRefunds,
        salesCount: sales.length,
        salesTotal: sales.reduce((a, o) => a + o.total, 0),
        ...(note ? { note } : {}),
      },
    },
    { new: true },
  ).lean<PosShiftLean>();
  if (!updated) throw new AppError(409, 'SHIFT_CLOSED', 'This shift is already closed');
  await audit({ action: 'store.pos_shift_closed', targetType: 'PosShift', targetId: shift._id, meta: { expectedCash, countedCash, variance }, req });
  return shiftDTO(updated);
}

export async function listShifts(storeId: Types.ObjectId) {
  const rows = await PosShift.find({ storeId }).sort({ openedAt: -1 }).limit(100).lean<PosShiftLean[]>();
  return rows.map(shiftDTO);
}

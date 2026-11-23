import { applyBps, formatMoney, type CheckoutDTO, type CheckoutInput, type CheckoutPreviewInput, type PaymentMethod } from '@souqly/shared';
import type { Request } from 'express';
import { Types } from 'mongoose';
import { AppError } from '../../lib/AppError';
import { logger } from '../../lib/logger';
import { getEmail } from '../../services/email';
import { newOrderForSeller, orderPlaced } from '../../services/email/templates';
import { getPaymentProvider } from '../../services/payment';
import { emitToStore } from '../../socket';
import { Address } from '../account/address.model';
import { audit } from '../audit/audit.service';
import { getOrCreateCart } from '../cart/cart.service';
import { buildQuote, type Quote } from '../cart/quote';
import { resolveCommissionBps } from '../commission/commission.model';
import { FlashSale } from '../catalog/marketing.models';
import { Order, type IAddressSnapshot, type OrderLean } from '../orders/order.model';
import { invoiceNumberFor, newCheckoutNumber, orderSuffix, storeInfoMap, toOrderDTO } from '../orders/order.service';
import { releaseAll, reserveAll, writeStockMovement, type StockLine } from '../orders/stock';
import { Store } from '../stores/store.model';
import { User } from '../users/user.model';
import { releaseVoucherUse, takeVoucherUse } from '../vouchers/voucher.service';
import { VoucherUsage } from '../vouchers/voucher.model';
import { Checkout, type CheckoutDoc } from './checkout.model';

const oid = (s: string | Types.ObjectId) => new Types.ObjectId(String(s));

async function loadAddress(userId: string, addressId: string): Promise<IAddressSnapshot> {
  const a = await Address.findOne({ _id: oid(addressId), userId: oid(userId) }).lean();
  if (!a) throw new AppError(404, 'ADDRESS_NOT_FOUND', 'Address not found');
  return {
    fullName: a.fullName,
    phone: a.phone,
    country: a.country ?? 'PK',
    city: a.city,
    ...(a.area ? { area: a.area } : {}),
    line1: a.line1,
    ...(a.line2 ? { line2: a.line2 } : {}),
    ...(a.postalCode ? { postalCode: a.postalCode } : {}),
  };
}

/** Only COD is placeable until a gateway is integrated; others → 400 PAYMENT_NOT_CONFIGURED. */
function assertPaymentMethod(method: PaymentMethod) {
  if (method === 'wallet') throw new AppError(400, 'PAYMENT_NOT_CONFIGURED', 'Wallet payments are coming soon');
  getPaymentProvider(method);
  if (method !== 'cod') throw new AppError(400, 'PAYMENT_NOT_CONFIGURED', 'Online payments are coming soon. Please choose Cash on Delivery.');
}

async function quoteFor(userId: string, city: string) {
  const cart = await getOrCreateCart(userId);
  const quote = await buildQuote(cart, userId, city);
  if (cart.isModified()) await cart.save();
  return { cart, quote };
}

function assertQuotePlaceable(quote: Quote, method: PaymentMethod) {
  if (quote.selectedIssues.length) {
    throw new AppError(409, 'CART_CHANGED', 'Some items in your cart changed. Please review your cart.', { issues: quote.selectedIssues });
  }
  if (!quote.lines.length) throw new AppError(400, 'CART_EMPTY', 'Select at least one item to check out');
  if (method === 'cod') {
    const noCod = quote.lines.filter((l) => l.product.cod === false);
    if (noCod.length) throw new AppError(400, 'COD_NOT_AVAILABLE', 'Cash on Delivery is not available for some items', { itemIds: noCod.map((l) => String(l.item._id)) });
  }
}

export async function preview(userId: string, input: CheckoutPreviewInput) {
  const address = await loadAddress(userId, input.addressId);
  const { quote } = await quoteFor(userId, address.city);
  return {
    ...quote.dto,
    address,
    paymentMethod: input.paymentMethod,
    paymentAvailable: input.paymentMethod === 'cod',
    stores: quote.pricing.stores.map((s) => ({
      storeId: s.storeId,
      itemsSubtotal: s.itemsSubtotal,
      storeDiscount: s.storeDiscount,
      platformDiscount: s.platformDiscount,
      shippingBase: s.shippingBase,
      shippingFee: s.shippingFee,
      total: s.total,
      note: input.notes?.[s.storeId] ?? null,
    })),
    canPlace: quote.selectedIssues.length === 0 && quote.lines.length > 0,
  };
}

async function checkoutDTO(c: CheckoutDoc | (CheckoutDoc & { toObject?: never })): Promise<CheckoutDTO> {
  const orders = await Order.find({ checkoutId: c._id }).sort({ number: 1 }).select('+deliveryOtpEnc').lean<OrderLean[]>();
  const stores = await storeInfoMap(orders.map((o) => o.storeId));
  return {
    id: String(c._id),
    number: c.number,
    paymentMethod: c.paymentMethod,
    paymentStatus: c.paymentStatus,
    totals: { itemsSubtotal: c.totals.itemsSubtotal, shippingTotal: c.totals.shippingTotal, discountTotal: c.totals.discountTotal, total: c.totals.total },
    orders: orders.map((o) => toOrderDTO(o, stores.get(String(o.storeId)), 'buyer', { checkoutNumber: c.number })),
    createdAt: c.createdAt.toISOString(),
  };
}

/** Returns the existing checkout for an idempotency key (waits briefly while the first attempt is still processing). */
async function existingCheckout(userId: string, key: string): Promise<CheckoutDTO | null> {
  for (let i = 0; i < 50; i++) {
    const c = await Checkout.findOne({ userId: oid(userId), idempotencyKey: key });
    if (!c) return null;
    if (c.state === 'completed') return checkoutDTO(c);
    if (c.state === 'failed') throw new AppError(409, 'CHECKOUT_FAILED', 'This checkout attempt failed. Start a new checkout.');
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new AppError(409, 'CHECKOUT_IN_PROGRESS', 'This checkout is still being processed');
}

export async function placeCheckout(req: Request, input: CheckoutInput): Promise<{ checkout: CheckoutDTO; created: boolean }> {
  const userId = req.user!.id;
  const prior = await existingCheckout(userId, input.idempotencyKey);
  if (prior) return { checkout: prior, created: false };

  assertPaymentMethod(input.paymentMethod);
  const address = await loadAddress(userId, input.addressId);
  const { cart, quote } = await quoteFor(userId, address.city);
  assertQuotePlaceable(quote, input.paymentMethod);

  // Claim the idempotency key first: a concurrent retry hits the unique index and waits for us.
  const now = new Date();
  let checkout: CheckoutDoc;
  try {
    checkout = await Checkout.create({
      userId: oid(userId),
      number: newCheckoutNumber(now),
      idempotencyKey: input.idempotencyKey,
      state: 'processing',
      addressSnapshot: address,
      paymentMethod: input.paymentMethod,
      paymentStatus: 'pending',
      totals: {
        itemsSubtotal: quote.pricing.itemsSubtotal,
        shippingTotal: quote.pricing.shippingTotal,
        discountTotal: quote.pricing.discountTotal,
        coins: quote.pricing.coins,
        total: quote.pricing.total,
      },
      vouchers: { ...(quote.pricing.platformVoucher?.valid ? { platform: quote.pricing.platformVoucher.code } : {}), store: quote.pricing.stores.filter((s) => s.storeVoucher?.valid).map((s) => s.storeVoucher!.code) },
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      const again = await existingCheckout(userId, input.idempotencyKey);
      if (again) return { checkout: again, created: false };
    }
    throw err;
  }

  // 1) Voucher global usage (atomic against usageLimit).
  const usedVouchers: { id: Types.ObjectId; storeId: Types.ObjectId | null; discount: number }[] = [];
  const fail = async (status: number, code: string, message: string, details?: unknown): Promise<never> => {
    await Promise.all(usedVouchers.map((v) => releaseVoucherUse(v.id)));
    // Free the idempotency key so the buyer can retry after reviewing the cart.
    await Checkout.deleteOne({ _id: checkout._id });
    throw new AppError(status, code, message, details);
  };
  const voucherCandidates: { id: Types.ObjectId; storeId: Types.ObjectId | null; discount: number }[] = [];
  if (quote.pricing.platformVoucher?.valid && quote.vouchers.platform) {
    voucherCandidates.push({ id: quote.vouchers.platform._id, storeId: null, discount: quote.pricing.platformVoucher.discount });
  }
  for (const s of quote.pricing.stores) {
    const v = quote.vouchers.store[s.storeId];
    if (s.storeVoucher?.valid && v) voucherCandidates.push({ id: v._id, storeId: v.storeId, discount: s.storeVoucher.discount });
  }
  for (const v of voucherCandidates) {
    if (await takeVoucherUse(v.id)) usedVouchers.push(v);
    else await fail(409, 'VOUCHER_EXHAUSTED', 'A voucher in your cart has just run out. Please review your cart.');
  }

  // 2) Stock: all lines or nothing.
  const stockLines: StockLine[] = quote.lines.map((l) => ({ productId: l.product._id, variantId: l.variant._id, storeId: l.store._id, qty: l.item.qty, title: l.product.title }));
  const reserved = await reserveAll(stockLines);
  if (!reserved.ok) {
    await fail(409, 'STOCK_CHANGED', 'Some items just sold out or have fewer units left. Please review your cart.', {
      items: reserved.failed.map((f) => ({ productId: String(f.productId), variantId: String(f.variantId), title: f.title, requested: f.qty })),
    });
  }

  // 3) One order per store.
  let orders: OrderLean[] = [];
  try {
    const buyerNotes = input.notes ?? {};
    const docs = [];
    let i = 0;
    for (const sp of quote.pricing.stores) {
      const storeLines = quote.lines.filter((l) => String(l.store._id) === sp.storeId);
      const pricedById = new Map(sp.lines.map((pl) => [pl.id, pl]));
      const bps = await resolveCommissionBps(sp.storeId, storeLines.map((l) => l.product.categoryPath ?? []));
      // Commission on what the seller actually sells: items minus the store's own discount (platform-funded discounts do not reduce it).
      const commissionBase = Math.max(0, sp.itemsSubtotal - sp.storeDiscount);
      const commissionAmount = applyBps(commissionBase, bps);
      const number = `${checkout.number}-${orderSuffix(i++)}`;
      docs.push({
        storeId: oid(sp.storeId),
        checkoutId: checkout._id,
        number,
        buyerId: oid(userId),
        items: storeLines.map((l) => {
          const pl = pricedById.get(String(l.item._id))!;
          return {
            productId: l.product._id,
            variantId: l.variant._id,
            title: l.product.title,
            slug: l.product.slug,
            image: l.variant.images?.[0] ?? l.product.images?.[0]?.url,
            options: (l.variant.options as Record<string, string>) ?? {},
            sku: l.variant.sku,
            categoryPath: l.product.categoryPath ?? [],
            price: pl.unitPrice,
            qty: pl.qty,
            lineTotal: pl.lineTotal,
          };
        }),
        subtotal: sp.itemsSubtotal,
        shippingFee: sp.shippingFee,
        discounts: { store: sp.storeDiscount, platform: sp.platformDiscount, shipping: sp.shippingDiscount },
        vouchers: {
          ...(sp.storeVoucher?.valid ? { store: sp.storeVoucher.code } : {}),
          ...(quote.pricing.platformVoucher?.valid ? { platform: quote.pricing.platformVoucher.code } : {}),
        },
        total: sp.total,
        commission: { bps, amount: commissionAmount },
        // Seller receives items - own discount + shipping - commission (platform discounts are platform-funded).
        sellerNet: commissionBase + sp.shippingFee - commissionAmount,
        status: input.paymentMethod === 'cod' ? 'placed' : 'pending_payment',
        timeline: [{ status: input.paymentMethod === 'cod' ? 'placed' : 'pending_payment', at: now, by: oid(userId), actor: 'buyer' }],
        payment: { method: input.paymentMethod, status: 'pending' },
        shippingAddress: address,
        ...(buyerNotes[sp.storeId] ? { buyerNote: buyerNotes[sp.storeId] } : {}),
        sellerNotes: [],
        channel: 'online',
        invoiceNumber: invoiceNumberFor(number),
      });
    }
    orders = (await Order.insertMany(docs)).map((d) => d.toObject() as OrderLean);
  } catch (err) {
    logger.error({ err, checkout: checkout.number }, 'Order creation failed; rolling back stock');
    await Order.deleteMany({ checkoutId: checkout._id });
    await releaseAll(stockLines);
    await fail(500, 'CHECKOUT_FAILED', 'We could not place your order. Nothing was charged; please try again.');
  }

  checkout.orderIds = orders.map((o) => o._id);
  checkout.state = 'completed';
  await checkout.save();

  // 4) Post-commit bookkeeping (best effort, never fails the checkout).
  await postCheckout(req, checkout, orders, quote, cart, usedVouchers, stockLines);
  return { checkout: await checkoutDTO(checkout), created: true };
}

async function postCheckout(
  req: Request,
  checkout: CheckoutDoc,
  orders: OrderLean[],
  quote: Quote,
  cart: Awaited<ReturnType<typeof getOrCreateCart>>,
  usedVouchers: { id: Types.ObjectId; storeId: Types.ObjectId | null; discount: number }[],
  stockLines: StockLine[],
) {
  const userId = req.user!.id;
  try {
    // Remove purchased lines and the used vouchers from the cart.
    const bought = new Set(quote.lines.map((l) => String(l.item._id)));
    const fresh = await getOrCreateCart(userId);
    for (const id of bought) fresh.items.id(id)?.deleteOne();
    if (checkout.vouchers.platform) fresh.vouchers.platform = null;
    fresh.vouchers.store = fresh.vouchers.store.filter((s) => !orders.some((o) => String(o.storeId) === String(s.storeId)));
    await fresh.save();
    void cart;

    if (usedVouchers.length) {
      await VoucherUsage.insertMany(
        usedVouchers.map((v) => ({ voucherId: v.id, userId: oid(userId), checkoutId: checkout._id, storeId: v.storeId, discount: v.discount })),
      );
    }

    // Flash sale sold counters.
    for (const l of quote.lines.filter((x) => x.flash)) {
      await FlashSale.updateOne(
        { isActive: true, startsAt: { $lte: new Date() }, endsAt: { $gt: new Date() }, items: { $elemMatch: { productId: l.product._id } } },
        { $inc: { 'items.$.sold': l.item.qty } },
      );
    }

    for (const o of orders) {
      for (const it of o.items) {
        await writeStockMovement({ storeId: o.storeId, productId: it.productId, variantId: it.variantId, delta: -it.qty, reason: 'sale', ref: { type: 'order', id: o._id }, actorId: oid(userId) });
      }
    }
    void stockLines;

    await audit({ action: 'checkout.placed', req, targetType: 'Checkout', targetId: checkout._id, meta: { number: checkout.number, orders: orders.map((o) => o.number), total: checkout.totals.total } });

    // Live alerts + emails.
    const stores = await Store.find({ _id: { $in: orders.map((o) => o.storeId) } }).select('name contact').lean();
    const buyer = await User.findById(userId).select('name email').lean();
    for (const o of orders) {
      emitToStore(String(o.storeId), 'order:new', { id: String(o._id), number: o.number, total: o.total, itemCount: o.items.reduce((a, i) => a + i.qty, 0), createdAt: o.createdAt });
      const s = stores.find((x) => String(x._id) === String(o.storeId));
      if (s?.contact?.email) {
        void getEmail()
          .send({ to: s.contact.email, ...newOrderForSeller(s.name, o.number, formatMoney(o.total), o.items.reduce((a, i) => a + i.qty, 0)) })
          .catch((err) => logger.warn({ err }, 'Seller order email failed'));
      }
    }
    if (buyer?.email) {
      void getEmail()
        .send({ to: buyer.email, ...orderPlaced(buyer.name, checkout.number, formatMoney(checkout.totals.total)) })
        .catch((err) => logger.warn({ err }, 'Order email failed'));
    }
  } catch (err) {
    logger.error({ err, checkout: checkout.number }, 'Post-checkout bookkeeping failed');
  }
}

export async function getCheckout(userId: string, number: string): Promise<CheckoutDTO> {
  const c = await Checkout.findOne({ number, userId: oid(userId), state: 'completed' });
  if (!c) throw new AppError(404, 'NOT_FOUND', 'Checkout not found');
  return checkoutDTO(c);
}

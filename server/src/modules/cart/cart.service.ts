import { CART_MAX_ITEMS, CART_MAX_QTY, type CartAddItemInput, type CartDTO, type CartMergeInput, type CartUpdateItemInput } from '@souqly/shared';
import { Types } from 'mongoose';
import { AppError, notFound } from '../../lib/AppError';
import { Address } from '../account/address.model';
import { Product } from '../catalog/product.model';
import { Store } from '../stores/store.model';
import { findUsableVoucher } from '../vouchers/voucher.service';
import { track } from '../analytics/analytics.service';
import { Cart, type CartDoc } from './cart.model';
import { buildQuote, isStoreOpen, type StoreLean } from './quote';

const oid = (s: string | Types.ObjectId) => new Types.ObjectId(String(s));

export async function getOrCreateCart(userId: string): Promise<CartDoc> {
  return Cart.findOneAndUpdate(
    { userId: oid(userId) },
    { $setOnInsert: { userId: oid(userId), items: [], vouchers: { platform: null, store: [] } } },
    { upsert: true, new: true },
  ) as Promise<CartDoc>;
}

/** City of the buyer's default address (cart shipping estimate). */
async function defaultCity(userId: string): Promise<string | undefined> {
  const a = await Address.findOne({ userId: oid(userId) }).sort({ isDefault: -1, createdAt: -1 }).select('city').lean();
  return a?.city;
}

export async function cartView(userId: string, cart?: CartDoc): Promise<CartDTO> {
  const c = cart ?? (await getOrCreateCart(userId));
  const quote = await buildQuote(c, userId, await defaultCity(userId));
  if (c.isModified()) await c.save();
  return quote.dto;
}

/** Validates that a variant can be added and returns the product's store and current stock. */
async function loadPurchasable(productId: string, variantId: string) {
  const p = await Product.findOne({ _id: oid(productId), status: 'published', deletedAt: { $exists: false } })
    .select('storeId variants')
    .lean();
  const v = p?.variants.find((x) => String(x._id) === variantId && x.isActive);
  if (!p || !v) throw notFound('Product');
  const store = await Store.findById(p.storeId).select('status holidayMode').lean<StoreLean>();
  if (!isStoreOpen(store ?? undefined)) throw new AppError(400, 'STORE_UNAVAILABLE', 'This store is not accepting orders right now');
  return { storeId: p.storeId, available: Math.max(0, v.stock - (v.reserved ?? 0)), price: v.price };
}

function addOrIncrement(cart: CartDoc, input: { productId: string; variantId: string; qty: number }, storeId: Types.ObjectId, available: number, mode: 'add' | 'max') {
  const existing = cart.items.find((i) => String(i.variantId) === input.variantId && String(i.productId) === input.productId);
  const cap = Math.min(available, CART_MAX_QTY);
  if (existing) {
    const next = mode === 'add' ? existing.qty + input.qty : Math.max(existing.qty, input.qty);
    existing.qty = Math.max(1, Math.min(next, cap));
    existing.savedForLater = false;
    existing.selected = true;
    return;
  }
  if (cart.items.length >= CART_MAX_ITEMS) throw new AppError(400, 'CART_FULL', `Your cart can hold up to ${CART_MAX_ITEMS} items`);
  cart.items.push({ productId: oid(input.productId), variantId: oid(input.variantId), storeId, qty: Math.max(1, Math.min(input.qty, cap)), selected: true, savedForLater: false, seenPrice: 0 });
}

export async function addItem(userId: string, input: CartAddItemInput): Promise<CartDTO> {
  const { storeId, available } = await loadPurchasable(input.productId, input.variantId);
  if (available <= 0) throw new AppError(409, 'OUT_OF_STOCK', 'This item is out of stock');
  const cart = await getOrCreateCart(userId);
  addOrIncrement(cart, input, storeId, available, 'add');
  track('add_to_cart', storeId, { productId: input.productId }); // Phase 10 funnel counter
  return cartView(userId, cart);
}

export async function updateItem(userId: string, itemId: string, input: CartUpdateItemInput): Promise<CartDTO> {
  const cart = await getOrCreateCart(userId);
  const item = cart.items.id(itemId);
  if (!item) throw notFound('Cart item');
  if (input.qty !== undefined) item.qty = input.qty; // clamped to stock by the quote
  if (input.selected !== undefined) item.selected = input.selected;
  if (input.savedForLater !== undefined) {
    item.savedForLater = input.savedForLater;
    if (input.savedForLater) item.selected = false;
    else item.selected = true;
  }
  return cartView(userId, cart);
}

export async function removeItem(userId: string, itemId: string): Promise<CartDTO> {
  const cart = await getOrCreateCart(userId);
  const item = cart.items.id(itemId);
  if (!item) throw notFound('Cart item');
  item.deleteOne();
  return cartView(userId, cart);
}

export async function selectAll(userId: string, selected: boolean): Promise<CartDTO> {
  const cart = await getOrCreateCart(userId);
  for (const i of cart.items) if (!i.savedForLater) i.selected = selected;
  return cartView(userId, cart);
}

/** (De)selects every non-saved item of one store's group (unknown store → no-op). */
export async function selectStore(userId: string, storeId: string, selected: boolean): Promise<CartDTO> {
  const cart = await getOrCreateCart(userId);
  for (const i of cart.items) if (!i.savedForLater && String(i.storeId) === storeId) i.selected = selected;
  return cartView(userId, cart);
}

/** Merges a guest (localStorage) cart: unknown / unavailable lines are skipped, qty = max(existing, guest). */
export async function merge(userId: string, input: CartMergeInput): Promise<CartDTO> {
  const cart = await getOrCreateCart(userId);
  for (const it of input.items) {
    try {
      const { storeId, available } = await loadPurchasable(it.productId, it.variantId);
      if (available <= 0) continue;
      addOrIncrement(cart, it, storeId, available, 'max');
    } catch (err) {
      if (err instanceof AppError && err.code === 'CART_FULL') break;
      // Skip lines that no longer exist / are unavailable.
    }
  }
  return cartView(userId, cart);
}

export async function applyVoucher(userId: string, code: string): Promise<CartDTO> {
  const cart = await getOrCreateCart(userId);
  const storeIds = [...new Set(cart.items.filter((i) => !i.savedForLater).map((i) => String(i.storeId)))];
  if (!storeIds.length) throw new AppError(400, 'CART_EMPTY', 'Add items to your cart before applying a voucher');
  const v = await findUsableVoucher(code, userId, storeIds);
  if (v.scope === 'platform') cart.vouchers.platform = v.code;
  else {
    cart.vouchers.store = cart.vouchers.store.filter((s) => String(s.storeId) !== String(v.storeId));
    cart.vouchers.store.push({ storeId: v.storeId!, code: v.code });
  }
  const quote = await buildQuote(cart, userId, await defaultCity(userId));
  const result = v.scope === 'platform' ? quote.pricing.platformVoucher : quote.pricing.stores.find((s) => s.storeId === String(v.storeId))?.storeVoucher;
  if (!result?.valid) {
    const minSpend = v.minSpend;
    throw new AppError(
      400,
      result?.reason === 'MIN_SPEND' ? 'VOUCHER_MIN_SPEND' : 'VOUCHER_NOT_ELIGIBLE',
      result?.reason === 'MIN_SPEND' ? 'Your selected items do not reach the minimum spend for this voucher' : 'None of your selected items qualify for this voucher',
      result?.reason === 'MIN_SPEND' ? { minSpend } : undefined,
    );
  }
  await cart.save();
  return quote.dto;
}

export async function removeVoucher(userId: string, code: string): Promise<CartDTO> {
  const cart = await getOrCreateCart(userId);
  if (cart.vouchers.platform === code) cart.vouchers.platform = null;
  cart.vouchers.store = cart.vouchers.store.filter((s) => s.code !== code);
  return cartView(userId, cart);
}

/** Adds lines to the cart (reorder). Returns how many were added. */
export async function addMany(userId: string, items: { productId: string; variantId: string; qty: number }[]): Promise<{ added: number; skipped: number; cart: CartDTO }> {
  const cart = await getOrCreateCart(userId);
  let added = 0;
  for (const it of items) {
    try {
      const { storeId, available } = await loadPurchasable(it.productId, it.variantId);
      if (available <= 0) continue;
      addOrIncrement(cart, it, storeId, available, 'add');
      added++;
    } catch {
      // unavailable → skipped
    }
  }
  return { added, skipped: items.length - added, cart: await cartView(userId, cart) };
}

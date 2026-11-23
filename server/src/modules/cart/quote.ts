import { CART_MAX_QTY, type CartDTO, type CartGroupDTO, type CartIssueType, type CartItemDTO } from '@souqly/shared';
import { Types } from 'mongoose';
import { FlashSale } from '../catalog/marketing.models';
import { Product, type IVariant, type ProductLean } from '../catalog/product.model';
import { Store, type IStore } from '../stores/store.model';
import { computePricing, unitPriceFor, type PricingLine, type PricingResult } from '../orders/pricing';
import { loadCartVouchers, toPricingVoucher } from '../vouchers/voucher.service';
import type { IVoucher } from '../vouchers/voucher.model';
import type { CartDoc, ICartItem } from './cart.model';
import { shippingRulesFor } from './shipping';

export type StoreLean = IStore & { _id: Types.ObjectId };
type VoucherLean = IVoucher & { _id: Types.ObjectId };

export interface QuoteLine {
  item: ICartItem;
  product: ProductLean;
  variant: IVariant;
  store: StoreLean;
  unitPrice: number;
  flash: boolean;
}

export interface Quote {
  dto: CartDTO;
  pricing: PricingResult;
  /** Lines that are selected, not saved for later and purchasable. */
  lines: QuoteLine[];
  stores: Map<string, StoreLean>;
  vouchers: { platform?: VoucherLean; store: Record<string, VoucherLean> };
  /** Issues on lines that are selected for checkout. */
  selectedIssues: CartDTO['issues'];
}

const PRODUCT_FIELDS =
  '_id storeId title slug images variants status deletedAt categoryPath wholesaleTiers freeShipping options cod';

function firstImage(p: ProductLean, v?: IVariant): string | undefined {
  return v?.images?.[0] ?? p.images?.[0]?.url;
}

/** Active flash prices keyed `${productId}:${variantId}` (or `${productId}:*` for all variants). */
async function activeFlashPrices(productIds: Types.ObjectId[]): Promise<Map<string, number>> {
  const now = new Date();
  const sales = await FlashSale.find({ isActive: true, startsAt: { $lte: now }, endsAt: { $gt: now }, 'items.productId': { $in: productIds } }).lean();
  const out = new Map<string, number>();
  const ids = new Set(productIds.map(String));
  for (const s of sales) {
    for (const it of s.items) {
      if (!ids.has(String(it.productId)) || it.sold >= it.quantityLimit) continue;
      const key = `${it.productId}:${it.variantId ? String(it.variantId) : '*'}`;
      out.set(key, Math.min(out.get(key) ?? Infinity, it.flashPrice));
    }
  }
  return out;
}

export function isStoreOpen(store: StoreLean | undefined): boolean {
  if (!store || store.status !== 'approved') return false;
  const h = store.holidayMode;
  return !(h?.enabled && (!h.until || h.until.getTime() > Date.now()));
}

/**
 * Re-prices the cart from the database (never trusts stored prices). Detects issues, clamps
 * quantities to available stock and records the last-seen price. Mutates `cart` (caller saves).
 */
export async function buildQuote(cart: CartDoc, userId: string, buyerCity?: string | null): Promise<Quote> {
  const productIds = [...new Set(cart.items.map((i) => String(i.productId)))].map((id) => new Types.ObjectId(id));
  const [products, flash] = await Promise.all([
    Product.find({ _id: { $in: productIds } }).select(PRODUCT_FIELDS).lean<ProductLean[]>(),
    activeFlashPrices(productIds),
  ]);
  const productMap = new Map(products.map((p) => [String(p._id), p]));
  const storeIds = [...new Set([...cart.items.map((i) => String(i.storeId)), ...products.map((p) => String(p.storeId))])];
  const storeDocs = await Store.find({ _id: { $in: storeIds.map((s) => new Types.ObjectId(s)) } })
    .select('name slug logo isMall status address holidayMode')
    .lean<StoreLean[]>();
  const stores = new Map(storeDocs.map((s) => [String(s._id), s]));

  const issues: CartDTO['issues'] = [];
  const selectedIssues: CartDTO['issues'] = [];
  const lines: QuoteLine[] = [];
  const dtoByItem = new Map<string, CartItemDTO>();

  for (const item of cart.items) {
    const p = productMap.get(String(item.productId));
    const v = p?.variants.find((x) => String(x._id) === String(item.variantId));
    const store = p ? stores.get(String(p.storeId)) : undefined;
    const itemId = String(item._id);
    const active = item.selected && !item.savedForLater;
    const flag = (type: CartIssueType, details?: Record<string, unknown>) => {
      const issue = { itemId, type, ...(details ? { details } : {}) };
      issues.push(issue);
      if (active) selectedIssues.push(issue);
    };

    let available = 0;
    let purchasable = false;
    if (!p || !v || p.status !== 'published' || p.deletedAt || !v.isActive || !isStoreOpen(store)) {
      flag('unavailable');
    } else {
      available = Math.max(0, v.stock - (v.reserved ?? 0));
      if (available <= 0) flag('out_of_stock');
      else {
        purchasable = true;
        const cap = Math.min(available, CART_MAX_QTY);
        if (item.qty > cap) {
          flag('qty_reduced', { from: item.qty, to: cap });
          item.qty = cap;
        }
      }
    }

    const flashPrice = p && v ? (flash.get(`${p._id}:${v._id}`) ?? flash.get(`${p._id}:*`)) : undefined;
    const listPrice = v ? (flashPrice !== undefined && flashPrice < v.price ? flashPrice : v.price) : 0;
    if (v && purchasable && item.seenPrice > 0 && item.seenPrice !== listPrice) {
      flag('price_changed', { from: item.seenPrice, to: listPrice });
    }
    if (v) item.seenPrice = listPrice;

    const { unitPrice } = v
      ? unitPriceFor({ basePrice: v.price, flashPrice, wholesaleTiers: p?.wholesaleTiers, qty: item.qty })
      : { unitPrice: 0 };
    dtoByItem.set(itemId, {
      id: itemId,
      productId: String(item.productId),
      variantId: String(item.variantId),
      slug: p?.slug ?? '',
      title: p?.title ?? 'Unavailable product',
      ...(p ? { image: firstImage(p, v) } : {}),
      options: (v?.options as Record<string, string>) ?? {},
      price: unitPrice,
      ...(v?.compareAtPrice && v.compareAtPrice > unitPrice ? { compareAtPrice: v.compareAtPrice } : unitPrice < (v?.price ?? 0) ? { compareAtPrice: v!.price } : {}),
      qty: item.qty,
      maxQty: purchasable ? Math.min(available, CART_MAX_QTY) : 0,
      selected: item.selected,
      savedForLater: item.savedForLater,
      lineTotal: unitPrice * item.qty,
      ...(flashPrice !== undefined && v && flashPrice < v.price ? { flash: true } : {}),
    });
    if (purchasable && active && p && v && store) {
      lines.push({ item, product: p, variant: v, store, unitPrice, flash: flashPrice !== undefined && flashPrice < v.price });
    }
  }

  // Vouchers (stale codes are dropped from the cart).
  const lineStoreIds = [...new Set(lines.map((l) => String(l.store._id)))];
  const vouchers = await loadCartVouchers(userId, cart.vouchers, [...new Set(cart.items.map((i) => String(i.storeId)))]);
  if (vouchers.dropped.length) {
    if (cart.vouchers.platform && vouchers.dropped.includes(cart.vouchers.platform)) cart.vouchers.platform = null;
    cart.vouchers.store = cart.vouchers.store.filter((s) => vouchers.store[String(s.storeId)]);
  }

  const shipping = await shippingRulesFor(lineStoreIds.map((id) => stores.get(id)!), buyerCity);
  const pricingLines: PricingLine[] = lines.map((l) => {
    const fp = flash.get(`${l.product._id}:${l.variant._id}`) ?? flash.get(`${l.product._id}:*`);
    return {
      id: String(l.item._id),
      storeId: String(l.store._id),
      productId: String(l.product._id),
      categoryPath: (l.product.categoryPath ?? []).map(String),
      basePrice: l.variant.price,
      ...(l.variant.compareAtPrice ? { compareAtPrice: l.variant.compareAtPrice } : {}),
      ...(fp !== undefined ? { flashPrice: fp } : {}),
      ...(l.product.wholesaleTiers?.length ? { wholesaleTiers: l.product.wholesaleTiers } : {}),
      qty: l.item.qty,
      freeShipping: !!l.product.freeShipping,
    };
  });
  const storeVouchers = Object.fromEntries(Object.entries(vouchers.store).map(([sid, v]) => [sid, toPricingVoucher(v)]));
  const pricing = computePricing({
    lines: pricingLines,
    shipping,
    storeVouchers,
    ...(vouchers.platform ? { platformVoucher: toPricingVoucher(vouchers.platform) } : {}),
  });

  // DTO: groups for every store with non-saved items (in cart order), saved list separately.
  const groupOrder: string[] = [];
  const groupItems = new Map<string, CartItemDTO[]>();
  const saved: CartItemDTO[] = [];
  for (const item of cart.items) {
    const dto = dtoByItem.get(String(item._id))!;
    if (item.savedForLater) {
      saved.push(dto);
      continue;
    }
    const sid = String(item.storeId);
    if (!groupItems.has(sid)) {
      groupOrder.push(sid);
      groupItems.set(sid, []);
    }
    groupItems.get(sid)!.push(dto);
  }
  const groups: CartGroupDTO[] = groupOrder.map((sid) => {
    const s = stores.get(sid);
    const sp = pricing.stores.find((x) => x.storeId === sid);
    const sv = vouchers.store[sid];
    return {
      store: { id: sid, slug: s?.slug ?? '', name: s?.name ?? 'Store', ...(s?.logo?.url ? { logo: s.logo.url } : {}), isMall: !!s?.isMall },
      items: groupItems.get(sid)!,
      subtotal: sp?.itemsSubtotal ?? 0,
      shipping: sp?.shippingFee ?? 0,
      storeDiscount: sp?.storeDiscount ?? 0,
      platformDiscount: sp?.platformDiscount ?? 0,
      total: sp?.total ?? 0,
      ...(sv
        ? {
            storeVoucher: sp?.storeVoucher
              ? { ...sp.storeVoucher }
              : { code: sv.code, scope: 'store' as const, type: sv.type, discount: 0, valid: false, reason: 'NOT_ELIGIBLE' },
          }
        : {}),
    };
  });

  const dto: CartDTO = {
    groups,
    savedForLater: saved,
    summary: {
      itemsSubtotal: pricing.itemsSubtotal,
      shippingTotal: pricing.shippingTotal,
      discountTotal: pricing.discountTotal,
      ...(pricing.platformVoucher
        ? { platformVoucher: { ...pricing.platformVoucher } }
        : vouchers.platform
          ? { platformVoucher: { code: vouchers.platform.code, scope: 'platform' as const, type: vouchers.platform.type, discount: 0, valid: false, reason: 'NOT_ELIGIBLE' } }
          : {}),
      coins: pricing.coins,
      total: pricing.total,
      savings: pricing.savings,
      selectedCount: lines.reduce((a, l) => a + l.item.qty, 0),
    },
    freeShippingProgress: pricing.stores
      .filter((s) => s.freeShippingThreshold && (s.freeShippingRemaining ?? 0) > 0 && s.shippingFee > 0)
      .map((s) => ({ storeId: s.storeId, remaining: s.freeShippingRemaining!, threshold: s.freeShippingThreshold! })),
    issues,
  };

  return { dto, pricing, lines, stores, vouchers, selectedIssues };
}

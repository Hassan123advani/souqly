import { TRACKING_STEPS, applyBps, type OrderStatus, type PaymentMethod } from '@souqly/shared';
import { Types } from 'mongoose';
import { encrypt, sha256 } from '../lib/crypto';
import { Address, type AddressDoc } from '../modules/account/address.model';
import { Category } from '../modules/catalog/category.model';
import { Product, type ProductLean } from '../modules/catalog/product.model';
import { Checkout } from '../modules/checkout/checkout.model';
import { CommissionRule } from '../modules/commission/commission.model';
import { Order, type IOrderTimeline } from '../modules/orders/order.model';
import { invoiceNumberFor, orderSuffix } from '../modules/orders/order.service';
import { Store } from '../modules/stores/store.model';
import { User } from '../modules/users/user.model';
import { Voucher } from '../modules/vouchers/voucher.model';

const DAY = 86_400_000;
const HOUR = 3_600_000;

/** Path of statuses an order went through to reach `status` (consistent with ORDER_TRANSITIONS). */
export function statusPath(status: OrderStatus): OrderStatus[] {
  const upTo = (s: OrderStatus) => TRACKING_STEPS.slice(0, TRACKING_STEPS.indexOf(s) + 1);
  switch (status) {
    case 'pending_payment':
      return ['pending_payment'];
    case 'cancelled':
      return ['placed', 'cancelled'];
    case 'failed_delivery':
      return [...upTo('out_for_delivery'), 'failed_delivery'];
    case 'return_requested':
      return [...upTo('delivered'), 'return_requested'];
    case 'returned':
      return [...upTo('delivered'), 'return_requested', 'returned'];
    case 'refunded':
      return [...upTo('delivered'), 'return_requested', 'returned', 'refunded'];
    default:
      return upTo(status);
  }
}

const DEMO_ORDER_PLAN: { status: OrderStatus; daysAgo: number; method?: PaymentMethod }[] = [
  { status: 'pending_payment', daysAgo: 0.1, method: 'jazzcash' },
  { status: 'placed', daysAgo: 0.2 },
  { status: 'confirmed', daysAgo: 1 },
  { status: 'packed', daysAgo: 1.5 },
  { status: 'shipped', daysAgo: 2 },
  { status: 'out_for_delivery', daysAgo: 3 },
  { status: 'delivered', daysAgo: 6 },
  { status: 'cancelled', daysAgo: 4 },
  { status: 'failed_delivery', daysAgo: 5 },
  { status: 'return_requested', daysAgo: 9 },
  { status: 'returned', daysAgo: 14 },
  { status: 'refunded', daysAgo: 20 },
  { status: 'delivered', daysAgo: 25 },
  { status: 'placed', daysAgo: 0.05 },
];

/** Vouchers + commission rules (idempotent upserts). */
async function seedPromotions(): Promise<{ vouchers: number; rules: number }> {
  const now = Date.now();
  const startsAt = new Date(now - DAY);
  const endsAt = new Date(now + 365 * DAY);
  const stores = await Store.find({ slug: { $in: ['noor-textiles', 'volt-bazaar'] } }).select('slug').lean();
  const bySlug = new Map(stores.map((s) => [s.slug, s._id]));
  const vouchers = [
    { code: 'SOUQLY10', scope: 'platform' as const, storeId: null, title: '10% off (max Rs. 500) on Rs. 1,500+', type: 'percent' as const, value: 1000, minSpend: 150_000, maxDiscount: 50_000, usageLimit: 10_000, perUserLimit: 3 },
    { code: 'FREESHIP', scope: 'platform' as const, storeId: null, title: 'Free shipping on Rs. 999+', type: 'free_shipping' as const, value: 0, minSpend: 99_900, maxDiscount: 50_000, usageLimit: 0, perUserLimit: 5 },
    ...(bySlug.get('noor-textiles')
      ? [{ code: 'NOOR200', scope: 'store' as const, storeId: bySlug.get('noor-textiles')!, title: 'Rs. 200 off on Rs. 2,000+', type: 'fixed' as const, value: 20_000, minSpend: 200_000, usageLimit: 500, perUserLimit: 1 }]
      : []),
    ...(bySlug.get('volt-bazaar')
      ? [{ code: 'VOLT5', scope: 'store' as const, storeId: bySlug.get('volt-bazaar')!, title: '5% off electronics (max Rs. 1,000)', type: 'percent' as const, value: 500, minSpend: 300_000, maxDiscount: 100_000, usageLimit: 300, perUserLimit: 2 }]
      : []),
  ];
  for (const v of vouchers) {
    await Voucher.updateOne(
      { scope: v.scope, storeId: v.storeId, code: v.code },
      { $setOnInsert: { ...v, startsAt, endsAt, usedCount: 0, isActive: true, demo: true } },
      { upsert: true },
    );
  }
  await CommissionRule.updateOne({ scope: 'global', storeId: null, categoryId: null }, { $setOnInsert: { bps: 1000, isActive: true, demo: true } }, { upsert: true });
  let rules = 1;
  const electronics = await Category.findOne({ slug: 'electronic-devices' }).select('_id').lean();
  if (electronics) {
    await CommissionRule.updateOne({ scope: 'category', storeId: null, categoryId: electronics._id }, { $setOnInsert: { bps: 600, isActive: true, demo: true } }, { upsert: true });
    rules++;
  }
  return { vouchers: vouchers.length, rules };
}

/** Demo checkouts / orders in every status for the demo buyers (stock is not touched). */
async function seedDemoOrders(): Promise<number> {
  if (await Order.exists({ demo: true })) return 0;
  const buyers = await User.find({ demo: true, email: { $in: ['ayesha@demo.souqly.pk', 'bilal@demo.souqly.pk', 'sana@demo.souqly.pk'] } }).sort({ email: 1 }).lean();
  if (!buyers.length) return 0;
  // Flagship demo sellers first (their owners are the documented demo logins), then the rest.
  const preferred = ['noor-textiles', 'volt-bazaar', 'mehrab-menswear', 'dastarkhwan-kitchen'];
  const open = await Store.find({ demo: true, status: 'approved', 'holidayMode.enabled': { $ne: true } }).sort({ slug: 1 }).select('_id slug name address').lean();
  const rank = (slug: string) => (preferred.includes(slug) ? preferred.indexOf(slug) : preferred.length);
  const stores = open.sort((a, b) => rank(a.slug) - rank(b.slug)).slice(0, 6);
  const products = await Product.find({ demo: true, status: 'published', storeId: { $in: stores.map((s) => s._id) }, totalStock: { $gt: 0 } })
    .sort({ slug: 1 })
    .select('storeId title slug images variants categoryPath')
    .lean<ProductLean[]>();
  const byStore = new Map<string, ProductLean[]>();
  for (const p of products) {
    const list = byStore.get(String(p.storeId)) ?? [];
    list.push(p);
    byStore.set(String(p.storeId), list);
  }
  const usable = stores.filter((s) => (byStore.get(String(s._id))?.length ?? 0) >= 2);
  if (!usable.length) return 0;

  const cities = ['Lahore', 'Karachi', 'Islamabad'];
  const addresses = new Map<string, AddressDoc>();
  for (const [i, b] of buyers.entries()) {
    const existing = await Address.findOne({ userId: b._id });
    addresses.set(
      String(b._id),
      existing ??
        (await Address.create({ userId: b._id, label: 'Home', fullName: b.name, phone: b.phone ?? '+923001110000', city: cities[i % 3]!, area: 'Model Town', line1: `House ${12 + i}, Street ${3 + i}`, isDefault: true, demo: true })),
    );
  }

  const electronics = await Category.findOne({ slug: 'electronic-devices' }).select('_id').lean();
  let created = 0;
  let seq = 0;
  for (const [i, plan] of DEMO_ORDER_PLAN.entries()) {
    const buyer = buyers[i % buyers.length]!;
    const address = addresses.get(String(buyer._id))!;
    const placedAt = new Date(Date.now() - plan.daysAgo * DAY);
    // Every other checkout spans two stores (split order), the rest one store.
    const storeCount = i % 2 === 0 && usable.length > 1 ? 2 : 1;
    const chosen = Array.from({ length: storeCount }, (_, k) => usable[(i + k) % usable.length]!);
    const d = placedAt.toISOString().slice(2, 10).replace(/-/g, '');
    const checkoutNumber = `SQ-${d}-D${String(++seq).padStart(4, '0')}`;
    const method = plan.method ?? 'cod';
    const path = statusPath(plan.status);
    const checkoutId = new Types.ObjectId();
    const orderDocs = chosen.map((store, k) => {
      const list = byStore.get(String(store._id))!;
      const picks = [list[(i + k) % list.length]!, ...(i % 3 === 0 ? [list[(i + k + 1) % list.length]!] : [])];
      const items = picks.map((p, j) => {
        const v = p.variants.find((x) => x.isActive) ?? p.variants[0]!;
        const qty = 1 + ((i + j) % 2);
        return { productId: p._id, variantId: v._id, title: p.title, slug: p.slug, image: v.images?.[0] ?? p.images?.[0]?.url, options: (v.options as Record<string, string>) ?? {}, sku: v.sku, categoryPath: p.categoryPath ?? [], price: v.price, qty, lineTotal: v.price * qty };
      });
      const subtotal = items.reduce((a, it) => a + it.lineTotal, 0);
      const shippingFee = subtotal >= 300_000 ? 0 : store.address?.city === address.city ? 15_000 : 25_000;
      const isElectronics = !!electronics && items.every((it) => it.categoryPath.some((c) => String(c) === String(electronics._id)));
      const bps = isElectronics ? 600 : 1000;
      const commission = applyBps(subtotal, bps);
      const timeline: IOrderTimeline[] = path.map((status, n) => ({
        status,
        at: new Date(placedAt.getTime() + n * 7 * HOUR),
        by: null as Types.ObjectId | null,
        actor: n === 0 || status === 'return_requested' || status === 'cancelled' ? 'buyer' : ['out_for_delivery', 'delivered', 'failed_delivery'].includes(status) ? 'rider' : 'seller',
        ...(status === 'cancelled' ? { note: 'Ordered the wrong size' } : status === 'failed_delivery' ? { note: 'Buyer not reachable' } : status === 'return_requested' ? { note: 'Colour differs from photos' } : {}),
      }));
      for (const t of timeline) if (t.actor === 'buyer') t.by = buyer._id;
      const orderId = new Types.ObjectId();
      const number = `${checkoutNumber}-${orderSuffix(k)}`;
      const shipped = path.includes('shipped');
      const otp = String(1000 + ((i * 7919 + k * 104729) % 9000));
      const paid = path.includes('delivered') && method === 'cod';
      return {
        _id: orderId,
        storeId: store._id,
        checkoutId,
        number,
        buyerId: buyer._id,
        items,
        subtotal,
        shippingFee,
        discounts: { store: 0, platform: 0, shipping: 0 },
        vouchers: {},
        total: subtotal + shippingFee,
        commission: { bps, amount: commission },
        sellerNet: subtotal + shippingFee - commission,
        status: plan.status,
        timeline,
        payment: { method, status: plan.status === 'refunded' ? 'refunded' : paid ? 'paid' : 'pending' },
        shippingAddress: { fullName: address.fullName, phone: address.phone, country: address.country ?? 'PK', city: address.city, area: address.area, line1: address.line1 },
        ...(i % 4 === 1 ? { buyerNote: 'Please call before delivery' } : {}),
        sellerNotes: [],
        channel: 'online' as const,
        ...(plan.status === 'cancelled' ? { cancel: { by: buyer._id, actor: 'buyer', reason: 'Ordered the wrong size', at: timeline[timeline.length - 1]!.at } } : {}),
        ...(shipped ? { tracking: { courier: ['TCS', 'Leopards', 'M&P'][i % 3]!, trackingNumber: `DEMO${100000 + i * 10 + k}` }, deliveryOtpHash: sha256(`${orderId}:${otp}`), deliveryOtpEnc: encrypt(otp) } : {}),
        invoiceNumber: invoiceNumberFor(number),
        stockRestored: plan.status === 'cancelled',
        demo: true,
        createdAt: placedAt,
        updatedAt: timeline[timeline.length - 1]!.at,
      };
    });
    const ids = orderDocs.map((o) => o._id);
    await Order.collection.insertMany(orderDocs as never[]);
    await Checkout.collection.insertOne({
      _id: checkoutId,
      userId: buyer._id,
      number: checkoutNumber,
      idempotencyKey: `demo-${checkoutNumber}`,
      state: 'completed',
      addressSnapshot: orderDocs[0]!.shippingAddress,
      paymentMethod: method,
      paymentStatus: orderDocs[0]!.payment.status,
      totals: {
        itemsSubtotal: orderDocs.reduce((a, o) => a + o.subtotal, 0),
        shippingTotal: orderDocs.reduce((a, o) => a + o.shippingFee, 0),
        discountTotal: 0,
        coins: 0,
        total: orderDocs.reduce((a, o) => a + o.total, 0),
      },
      vouchers: { store: [] },
      orderIds: ids,
      demo: true,
      createdAt: placedAt,
      updatedAt: placedAt,
    } as never);
    created += orderDocs.length;
  }
  return created;
}

/** Phase 6 seed: vouchers, commission rules and demo orders (idempotent). */
export async function seedOrders(): Promise<{ vouchers: number; rules: number; orders: number }> {
  const promos = await seedPromotions();
  const orders = await seedDemoOrders();
  return { ...promos, orders };
}

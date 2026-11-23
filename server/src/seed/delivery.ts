import type { ReturnStatus } from '@souqly/shared';
import { Types } from 'mongoose';
import { DEFAULT_RIDER_FEE, DeliverySession, RiderCashEntry, RiderLocation } from '../modules/delivery/delivery.model';
import { Notification } from '../modules/notifications/notification.model';
import { Order, type OrderLean } from '../modules/orders/order.model';
import { Dispute, ReturnRequest } from '../modules/returns/return.model';
import { Store } from '../modules/stores/store.model';
import { StoreMember } from '../modules/stores/storeMember.model';
import { User } from '../modules/users/user.model';
import { generateReferralCode } from '../modules/users/user.service';
import { credit } from '../modules/wallet/wallet.service';

export const DEMO_RIDERS = [
  { name: 'Imran Rider', email: 'rider1@demo.souqly.pk', phone: '+923001110101' },
  { name: 'Kashif Rider', email: 'rider2@demo.souqly.pk', phone: '+923001110102' },
];
const RIDER_STORES = ['noor-textiles', 'volt-bazaar'];
/** Lahore (Model Town) — default demo destination when a seeded address has no pin. */
const LAHORE = { lat: 31.4834, lng: 74.3264 };
const HOUR = 3600_000;

async function ensureRiders(passwordHash: string): Promise<Types.ObjectId[]> {
  const ids: Types.ObjectId[] = [];
  for (const r of DEMO_RIDERS) {
    const u = await User.findOne({ email: r.email }).select('_id').lean();
    if (u) {
      ids.push(u._id);
      continue;
    }
    const created = await User.create({ ...r, passwordHash, emailVerified: true, phoneVerified: true, referralCode: await generateReferralCode(), demo: true });
    ids.push(created._id);
  }
  return ids;
}

/**
 * Phase 7 demo data: 2 riders (RIDER members of noor-textiles + volt-bazaar), rider assignment on
 * shipped / out-for-delivery / failed / delivered demo orders of those stores with a short GPS trail,
 * a few buyer notifications and one return request per status. Idempotent.
 */
export async function seedDelivery(passwordHash: string): Promise<{ riders: number; assigned: number; notifications: number; returns: number }> {
  const riders = await ensureRiders(passwordHash);
  const stores = await Store.find({ slug: { $in: RIDER_STORES } }).select('_id slug').lean();
  for (const s of stores) {
    for (const userId of riders) {
      await StoreMember.updateOne({ storeId: s._id, userId }, { $setOnInsert: { role: 'RIDER', status: 'active', demo: true } }, { upsert: true });
    }
  }

  // ---- assign riders + sessions + trail ----
  let assigned = 0;
  const orders = await Order.find({ demo: true, storeId: { $in: stores.map((s) => s._id) }, status: { $in: ['shipped', 'out_for_delivery', 'failed_delivery', 'delivered'] }, riderId: null }).lean<OrderLean[]>();
  for (const [i, o] of orders.entries()) {
    const riderId = riders[i % riders.length]!;
    const dest = o.shippingAddress?.location ?? { lat: LAHORE.lat + (i % 5) * 0.004, lng: LAHORE.lng + (i % 3) * 0.004 };
    await Order.updateOne({ _id: o._id }, { $set: { riderId, 'shippingAddress.location': dest } });
    assigned++;
    if (o.status === 'shipped') continue;
    const at = o.updatedAt ?? new Date();
    if (o.status === 'out_for_delivery') {
      // Fresh trail so live tracking shows something (rider ~2 km away, approaching).
      const now = Date.now();
      const trail = [0.02, 0.014, 0.008].map((d, k) => ({ lat: dest.lat + d, lng: dest.lng - d / 2, at: new Date(now - (3 - k) * 60_000) }));
      await RiderLocation.insertMany(trail.map((p) => ({ ...p, orderId: o._id, riderId, storeId: o.storeId, demo: true })));
      await DeliverySession.updateOne(
        { orderId: o._id },
        { $setOnInsert: { storeId: o.storeId, riderId, status: 'active', attempts: 1, startedAt: new Date(now - 20 * 60_000), lastLocation: trail[2], demo: true } },
        { upsert: true },
      );
    } else if (o.status === 'failed_delivery') {
      await DeliverySession.updateOne(
        { orderId: o._id },
        { $setOnInsert: { storeId: o.storeId, riderId, status: 'failed', attempts: 1, startedAt: new Date(at.getTime() - HOUR), endedAt: at, failReason: 'customer_unavailable', demo: true } },
        { upsert: true },
      );
    } else {
      const cod = o.payment.method === 'cod' ? o.total : 0;
      await DeliverySession.updateOne(
        { orderId: o._id },
        { $setOnInsert: { storeId: o.storeId, riderId, status: 'delivered', attempts: 1, startedAt: new Date(at.getTime() - HOUR), endedAt: at, codCollected: cod, earning: DEFAULT_RIDER_FEE, demo: true } },
        { upsert: true },
      );
      if (cod > 0) {
        await RiderCashEntry.updateOne(
          { orderId: o._id, type: 'collected' },
          { $setOnInsert: { storeId: o.storeId, riderId, amount: cod, orderNumber: o.number, by: riderId, demo: true, createdAt: at } },
          { upsert: true },
        );
      }
    }
  }

  // ---- buyer notifications ----
  let notifications = 0;
  if (!(await Notification.exists({ demo: true }))) {
    const recent = await Order.find({ demo: true }).sort({ updatedAt: -1 }).limit(12).select('buyerId number status updatedAt').lean();
    const docs: Record<string, unknown>[] = recent.map((o) => ({
      userId: o.buyerId,
      type: `order.${o.status}`,
      title: `Order ${o.status.replace(/_/g, ' ')}`,
      body: `Your order ${o.number} is now ${o.status.replace(/_/g, ' ')}.`,
      link: `/account/orders/${o.number}`,
      data: { number: o.number, status: o.status },
      readAt: o.status === 'delivered' ? o.updatedAt : null,
      createdAt: o.updatedAt,
      demo: true,
    }));
    const buyers = [...new Set(recent.map((o) => String(o.buyerId)))];
    for (const b of buyers) {
      docs.push({ userId: new Types.ObjectId(b), type: 'promo.flash_sale', title: 'Flash sale tonight', body: 'Up to 40% off electronics from 9 PM. Set a reminder!', link: '/flash-sale', readAt: null, createdAt: new Date(), demo: true });
    }
    notifications = (await Notification.insertMany(docs)).length;
  }

  // ---- one return request per status ----
  let returns = 0;
  if (!(await ReturnRequest.exists({ demo: true }))) {
    const byStatus = async (status: string) => Order.find({ demo: true, status }).sort({ createdAt: -1 }).lean<OrderLean[]>();
    const [rr, ret, ref, del] = await Promise.all([byStatus('return_requested'), byStatus('returned'), byStatus('refunded'), byStatus('delivered')]);
    const plan: { order?: OrderLean; status: ReturnStatus }[] = [
      { order: rr[0], status: 'requested' },
      { order: rr[1], status: 'approved' },
      { order: ret[0], status: 'received' },
      { order: ref[0], status: 'refunded' },
      { order: del[0], status: 'rejected' },
      { order: del[1], status: 'escalated' },
    ];
    const FLOW: ReturnStatus[] = ['requested', 'approved', 'received', 'refunded'];
    for (const p of plan) {
      const o = p.order;
      if (!o) continue;
      const it = o.items[0]!;
      const created = new Date(new Date(o.updatedAt).getTime() - 2 * HOUR);
      const steps: ReturnStatus[] = p.status === 'rejected' ? ['requested', 'rejected'] : p.status === 'escalated' ? ['requested', 'rejected', 'escalated'] : FLOW.slice(0, FLOW.indexOf(p.status) + 1);
      const amount = Math.min(o.total, it.price * it.qty);
      const r = await ReturnRequest.create({
        orderId: o._id,
        orderNumber: o.number,
        storeId: o.storeId,
        buyerId: o.buyerId,
        items: [{ variantId: it.variantId, productId: it.productId, title: it.title, ...(it.image ? { image: it.image } : {}), options: it.options ?? {}, price: it.price, qty: it.qty, reason: 'not_as_described' }],
        reason: 'not_as_described',
        description: 'The colour is quite different from the product photos.',
        photos: [],
        status: p.status,
        refund: { method: 'wallet', amount, ...(p.status === 'refunded' ? { at: o.updatedAt } : {}) },
        timeline: steps.map((s, k) => ({ status: s, at: new Date(created.getTime() + k * 20 * 60_000), by: k === 0 || s === 'escalated' ? o.buyerId : null, actor: k === 0 || s === 'escalated' ? 'buyer' : 'seller' })),
        ...(steps.includes('rejected') ? { sellerNote: 'Item shows signs of use.' } : {}),
        restocked: p.status === 'received' || p.status === 'refunded',
        demo: true,
      });
      if (p.status === 'escalated') {
        const d = await Dispute.create({ returnId: r._id, orderId: o._id, buyerId: o.buyerId, storeId: o.storeId, status: 'open', messages: [{ by: o.buyerId, actor: 'buyer', text: 'The item was unused, please review.', at: new Date() }], demo: true });
        await ReturnRequest.updateOne({ _id: r._id }, { $set: { disputeId: d._id } });
      }
      if (p.status === 'refunded' && amount > 0) {
        await credit({ userId: o.buyerId, amount, reason: 'refund', ref: `refund:${String(r._id)}`, meta: { orderNumber: o.number }, demo: true });
      }
      returns++;
    }
  }
  return { riders: riders.length, assigned, notifications, returns };
}

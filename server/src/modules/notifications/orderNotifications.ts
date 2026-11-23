import { PERMISSIONS, formatMoney, type OrderStatus } from '@souqly/shared';
import type { Types } from 'mongoose';
import { logger } from '../../lib/logger';
import { resolveMemberPermissions } from '../../middleware/storeContext';
import { StoreMember } from '../stores/storeMember.model';
import { notify, notifyMany } from './notification.service';

type OrderLike = { _id: Types.ObjectId; number: string; buyerId: Types.ObjectId; storeId: Types.ObjectId; total: number; items: { qty: number }[]; riderId?: Types.ObjectId | null };

const BUYER_COPY: Partial<Record<OrderStatus, { title: string; body: string }>> = {
  placed: { title: 'Order placed', body: 'We received your order {n}. The seller will confirm it soon.' },
  confirmed: { title: 'Order confirmed', body: 'The seller confirmed your order {n}.' },
  packed: { title: 'Order packed', body: 'Your order {n} is packed and ready to ship.' },
  shipped: { title: 'Order shipped', body: 'Your order {n} is on its way. Keep your delivery code ready.' },
  out_for_delivery: { title: 'Out for delivery', body: 'Your rider is on the way with order {n}. Track it live.' },
  delivered: { title: 'Order delivered', body: 'Your order {n} was delivered. Enjoy, and leave a review!' },
  failed_delivery: { title: 'Delivery attempt failed', body: 'We could not deliver order {n}. The seller will contact you.' },
  cancelled: { title: 'Order cancelled', body: 'Your order {n} was cancelled.' },
  return_requested: { title: 'Return requested', body: 'Your return request for order {n} was sent to the seller.' },
  returned: { title: 'Return received', body: 'The seller received your returned items for order {n}.' },
  refunded: { title: 'Refund issued', body: 'Your refund for order {n} was added to your Souqly wallet.' },
};

/** Active members of the store who can see orders (owner, managers, ORDERS staff, matching custom roles). */
export async function storeOrderRecipients(storeId: Types.ObjectId): Promise<Types.ObjectId[]> {
  const members = await StoreMember.find({ storeId, status: 'active' });
  const out: Types.ObjectId[] = [];
  for (const m of members) {
    if (m.role === 'OWNER' || (await resolveMemberPermissions(m)).includes(PERMISSIONS.STORE_ORDERS_VIEW)) out.push(m.userId);
  }
  return out;
}

/** Buyer in-app + push notification for an order status change. Email/SMS are sent by order.service. Never throws. */
export async function notifyOrderStatus(order: OrderLike, to: OrderStatus): Promise<void> {
  try {
    const copy = BUYER_COPY[to];
    if (copy) {
      await notify({
        userId: order.buyerId,
        type: `order.${to}`,
        title: copy.title,
        body: copy.body.replace('{n}', order.number),
        link: `/account/orders/${order.number}`,
        data: { orderId: String(order._id), number: order.number, status: to },
      });
    }
    if (to === 'shipped' && order.riderId) {
      await notify({ userId: order.riderId, type: 'rider.assigned', title: 'New delivery', body: `Order ${order.number} is ready for you to deliver.`, link: `/rider/deliveries/${String(order._id)}`, data: { orderId: String(order._id) } });
    }
    if (to === 'return_requested' || to === 'cancelled') {
      const recipients = await storeOrderRecipients(order.storeId);
      await notifyMany(recipients, {
        type: `store.order.${to}`,
        title: to === 'cancelled' ? 'Order cancelled' : 'Return requested',
        body: `Order ${order.number} ${to === 'cancelled' ? 'was cancelled' : 'has a new return request'}.`,
        link: `/seller/orders/${String(order._id)}`,
        data: { orderId: String(order._id), number: order.number },
      });
    }
  } catch (err) {
    logger.warn({ err, order: order.number }, 'Order notification failed');
  }
}

/** New-order alert for the store owner + order staff. Never throws. */
export async function notifyNewOrder(order: OrderLike): Promise<void> {
  try {
    const recipients = await storeOrderRecipients(order.storeId);
    const items = order.items.reduce((a, i) => a + i.qty, 0);
    await notifyMany(recipients, {
      type: 'order.new',
      title: 'New order',
      body: `Order ${order.number}: ${items} item${items === 1 ? '' : 's'}, ${formatMoney(order.total)}.`,
      link: `/seller/orders/${String(order._id)}`,
      data: { orderId: String(order._id), number: order.number },
    });
  } catch (err) {
    logger.warn({ err, order: order.number }, 'New order notification failed');
  }
}

import { beforeAll, describe, expect, it } from 'vitest';
import { api, newAgent as newAnon, signupAgent } from '../../test/helpers';
import { placeOrder } from '../delivery/deliveryTestFixtures';
import { addStaff, makeBuyer, makeItem, makeSeller } from '../orders/orderTestFixtures';
import { User } from '../users/user.model';
import { Notification } from './notification.model';
import { notify } from './notification.service';

let a: Awaited<ReturnType<typeof signupAgent>>;
let b: Awaited<ReturnType<typeof signupAgent>>;
let aId: string;

beforeAll(async () => {
  a = await signupAgent({ name: 'Notif A' });
  b = await signupAgent({ name: 'Notif B' });
  aId = String((await User.findOne({ email: a.email }))!._id);
});

const waitFor = async (fn: () => Promise<unknown>, ms = 3000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
};

describe('notifications inbox', () => {
  it('lists, counts, reads, deletes — only the owner can touch a notification', async () => {
    const n1 = await notify({ userId: aId, type: 'test.one', title: 'One', body: 'First', link: '/x' });
    await notify({ userId: aId, type: 'test.two', title: 'Two', body: 'Second', link: 'https://evil.example' });
    expect(n1).toBeTruthy();

    let res = await a.agent.get(api('/notifications?limit=1'));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('Two');
    expect(res.body.data[0].link).toBeUndefined(); // absolute links are dropped
    res = await a.agent.get(api(`/notifications?limit=1&cursor=${res.body.meta.nextCursor}`));
    expect(res.body.data[0].title).toBe('One');
    expect((await a.agent.get(api('/notifications/unread-count'))).body.data.count).toBe(2);

    // Isolation: B sees nothing and cannot read / delete A's rows.
    expect((await b.agent.get(api('/notifications'))).body.data).toHaveLength(0);
    expect((await b.agent.post(api(`/notifications/${n1!.id}/read`))).status).toBe(404);
    expect((await b.agent.delete(api(`/notifications/${n1!.id}`))).status).toBe(404);
    expect((await a.agent.get(api('/notifications/unread-count'))).body.data.count).toBe(2);

    res = await a.agent.post(api(`/notifications/${n1!.id}/read`));
    expect(res.body.data.readAt).toBeTruthy();
    expect((await a.agent.get(api('/notifications?unread=1'))).body.data.map((n: { title: string }) => n.title)).toEqual(['Two']);
    expect((await a.agent.post(api('/notifications/read-all'))).body.data.updated).toBe(1);
    expect((await a.agent.get(api('/notifications/unread-count'))).body.data.count).toBe(0);
    expect((await a.agent.delete(api(`/notifications/${n1!.id}`))).status).toBe(204);
    expect((await a.agent.get(api('/notifications'))).body.data).toHaveLength(1);
    expect((await a.agent.get(api('/notifications/bad-id/read'))).status).toBe(404);
    expect((await newAnon().get(api('/notifications'))).status).toBe(401);
  });

  it('stores push subscriptions per user', async () => {
    const sub = { endpoint: 'https://push.example.com/abc', keys: { p256dh: 'p256dh-key-value', auth: 'auth-key-1' } };
    expect((await a.agent.post(api('/push/subscriptions')).send(sub)).status).toBe(201);
    expect((await a.agent.post(api('/push/subscriptions')).send({ ...sub, endpoint: 'http://insecure' })).status).toBe(400);
    expect((await a.agent.delete(api('/push/subscriptions')).send({ endpoint: sub.endpoint })).status).toBe(204);
  });

  it('order placed → buyer notified; store owner + ORDERS staff get order.new, other staff do not', async () => {
    const buyer = await makeBuyer();
    const seller = await makeSeller('Notif Store');
    const ordersStaff = await addStaff(seller.store._id, 'ORDERS');
    const marketing = await addStaff(seller.store._id, 'MARKETING');
    const item = await makeItem(seller.store._id, 50_000, 5);
    const o = await placeOrder(buyer, item);
    expect(await waitFor(() => Notification.exists({ userId: buyer.user._id, type: 'order.placed' }))).toBe(true);
    expect(await waitFor(() => Notification.exists({ userId: seller.owner._id, type: 'order.new' }))).toBe(true);
    expect(await waitFor(() => Notification.exists({ userId: ordersStaff.user._id, type: 'order.new' }))).toBe(true);
    expect(await Notification.exists({ userId: marketing.user._id, type: 'order.new' })).toBeFalsy();
    expect((await seller.agent.post(api(`/seller/orders/${o.orderId}/status`)).send({ to: 'confirmed' })).status).toBe(200);
    expect(await waitFor(() => Notification.exists({ userId: buyer.user._id, type: 'order.confirmed' }))).toBe(true);
  });

  it('declares the 180-day TTL index', async () => {
    const idx = await Notification.collection.indexes();
    expect(idx.find((i) => i.key.createdAt === 1 && Object.keys(i.key).length === 1)?.expireAfterSeconds).toBe(180 * 24 * 3600);
  });
});


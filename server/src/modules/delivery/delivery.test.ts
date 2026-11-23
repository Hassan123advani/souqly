import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { closeSocket, initSocket } from '../../socket';
import { getCookie, loginAgent } from '../../test/helpers';
import { Notification } from '../notifications/notification.model';
import { Order } from '../orders/order.model';
import { addStaff, api, makeBuyer, makeItem, makeSeller } from '../orders/orderTestFixtures';
import { User } from '../users/user.model';
import { DeliverySession, RiderCashEntry, RiderLocation } from './delivery.model';
import { shippedOrder } from './deliveryTestFixtures';
import { deliveryConfig } from './rider.service';

let buyer: Awaited<ReturnType<typeof makeBuyer>>;
let buyer2: Awaited<ReturnType<typeof makeBuyer>>;
let sellerA: Awaited<ReturnType<typeof makeSeller>>;
let sellerB: Awaited<ReturnType<typeof makeSeller>>;
let riderA: Awaited<ReturnType<typeof addStaff>>;
let riderA2: Awaited<ReturnType<typeof addStaff>>;
let item: Awaited<ReturnType<typeof makeItem>>;
let admin: Awaited<ReturnType<typeof makeBuyer>>;

beforeAll(async () => {
  buyer = await makeBuyer();
  buyer2 = await makeBuyer();
  admin = await makeBuyer();
  await User.updateOne({ _id: admin.user._id }, { $set: { platformRole: 'SUPPORT' } });
  sellerA = await makeSeller('Rider Store A');
  sellerB = await makeSeller('Rider Store B');
  riderA = await addStaff(sellerA.store._id, 'RIDER');
  riderA2 = await addStaff(sellerA.store._id, 'RIDER');
  await User.updateOne({ _id: riderA.user._id }, { $set: { phone: '+923001112233' } });
  item = await makeItem(sellerA.store._id, 150_000, 100);
});

describe('rider deliveries', () => {
  it('a rider sees only deliveries assigned to them; non-riders are refused; the OTP is never exposed', async () => {
    const o = await shippedOrder(buyer, sellerA, item, String(riderA.member._id));
    let res = await riderA.agent.get(api('/rider/deliveries?date=upcoming'));
    expect(res.status).toBe(200);
    expect(res.body.data.map((d: { number: string }) => d.number)).toContain(o.number);
    res = await riderA.agent.get(api(`/rider/deliveries/${o.orderId}`));
    expect(res.body.data).toMatchObject({ number: o.number, status: 'shipped', codAmount: o.total, itemsCount: 1, canStart: true });
    expect(res.body.data.buyer.phone).toBe('+923001234567');
    expect(JSON.stringify(res.body.data)).not.toMatch(new RegExp(`"${o.otp}"|otp"`, 'i'));

    expect((await riderA2.agent.get(api('/rider/deliveries?date=upcoming'))).body.data).toHaveLength(0);
    expect((await riderA2.agent.get(api(`/rider/deliveries/${o.orderId}`))).status).toBe(404);
    expect((await riderA2.agent.post(api(`/rider/deliveries/${o.orderId}/start`))).status).toBe(404);
    expect((await buyer.agent.get(api('/rider/me'))).status).toBe(403);
    expect((await sellerB.agent.get(api(`/rider/deliveries/${o.orderId}`))).status).toBe(404); // owners can deliver for their own store only
    // Assigned-rider notification.
    expect(await Notification.exists({ userId: riderA.user._id, type: 'rider.assigned' })).toBeTruthy();
  });

  it('locations are accepted only from the assigned rider while out for delivery, rate limited', async () => {
    const o = await shippedOrder(buyer, sellerA, item, String(riderA.member._id));
    const loc = { lat: 31.52, lng: 74.35 };
    expect((await riderA.agent.post(api(`/rider/deliveries/${o.orderId}/location`)).send(loc)).status).toBe(409);
    expect((await riderA.agent.post(api(`/rider/deliveries/${o.orderId}/start`))).body.data.status).toBe('out_for_delivery');
    expect((await riderA2.agent.post(api(`/rider/deliveries/${o.orderId}/location`)).send(loc)).status).toBe(404);
    expect((await buyer.agent.post(api(`/rider/deliveries/${o.orderId}/location`)).send(loc)).status).toBe(403);
    expect((await riderA.agent.post(api(`/rider/deliveries/${o.orderId}/location`)).send({ lat: 200, lng: 0 })).status).toBe(400);
    expect((await riderA.agent.post(api(`/rider/deliveries/${o.orderId}/location`)).send(loc)).status).toBe(200);
    expect((await riderA.agent.post(api(`/rider/deliveries/${o.orderId}/location`)).send(loc)).status).toBe(429);
    expect(await RiderLocation.countDocuments({ orderId: o.orderId })).toBe(1);

    // Tracking: buyer / store member / admin only, while out for delivery.
    let res = await buyer.agent.get(api(`/orders/${o.number}/tracking`));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'out_for_delivery', active: true, lastLocation: { lat: 31.52, lng: 74.35 } });
    expect(res.body.data.rider.phone).toBe('+92300*****33');
    expect((await sellerA.agent.get(api(`/orders/${o.number}/tracking`))).status).toBe(200);
    expect((await admin.agent.get(api(`/orders/${o.number}/tracking`))).status).toBe(200);
    expect((await buyer2.agent.get(api(`/orders/${o.number}/tracking`))).status).toBe(404);
    expect((await sellerB.agent.get(api(`/orders/${o.number}/tracking`))).status).toBe(404);

    // Fail → locations refused, tracking inactive.
    res = await riderA.agent.post(api(`/rider/deliveries/${o.orderId}/fail`)).send({ reason: 'customer_unavailable' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('failed_delivery');
    deliveryConfig.minLocationIntervalMs = 0;
    expect((await riderA.agent.post(api(`/rider/deliveries/${o.orderId}/location`)).send(loc)).status).toBe(409);
    deliveryConfig.minLocationIntervalMs = 3000;
    res = await buyer.agent.get(api(`/orders/${o.number}/tracking`));
    expect(res.body.data).toMatchObject({ status: 'failed_delivery', active: false, rider: null, lastLocation: null });
  });

  it('wrong OTP fails and locks after 5 tries; right OTP delivers, records COD + earnings; seller settles cash', async () => {
    const o = await shippedOrder(buyer, sellerA, item, String(riderA.member._id));
    await riderA.agent.post(api(`/rider/deliveries/${o.orderId}/start`));
    const wrong = o.otp === '0000' ? '1111' : '0000';
    for (let i = 1; i <= 4; i++) {
      const r = await riderA.agent.post(api(`/rider/deliveries/${o.orderId}/deliver`)).send({ otp: wrong });
      expect(r.status).toBe(400);
      expect(r.body.error).toMatchObject({ code: 'OTP_INVALID', details: { attemptsLeft: 5 - i } });
    }
    expect((await riderA.agent.post(api(`/rider/deliveries/${o.orderId}/deliver`)).send({ otp: wrong })).status).toBe(423);
    // Locked even for the right code.
    expect((await riderA.agent.post(api(`/rider/deliveries/${o.orderId}/deliver`)).send({ otp: o.otp })).body.error.code).toBe('OTP_LOCKED');
    expect((await Order.findById(o.orderId).lean())!.status).toBe('out_for_delivery');

    await DeliverySession.updateOne({ orderId: o.orderId }, { $set: { otpLockedUntil: new Date(Date.now() - 1000) } });
    expect((await riderA.agent.post(api(`/rider/deliveries/${o.orderId}/deliver`)).send({ otp: o.otp, codCollected: o.total + 1 })).status).toBe(400);
    const res = await riderA.agent.post(api(`/rider/deliveries/${o.orderId}/deliver`)).send({ otp: o.otp });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('delivered');
    const order = await Order.findById(o.orderId).lean();
    expect(order!.payment.status).toBe('paid');
    expect(await RiderCashEntry.countDocuments({ orderId: o.orderId, type: 'collected', amount: o.total })).toBe(1);
    // Delivering again is refused.
    expect((await riderA.agent.post(api(`/rider/deliveries/${o.orderId}/deliver`)).send({ otp: o.otp })).status).toBe(409);

    const me = (await riderA.agent.get(api('/rider/me'))).body.data;
    expect(me.stats.earningsToday).toBeGreaterThanOrEqual(12_000);
    expect(me.stats.codOutstanding).toBeGreaterThanOrEqual(o.total);

    const riders = (await sellerA.agent.get(api('/seller/riders'))).body.data as { memberId: string; codOutstanding: number }[];
    const row = riders.find((r) => r.memberId === String(riderA.member._id))!;
    expect(row.codOutstanding).toBe(me.stats.codOutstanding);
    expect((await sellerA.agent.post(api(`/seller/riders/${row.memberId}/cod-settle`)).send({ amount: row.codOutstanding + 1 })).status).toBe(400);
    expect((await sellerB.agent.post(api(`/seller/riders/${row.memberId}/cod-settle`)).send({ amount: 100 })).status).toBe(404);
    expect((await riderA.agent.post(api(`/seller/riders/${row.memberId}/cod-settle`)).send({ amount: 100 })).status).toBe(403);
    const settled = await sellerA.agent.post(api(`/seller/riders/${row.memberId}/cod-settle`)).send({ amount: row.codOutstanding });
    expect(settled.status).toBe(201);
    expect(settled.body.data.outstanding).toBe(0);
    expect((await riderA.agent.get(api('/rider/cod'))).body.data.stores[0].outstanding).toBe(0);
  });

  it('declares the 7-day TTL index on RiderLocation', async () => {
    const idx = await RiderLocation.collection.indexes();
    expect(idx.find((i) => i.key.at === 1)?.expireAfterSeconds).toBe(7 * 24 * 3600);
  });
});

describe('live tracking sockets', () => {
  let server: http.Server;
  let url: string;
  const clients: ClientSocket[] = [];

  beforeAll(async () => {
    server = http.createServer(createApp());
    initSocket(server);
    await new Promise<void>((r) => server.listen(0, r));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    clients.forEach((c) => c.close());
    await closeSocket();
    await new Promise<void>((r) => server.close(() => r()));
  });

  async function connect(email: string) {
    const { res } = await loginAgent(email, 'Passw0rd!');
    const at = getCookie(res, 'sq_at');
    const c = ioClient(url, { transports: ['websocket'], extraHeaders: { cookie: `sq_at=${at}` }, forceNew: true });
    clients.push(c);
    await new Promise<void>((resolve, reject) => {
      c.on('connect', () => resolve());
      c.on('connect_error', reject);
    });
    return c;
  }
  const emit = (c: ClientSocket, ev: string, payload: unknown) => new Promise<{ ok?: boolean; error?: { code: string } }>((r) => c.emit(ev, payload, r));

  it('only buyer / store members / admins join, only while out for delivery; locations are broadcast', async () => {
    const o = await shippedOrder(buyer, sellerA, item, String(riderA.member._id));
    const [b, b2, sb, adm, rider] = await Promise.all([connect(buyer.email), connect(buyer2.email), connect(sellerB.owner.email!), connect(admin.email), connect(riderA.user.email!)]);

    expect((await emit(b, 'order-track:join', { orderId: o.orderId })).error?.code).toBe('TRACKING_INACTIVE');
    await riderA.agent.post(api(`/rider/deliveries/${o.orderId}/start`));

    expect((await emit(b, 'order-track:join', { orderId: o.orderId })).ok).toBe(true);
    expect((await emit(adm, 'order-track:join', { orderId: o.orderId })).ok).toBe(true);
    expect((await emit(b2, 'order-track:join', { orderId: o.orderId })).error?.code).toBe('NOT_FOUND');
    expect((await emit(sb, 'order-track:join', { orderId: o.orderId })).error?.code).toBe('NOT_FOUND');
    expect((await emit(b, 'order-track:join', { orderId: 'nope' })).error?.code).toBe('VALIDATION_ERROR');

    const got = new Promise<{ lat: number; eta: number | null }>((r) => b.once('rider:location', r));
    let b2Got = false;
    b2.on('rider:location', () => (b2Got = true));
    // Only the assigned rider may push locations over the socket.
    expect((await emit(b, 'rider:location', { orderId: o.orderId, lat: 31.5, lng: 74.3 })).error?.code).toBe('NOT_A_RIDER');
    expect((await emit(rider, 'rider:location', { orderId: o.orderId, lat: 31.5, lng: 74.3 })).ok).toBe(true);
    expect((await got).lat).toBe(31.5);

    const ended = new Promise<{ status: string }>((r) => b.once('tracking:ended', r));
    await riderA.agent.post(api(`/rider/deliveries/${o.orderId}/deliver`)).send({ otp: o.otp });
    expect((await ended).status).toBe('delivered');
    deliveryConfig.minLocationIntervalMs = 0;
    expect((await emit(rider, 'rider:location', { orderId: o.orderId, lat: 31.6, lng: 74.3 })).error?.code).toBe('TRACKING_INACTIVE');
    deliveryConfig.minLocationIntervalMs = 3000;
    expect((await emit(b, 'order-track:join', { orderId: o.orderId })).error?.code).toBe('TRACKING_INACTIVE');
    expect(b2Got).toBe(false);
  });
});

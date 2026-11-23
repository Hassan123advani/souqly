import { beforeAll, describe, expect, it } from 'vitest';
import { placeOrder } from '../loyalty/socialTestFixtures';
import { addStaff, api, makeBuyer, makeItem, makeSeller } from '../orders/orderTestFixtures';
import { StoreSettings } from '../seller/storeSettings.model';
import { Store } from '../stores/store.model';
import { Message } from './chat.models';
import { handleJoin, type ChatSocketLike } from './chat.socket';

let buyer: Awaited<ReturnType<typeof makeBuyer>>;
let buyer2: Awaited<ReturnType<typeof makeBuyer>>;
let sellerA: Awaited<ReturnType<typeof makeSeller>>;
let sellerB: Awaited<ReturnType<typeof makeSeller>>;
let item: Awaited<ReturnType<typeof makeItem>>;
let convId: string;

beforeAll(async () => {
  buyer = await makeBuyer();
  buyer2 = await makeBuyer();
  sellerA = await makeSeller('Chat Store A');
  sellerB = await makeSeller('Chat Store B');
  item = await makeItem(sellerA.store._id, 50_000, 10);
  await StoreSettings.create({ storeId: sellerA.store._id, chat: { autoReply: { enabled: true, message: 'Thanks! We reply within 2 hours.' }, quickReplies: ['Yes, in stock'] } });
});

function fakeSocket(userId: string): ChatSocketLike & { joined: string[] } {
  const joined: string[] = [];
  return {
    joined,
    data: { user: { id: userId, sessionId: 's', permissions: [] } as never },
    rooms: new Set(),
    join(room: string) {
      joined.push(room);
    },
    leave() {},
    on() {},
    to() {
      return { emit() {} };
    },
  };
}

describe('chat', () => {
  it('buyer starts a conversation, sends text; store gets one auto-reply', async () => {
    const start = await buyer.agent.post(api('/chat/conversations')).send({ storeSlug: sellerA.store.slug, productId: item.productId });
    expect(start.status).toBe(201);
    convId = start.body.data.id;
    // Same pair → same conversation.
    expect((await buyer.agent.post(api('/chat/conversations')).send({ storeSlug: sellerA.store.slug })).body.data.id).toBe(convId);
    // Sellers cannot open a chat with their own store.
    expect((await sellerA.agent.post(api('/chat/conversations')).send({ storeSlug: sellerA.store.slug })).status).toBe(400);

    const m1 = await buyer.agent.post(api(`/chat/conversations/${convId}/messages`)).send({ type: 'text', text: 'Hello <script>x</script>there' });
    expect(m1.status).toBe(201);
    expect(m1.body.data.text).toBe('Hello there');
    await buyer.agent.post(api(`/chat/conversations/${convId}/messages`)).send({ type: 'text', text: 'Is it available?' });
    await new Promise((r) => setTimeout(r, 200));
    const msgs = await buyer.agent.get(api(`/chat/conversations/${convId}/messages`));
    expect(msgs.body.data.filter((m: { auto?: boolean }) => m.auto)).toHaveLength(1);

    const sellerList = await sellerA.agent.get(api('/seller/chat/conversations'));
    expect(sellerList.body.data[0]).toMatchObject({ id: convId, unread: 2, buyer: { id: String(buyer.user._id) } });
    expect((await sellerA.agent.get(api('/seller/chat/quick-replies'))).body.data).toEqual(['Yes, in stock']);
  });

  it('seller replies update read state and store response stats', async () => {
    const reply = await sellerA.agent.post(api(`/seller/chat/conversations/${convId}/messages`)).send({ type: 'text', text: 'Yes it is!' });
    expect(reply.status).toBe(201);
    expect(reply.body.data.senderSide).toBe('store');
    const read = await sellerA.agent.post(api(`/seller/chat/conversations/${convId}/read`));
    expect(read.body.data.read).toBe(2);
    expect((await buyer.agent.get(api('/chat/conversations'))).body.data[0].unread).toBe(2); // auto-reply + reply
    await new Promise((r) => setTimeout(r, 100));
    const s = await Store.findById(sellerA.store._id).lean();
    expect(s!.responseRate).toBe(100);
    expect(s!.responseTimeHours).toBeLessThan(1);
  });

  it('buyer cannot read another buyer’s conversation; store B cannot read store A’s', async () => {
    expect((await buyer2.agent.get(api(`/chat/conversations/${convId}/messages`))).status).toBe(404);
    expect((await buyer2.agent.post(api(`/chat/conversations/${convId}/messages`)).send({ type: 'text', text: 'hi' })).status).toBe(404);
    expect((await sellerB.agent.get(api(`/seller/chat/conversations/${convId}/messages`))).status).toBe(404);
    expect((await sellerB.agent.post(api(`/seller/chat/conversations/${convId}/messages`)).send({ type: 'text', text: 'hi' })).status).toBe(404);
    expect((await sellerB.agent.get(api('/seller/chat/conversations'))).body.data).toHaveLength(0);
    // Staff without chat permission are refused.
    const inv = await addStaff(sellerA.store._id, 'INVENTORY');
    expect((await inv.agent.get(api('/seller/chat/conversations'))).status).toBe(403);
  });

  it('socket room join: only the buyer and store members with chat permission', async () => {
    const own = fakeSocket(String(buyer.user._id));
    expect(await handleJoin(own, { conversationId: convId })).toBe(true);
    expect(own.joined).toEqual([`conv:${convId}`]);
    expect(own.data.chatSides?.[convId]).toBe('buyer');

    const staff = await addStaff(sellerA.store._id, 'ORDERS');
    const st = fakeSocket(String(staff.user._id));
    expect(await handleJoin(st, { conversationId: convId })).toBe(true);
    expect(st.data.chatSides?.[convId]).toBe('store');

    for (const uid of [String(buyer2.user._id), String(sellerB.owner._id), String((await addStaff(sellerA.store._id, 'INVENTORY')).user._id)]) {
      const s = fakeSocket(uid);
      let ack: unknown;
      expect(await handleJoin(s, { conversationId: convId }, (r: unknown) => (ack = r))).toBe(false);
      expect(s.joined).toHaveLength(0);
      expect(ack).toEqual({ ok: false, error: 'FORBIDDEN' });
    }
    expect(await handleJoin(fakeSocket(String(buyer.user._id)), { conversationId: 'nope' })).toBe(false);
  });

  it('order cards must belong to this buyer and store; product cards snapshot', async () => {
    const mine = await placeOrder(buyer, [{ productId: item.productId, variantId: item.variantId, qty: 1 }]);
    const theirs = await placeOrder(buyer2, [{ productId: item.productId, variantId: item.variantId, qty: 1 }]);
    const itemB = await makeItem(sellerB.store._id, 10_000, 5);
    const otherStore = await placeOrder(buyer, [{ productId: itemB.productId, variantId: itemB.variantId, qty: 1 }]);

    const ok = await buyer.agent.post(api(`/chat/conversations/${convId}/messages`)).send({ type: 'order', orderId: mine.orders[0]!.id });
    expect(ok.status).toBe(201);
    expect(ok.body.data.order).toMatchObject({ number: mine.orders[0]!.number });
    expect((await buyer.agent.post(api(`/chat/conversations/${convId}/messages`)).send({ type: 'order', orderId: theirs.orders[0]!.id })).status).toBe(404);
    expect((await buyer.agent.post(api(`/chat/conversations/${convId}/messages`)).send({ type: 'order', orderId: otherStore.orders[0]!.id })).status).toBe(404);
    // The seller cannot attach another buyer's order either.
    expect((await sellerA.agent.post(api(`/seller/chat/conversations/${convId}/messages`)).send({ type: 'order', orderId: theirs.orders[0]!.id })).status).toBe(404);

    const prod = await buyer.agent.post(api(`/chat/conversations/${convId}/messages`)).send({ type: 'product', productId: item.productId });
    expect(prod.body.data.product).toMatchObject({ slug: item.product.slug, price: 50_000 });
    // Images must be the sender's own uploads.
    expect((await buyer.agent.post(api(`/chat/conversations/${convId}/messages`)).send({ type: 'image', imageKey: 'social/other/chat_image/x.png' })).status).toBe(400);
  });

  it('message reports need participation', async () => {
    const msg = await Message.findOne({ senderSide: 'store', auto: false }).lean();
    expect((await buyer2.agent.post(api('/reports')).send({ targetType: 'message', targetId: String(msg!._id), reason: 'harassment' })).status).toBe(404);
    expect((await buyer.agent.post(api('/reports')).send({ targetType: 'message', targetId: String(msg!._id), reason: 'harassment' })).status).toBe(201);
  });
});

import { beforeAll, describe, expect, it } from 'vitest';
import { Product } from '../catalog/product.model';
import { notifyCapture } from '../chat/notifyAdapter';
import { deliveredOrder, placeOrder } from '../loyalty/socialTestFixtures';
import { addStaff, api, makeBuyer, makeItem, makeSeller } from '../orders/orderTestFixtures';
import { FraudSignal, Report } from '../reports/report.model';
import { Store } from '../stores/store.model';
import { findBadWords, maskBadWords } from './badWords';
import { Review } from './review.model';

let buyer: Awaited<ReturnType<typeof makeBuyer>>;
let buyer2: Awaited<ReturnType<typeof makeBuyer>>;
let sellerA: Awaited<ReturnType<typeof makeSeller>>;
let sellerB: Awaited<ReturnType<typeof makeSeller>>;
let item: Awaited<ReturnType<typeof makeItem>>;
let orderId: string;
let order2Id: string;

beforeAll(async () => {
  buyer = await makeBuyer();
  buyer2 = await makeBuyer();
  sellerA = await makeSeller('Review Store A');
  sellerB = await makeSeller('Review Store B');
  item = await makeItem(sellerA.store._id, 150_000, 50);
  orderId = (await deliveredOrder(buyer, [{ productId: item.productId, variantId: item.variantId, qty: 1 }]))[0]!.id;
  order2Id = (await deliveredOrder(buyer2, [{ productId: item.productId, variantId: item.variantId, qty: 1 }]))[0]!.id;
});

const body = (o: string, rating: number, extra: Record<string, unknown> = {}) => ({ orderId: o, productId: item.productId, variantId: item.variantId, rating, ...extra });

describe('badWords', () => {
  it('finds and masks English and Roman Urdu words, including leetspeak', () => {
    expect(findBadWords('This is sh1t quality, kamina seller')).toHaveLength(2);
    expect(maskBadWords('total bullshit').text).toBe('total b*******');
    expect(maskBadWords('Great product, fast delivery').flagged).toBe(false);
  });
});

describe('reviews', () => {
  it('rejects reviews for orders that are not delivered or not the buyer’s', async () => {
    const pending = await placeOrder(buyer, [{ productId: item.productId, variantId: item.variantId, qty: 1 }]);
    const r1 = await buyer.agent.post(api('/reviews')).send(body(pending.orders[0]!.id, 5));
    expect(r1.status).toBe(400);
    expect(r1.body.error.code).toBe('NOT_DELIVERED');
    // buyer2 cannot review using buyer's order
    const r2 = await buyer2.agent.post(api('/reviews')).send(body(orderId, 5));
    expect(r2.status).toBe(404);
    // product not in the order
    const other = await makeItem(sellerA.store._id, 10_000);
    const r3 = await buyer.agent.post(api('/reviews')).send({ orderId, productId: other.productId, variantId: other.variantId, rating: 4 });
    expect(r3.status).toBe(400);
  });

  it('lists the delivered item as pending, accepts one verified review per order item and updates aggregates', async () => {
    const pending = await buyer.agent.get(api('/reviews/pending'));
    expect(pending.body.data.some((p: { orderId: string }) => p.orderId === orderId)).toBe(true);

    const res = await buyer.agent.post(api('/reviews')).send(body(orderId, 4, { title: 'Nice', body: 'Good <b>quality</b>' }));
    expect(res.status).toBe(201);
    expect(res.body.data.verified).toBe(true);
    expect(res.body.data.status).toBe('published');
    expect(res.body.data.body).toBe('Good quality');

    const dup = await buyer.agent.post(api('/reviews')).send(body(orderId, 1));
    expect(dup.status).toBe(409);

    const res2 = await buyer2.agent.post(api('/reviews')).send(body(order2Id, 2));
    expect(res2.status).toBe(201);

    const p = await Product.findById(item.productId).lean();
    expect(p!.ratingCount).toBe(2);
    expect(p!.ratingAvg).toBe(3);
    const s = await Store.findById(sellerA.store._id).lean();
    expect(s!.ratingCount).toBe(2);

    const summary = await buyer.agent.get(api(`/products/${item.product.slug}/reviews/summary`));
    expect(summary.body.data).toMatchObject({ avg: 3, count: 2, breakdown: { '4': 1, '2': 1 } });

    const list = await buyer.agent.get(api(`/products/${item.product.slug}/reviews?sort=rating_low&limit=1`));
    expect(list.body.data[0].rating).toBe(2);
    expect(list.body.meta.nextCursor).toBeTruthy();
    const next = await buyer.agent.get(api(`/products/${item.product.slug}/reviews?sort=rating_low&limit=1&cursor=${list.body.meta.nextCursor}`));
    expect(next.body.data[0].rating).toBe(4);

    expect((await buyer.agent.get(api('/reviews/pending'))).body.data.some((x: { orderId: string }) => x.orderId === orderId)).toBe(false);
    // New accounts leave a fraud signal for admins.
    expect(await FraudSignal.countDocuments({ type: 'new_account_review' })).toBeGreaterThan(0);
  });

  it('flags reviews with bad words for moderation (masked, not counted)', async () => {
    const b3 = await makeBuyer();
    const o = (await deliveredOrder(b3, [{ productId: item.productId, variantId: item.variantId, qty: 1 }]))[0]!.id;
    const res = await b3.agent.post(api('/reviews')).send(body(o, 1, { body: 'what a bullshit product' }));
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.body).toBe('what a b******* product');
    expect((await Product.findById(item.productId).lean())!.ratingCount).toBe(2);
  });

  it('counts a helpful vote once per user and never on one’s own review', async () => {
    const review = await Review.findOne({ orderId }).lean();
    const id = String(review!._id);
    expect((await buyer.agent.post(api(`/reviews/${id}/helpful`))).status).toBe(400);
    const v1 = await buyer2.agent.post(api(`/reviews/${id}/helpful`));
    expect(v1.status).toBe(200);
    expect(v1.body.data.helpfulCount).toBe(1);
    expect((await buyer2.agent.post(api(`/reviews/${id}/helpful`))).status).toBe(409);
    const list = await buyer2.agent.get(api(`/products/${item.product.slug}/reviews?sort=helpful`));
    expect(list.body.data[0]).toMatchObject({ id, helpfulCount: 1, myVote: true });
  });

  it('reports a review once', async () => {
    const review = await Review.findOne({ orderId }).lean();
    const r = await buyer2.agent.post(api(`/reviews/${review!._id}/report`)).send({ reason: 'fake' });
    expect(r.status).toBe(201);
    expect((await buyer2.agent.post(api(`/reviews/${review!._id}/report`)).send({ reason: 'fake' })).status).toBe(409);
    expect(await Report.countDocuments({ targetId: review!._id })).toBe(1);
  });

  it('seller reply: own store only (tenant isolation) and the buyer is notified', async () => {
    const review = await Review.findOne({ orderId }).lean();
    const id = String(review!._id);
    const cross = await sellerB.agent.post(api(`/seller/reviews/${id}/reply`)).send({ text: 'Not my store' });
    expect(cross.status).toBe(404);
    const listB = await sellerB.agent.get(api('/seller/reviews'));
    expect(listB.body.data).toHaveLength(0);

    const inventory = await addStaff(sellerA.store._id, 'INVENTORY');
    expect((await inventory.agent.post(api(`/seller/reviews/${id}/reply`)).send({ text: 'hi' })).status).toBe(403);

    const before = notifyCapture.length;
    const ok = await sellerA.agent.post(api(`/seller/reviews/${id}/reply`)).send({ text: 'Thank you!' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.reply.text).toBe('Thank you!');
    expect(notifyCapture.slice(before).some((n) => n.type === 'review.reply' && String(n.userId) === String(buyer.user._id))).toBe(true);
    const listA = await sellerA.agent.get(api('/seller/reviews?replied=1'));
    expect(listA.body.data.map((r: { id: string }) => r.id)).toContain(id);
  });
});

describe('Q&A', () => {
  it('buyers ask, only the owning store answers, asker notified', async () => {
    const ask = await buyer.agent.post(api(`/products/${item.product.slug}/questions`)).send({ text: 'Is this waterproof?' });
    expect(ask.status).toBe(201);
    const qid = ask.body.data.id;
    expect((await buyer.agent.post(api(`/products/${item.product.slug}/questions`)).send({ text: 'x' })).status).toBe(400);

    const unansweredB = await sellerB.agent.get(api('/seller/questions?unanswered=1'));
    expect(unansweredB.body.data).toHaveLength(0);
    expect((await sellerB.agent.post(api(`/seller/questions/${qid}/answer`)).send({ text: 'yes' })).status).toBe(404);

    const unansweredA = await sellerA.agent.get(api('/seller/questions?unanswered=1'));
    expect(unansweredA.body.data.map((q: { id: string }) => q.id)).toContain(qid);
    const before = notifyCapture.length;
    const ans = await sellerA.agent.post(api(`/seller/questions/${qid}/answer`)).send({ text: 'Yes, IP67.' });
    expect(ans.status).toBe(200);
    expect(notifyCapture.slice(before).some((n) => n.type === 'question.answered')).toBe(true);

    const pub = await buyer2.agent.get(api(`/products/${item.product.slug}/questions`));
    expect(pub.body.data[0]).toMatchObject({ id: qid, answer: { text: 'Yes, IP67.' } });
    expect((await sellerA.agent.get(api('/seller/questions?unanswered=1'))).body.data.map((q: { id: string }) => q.id)).not.toContain(qid);
  });
});

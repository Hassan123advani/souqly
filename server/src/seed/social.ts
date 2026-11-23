import { Types } from 'mongoose';
import { logger } from '../lib/logger';
import { Product } from '../modules/catalog/product.model';
import { Conversation, Message } from '../modules/chat/chat.models';
import { Follow } from '../modules/follows/follow.model';
import { changeCoins } from '../modules/loyalty/coins.service';
import { CheckIn, GiftCard } from '../modules/loyalty/loyalty.models';
import { coinsForOrderTotal } from '../modules/loyalty/redemption';
import { Order } from '../modules/orders/order.model';
import { Question } from '../modules/qa/question.model';
import { Review, ReviewVote, type ReviewLean } from '../modules/reviews/review.model';
import { REVIEWABLE_ORDER_STATUSES } from '../modules/reviews/review.service';
import { Store } from '../modules/stores/store.model';
import { User } from '../modules/users/user.model';
import { generateReferralCode } from '../modules/users/user.service';
import { credit } from '../modules/wallet/wallet.service';
import { Wishlist } from '../modules/wishlists/wishlist.model';
import { getStorage } from '../services/storage';

const DAY = 86_400_000;
export const SEED_GIFT_CARD = 'SOUQLY-GIFT-2026';

/** Deterministic PRNG (mulberry32) so every seed looks the same. */
function rng(seed: number) {
  let a = seed;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)), pick: <T>(arr: readonly T[]) => arr[Math.floor(next() * arr.length)]! };
}

const COMMUNITY = ['Hamza Raza', 'Fatima Noor', 'Usman Tariq', 'Zainab Ali', 'Ahmed Siddiqui', 'Mariam Qureshi', 'Ali Haider', 'Hira Baig', 'Omar Farooq', 'Areeba Shah', 'Saad Iqbal', 'Noor Fatima'];

const TEXT: Record<number, { title: string; body: string }[]> = {
  5: [
    { title: 'Excellent quality', body: 'Exactly as shown in the pictures. Packing was neat and delivery was quick. Highly recommended!' },
    { title: 'Bohat acha product', body: 'Quality bohat achi hai, price ke hisaab se zabardast. Seller ka response bhi fast tha.' },
    { title: 'Worth every rupee', body: 'Second time ordering from this store. Same great quality, arrived in 2 days.' },
    { title: 'Love it', body: 'Fits perfectly and the material feels premium. Will buy again for Eid.' },
  ],
  4: [
    { title: 'Good value', body: 'Good product for the price. Colour is slightly lighter than the photos but overall happy.' },
    { title: 'Theek hai', body: 'Product acha hai, delivery mein ek din late hua lekin seller ne update diya.' },
    { title: 'Nice', body: 'Works as described. Packaging could be a little better.' },
  ],
  3: [
    { title: 'Average', body: 'It is okay. Does the job but I expected slightly better finishing.' },
    { title: 'Mixed feelings', body: 'Quality is fine, size runs a bit small. Order one size up.' },
  ],
  2: [{ title: 'Not as expected', body: 'Material is thinner than it looks in the pictures. Seller offered a return though.' }],
  1: [{ title: 'Disappointed', body: 'Received a different shade than ordered. Hoping the seller sorts it out.' }],
};

/** Rating around a target average. */
function ratingNear(r: ReturnType<typeof rng>, avg: number): number {
  const x = avg + (r.next() - 0.5) * 2.2;
  return Math.max(1, Math.min(5, Math.round(x)));
}

function photoSvg(label: string, hue: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},45%,82%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360},50%,62%)"/></linearGradient></defs><rect width="600" height="600" fill="url(#g)"/><rect x="120" y="150" width="360" height="300" rx="28" fill="#fff" fill-opacity=".55"/><circle cx="300" cy="270" r="70" fill="hsl(${hue},40%,40%)" fill-opacity=".35"/><text x="300" y="410" font-family="sans-serif" font-size="30" text-anchor="middle" fill="#1d2b2a">${label.replace(/[<>&"]/g, '')}</text></svg>`;
}

async function communityUsers(): Promise<Types.ObjectId[]> {
  const ids: Types.ObjectId[] = [];
  for (const [i, name] of COMMUNITY.entries()) {
    const email = `reviewer${i + 1}@demo.souqly.pk`;
    let u = await User.findOne({ email }).select('_id').lean();
    if (!u) u = await User.create({ name, email, emailVerified: true, referralCode: await generateReferralCode(), demo: true, createdAt: new Date(Date.now() - (120 + i * 9) * DAY) });
    ids.push(u._id);
  }
  return ids;
}

export async function seedSocial(): Promise<Record<string, number>> {
  if (await Review.exists({ demo: true })) return { skipped: 1 };
  const r = rng(808);
  const buyers = await User.find({ email: { $in: ['ayesha@demo.souqly.pk', 'bilal@demo.souqly.pk', 'sana@demo.souqly.pk'] } }).select('_id email name').lean();
  if (!buyers.length) return { skipped: 1 };
  const community = await communityUsers();
  const counts: Record<string, number> = { reviews: 0, photos: 0, votes: 0, replies: 0, questions: 0, follows: 0, wishlists: 0, messages: 0 };

  const stores = await Store.find({ demo: true, status: 'approved' }).select('_id slug name ownerId').lean();
  const ownerByStore = new Map(stores.map((s) => [String(s._id), s.ownerId]));
  const products = await Product.find({ demo: true, status: 'published' }).select('_id storeId title slug ratingAvg ratingCount images variants priceMin').lean();
  const storage = getStorage();

  // 1) Verified reviews for delivered demo orders.
  const orders = await Order.find({ demo: true, status: { $in: REVIEWABLE_ORDER_STATUSES } }).lean();
  const reviewDocs: Record<string, unknown>[] = [];
  let photoN = 0;
  for (const o of orders) {
    const deliveredAt = [...o.timeline].reverse().find((t) => t.status === 'delivered')?.at ?? o.updatedAt;
    for (const it of o.items) {
      if (r.next() < 0.25) continue; // some stay as "pending review" reminders
      const rating = r.next() < 0.75 ? 5 : r.int(3, 4);
      const t = r.pick(TEXT[rating]!);
      const media: { type: 'image'; url: string; key: string }[] = [];
      if (r.next() < 0.35) {
        for (let k = 0; k < r.int(1, 3); k++) {
          photoN++;
          const key = `seed/reviews/photo-${photoN}.svg`;
          const f = await storage.upload(Buffer.from(photoSvg(it.title.slice(0, 22), (photoN * 47) % 360), 'utf8'), { folder: 'seed', filename: key, mimetype: 'image/svg+xml', fixedKey: key });
          media.push({ type: 'image', url: f.url, key: f.key });
        }
      }
      const opts = Object.entries((it.options ?? {}) as Record<string, string>).map(([k, v]) => `${k}: ${v}`).join(', ');
      reviewDocs.push({
        productId: it.productId,
        storeId: o.storeId,
        orderId: o._id,
        variantId: it.variantId,
        buyerId: o.buyerId,
        rating,
        title: t.title,
        body: t.body,
        ...(opts ? { variantLabel: opts.slice(0, 200) } : {}),
        media,
        hasMedia: media.length > 0,
        verified: true,
        status: 'published',
        demo: true,
        createdAt: new Date(new Date(deliveredAt).getTime() + r.int(1, 4) * DAY),
      });
    }
  }
  counts.photos = photoN;

  // 2) Community reviews (unverified: no order behind them) so ratings look realistic.
  const reviewers = [...community, ...buyers.map((b) => b._id)];
  for (const p of products) {
    if (!p.ratingCount) continue;
    const n = Math.min(reviewers.length, Math.max(2, Math.min(8, Math.round(p.ratingCount / 10))));
    const start = r.int(0, reviewers.length - 1);
    for (let k = 0; k < n; k++) {
      const rating = ratingNear(r, p.ratingAvg || 4.3);
      const t = r.pick(TEXT[rating]!);
      reviewDocs.push({
        productId: p._id,
        storeId: p.storeId,
        orderId: null,
        variantId: null,
        buyerId: reviewers[(start + k) % reviewers.length],
        rating,
        title: t.title,
        body: t.body,
        media: [],
        hasMedia: false,
        verified: false,
        status: 'published',
        demo: true,
        createdAt: new Date(Date.now() - r.int(3, 160) * DAY),
      });
    }
  }
  const created = (await Review.insertMany(reviewDocs, { lean: false })).map((d) => (d as unknown as { toObject(): ReviewLean }).toObject());
  counts.reviews = created.length;

  // 3) Helpful votes + seller replies.
  const voters = [...community, ...buyers.map((b) => b._id)];
  const votes: { reviewId: Types.ObjectId; userId: Types.ObjectId }[] = [];
  const helpful = new Map<string, number>();
  for (const rev of created) {
    if (r.next() < 0.5) continue;
    const n = r.int(1, 6);
    const start = r.int(0, voters.length - 1);
    for (let k = 0; k < n; k++) {
      const u = voters[(start + k) % voters.length]!;
      if (String(u) === String(rev.buyerId)) continue;
      votes.push({ reviewId: rev._id, userId: u });
      helpful.set(String(rev._id), (helpful.get(String(rev._id)) ?? 0) + 1);
    }
  }
  if (votes.length) await ReviewVote.insertMany(votes, { ordered: false }).catch(() => undefined);
  counts.votes = votes.length;
  const bulk = created.map((rev) => {
    const set: Record<string, unknown> = { helpfulCount: helpful.get(String(rev._id)) ?? 0 };
    if ((rev.rating <= 3 || r.next() < 0.3) && ownerByStore.get(String(rev.storeId))) {
      counts.replies!++;
      set.reply = {
        text: rev.rating <= 3 ? 'Sorry about this! Please message us from your order page and we will make it right.' : 'Thank you so much for your kind words! See you again.',
        by: ownerByStore.get(String(rev.storeId)),
        at: new Date(rev.createdAt.getTime() + r.int(2, 30) * 3_600_000),
      };
    }
    return { updateOne: { filter: { _id: rev._id }, update: { $set: set } } };
  });
  if (bulk.length) await Review.bulkWrite(bulk);

  // 4) Aggregates from real review rows (products + stores).
  const pAgg = await Review.aggregate<{ _id: Types.ObjectId; avg: number; n: number }>([{ $match: { demo: true, status: 'published' } }, { $group: { _id: '$productId', avg: { $avg: '$rating' }, n: { $sum: 1 } } }]);
  if (pAgg.length) await Product.bulkWrite(pAgg.map((a) => ({ updateOne: { filter: { _id: a._id }, update: { $set: { ratingAvg: Math.round(a.avg * 100) / 100, ratingCount: a.n } } } })));
  const sAgg = await Review.aggregate<{ _id: Types.ObjectId; avg: number; n: number }>([{ $match: { demo: true, status: 'published' } }, { $group: { _id: '$storeId', avg: { $avg: '$rating' }, n: { $sum: 1 } } }]);
  if (sAgg.length) await Store.bulkWrite(sAgg.map((a) => ({ updateOne: { filter: { _id: a._id }, update: { $set: { ratingAvg: Math.round(a.avg * 100) / 100, ratingCount: a.n } } } })));

  // 5) Questions & answers.
  const QUESTIONS = [
    ['Is this available in other colours?', 'Yes, more colours are coming next week. Follow our store to get notified.'],
    ['Kya yeh original hai?', 'Ji haan, 100% original with brand warranty.'],
    ['How long does delivery to Karachi take?', 'Usually 2-3 working days.'],
    ['Is cash on delivery available?', 'Yes, COD is available all over Pakistan.'],
    ['Does the size run small?', null],
  ] as const;
  const qProducts = products.slice(0, 15);
  for (const [i, p] of qProducts.entries()) {
    const [text, answer] = QUESTIONS[i % QUESTIONS.length]!;
    const owner = ownerByStore.get(String(p.storeId));
    await Question.create({
      productId: p._id,
      storeId: p.storeId,
      askerId: r.pick(reviewers),
      text,
      status: 'published',
      ...(answer && owner ? { answer: { text: answer, by: owner, at: new Date(Date.now() - r.int(1, 20) * DAY) }, answered: true } : { answered: false }),
      demo: true,
    });
    counts.questions!++;
  }

  // 6) Follows + wishlists + loyalty for demo buyers.
  for (const [bi, b] of buyers.entries()) {
    for (const s of stores.slice(bi, bi + 3)) {
      const res = await Follow.updateOne({ userId: b._id, storeId: s._id }, { $setOnInsert: { demo: true } }, { upsert: true });
      if (res.upsertedCount) {
        await Store.updateOne({ _id: s._id }, { $inc: { followerCount: 1 } });
        counts.follows!++;
      }
    }
    const picks = products.slice(bi * 5, bi * 5 + 4);
    await Wishlist.create({ userId: b._id, name: 'My wishlist', isDefault: true, demo: true, items: picks.map((p, k) => ({ productId: p._id, variantId: null, priceAtAdd: p.priceMin, addedAt: new Date(Date.now() - (k + 1) * DAY) })) });
    if (bi === 0) {
      const gifts = products.slice(20, 23);
      await Wishlist.create({ userId: b._id, name: 'Eid gifts', isDefault: false, demo: true, items: gifts.map((p) => ({ productId: p._id, variantId: null, priceAtAdd: p.priceMin, addedAt: new Date() })) });
    }
    counts.wishlists!++;
    for (const p of [...picks]) await Product.updateOne({ _id: p._id }, { $inc: { wishlistCount: 1 } });

    // Coins for delivered orders (same idempotent refs as the live hook) + a short check-in streak.
    const delivered = await Order.find({ demo: true, buyerId: b._id, status: { $in: REVIEWABLE_ORDER_STATUSES } }).select('_id total').lean();
    for (const o of delivered) {
      const coins = coinsForOrderTotal(o.total);
      if (coins > 0) await changeCoins({ userId: b._id, amount: coins, reason: 'order', ref: `order:${o._id}`, demo: true });
    }
    for (let d = 3; d >= 1; d--) {
      const day = new Date(Date.now() - d * DAY).toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
      await CheckIn.create({ userId: b._id, day, streak: 4 - d, coins: 10, demo: true });
      await changeCoins({ userId: b._id, amount: 10, reason: 'check_in', ref: `checkin:${b._id}:${day}`, demo: true });
    }
    await credit({ userId: b._id, amount: 25_000, reason: 'refund', ref: `seed:refund:${b._id}`, meta: { note: 'Demo refund' }, demo: true });
    if (bi === 0) await credit({ userId: b._id, amount: 50_000, reason: 'gift_card', ref: `seed:gift:${b._id}`, demo: true });
  }

  // 7) Conversations (Ayesha with two stores).
  const ayesha = buyers.find((b) => b.email === 'ayesha@demo.souqly.pk') ?? buyers[0]!;
  for (const [si, s] of stores.slice(0, 2).entries()) {
    const product = products.find((p) => String(p.storeId) === String(s._id));
    const start = Date.now() - (si + 1) * DAY;
    const conv = await Conversation.create({ buyerId: ayesha._id, storeId: s._id, productId: product?._id ?? null, demo: true, stats: { asked: 1, answered: 1, responseHours: 0.5 } });
    const script: { side: 'buyer' | 'store'; type: 'text' | 'product'; text?: string }[] = [
      { side: 'buyer', type: 'text', text: 'Assalam o Alaikum! Is this available in medium size?' },
      ...(product ? [{ side: 'buyer' as const, type: 'product' as const }] : []),
      { side: 'store', type: 'text', text: 'Walaikum Assalam! Yes, medium is in stock. Order today for delivery in 2-3 days.' },
      { side: 'buyer', type: 'text', text: 'Great, thank you!' },
    ];
    let last: { text: string; type: string; senderSide: 'buyer' | 'store'; at: Date } | undefined;
    for (const [k, m] of script.entries()) {
      const at = new Date(start + k * 15 * 60_000);
      const card = m.type === 'product' && product ? { id: String(product._id), title: product.title, slug: product.slug, ...(product.images?.[0]?.url ? { image: product.images[0].url } : {}), price: product.priceMin } : undefined;
      await Message.create({
        conversationId: conv._id,
        storeId: s._id,
        senderId: m.side === 'buyer' ? ayesha._id : s.ownerId,
        senderSide: m.side,
        type: m.type,
        ...(m.text ? { text: m.text } : {}),
        ...(card ? { productId: product!._id, card } : {}),
        readAt: k < script.length - 1 ? at : null,
        demo: true,
        createdAt: at,
      });
      last = { text: m.text ?? '[Product]', type: m.type, senderSide: m.side, at };
      counts.messages!++;
    }
    await Conversation.updateOne({ _id: conv._id }, { $set: { lastMessage: last, unread: { buyer: 0, store: 1 }, updatedAt: last!.at } }, { timestamps: false });
  }

  // 8) Unredeemed demo gift card.
  if (!(await GiftCard.exists({ code: SEED_GIFT_CARD }))) await GiftCard.create({ code: SEED_GIFT_CARD, amount: 100_000, balance: 100_000, expiresAt: new Date('2027-12-31T23:59:59Z'), demo: true });

  logger.info(counts, 'Seeded Phase 8 social data');
  return counts;
}

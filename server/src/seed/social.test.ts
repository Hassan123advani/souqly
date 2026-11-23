import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setStorage, type StorageService } from '../services/storage';
import { Conversation, Message } from '../modules/chat/chat.models';
import { GiftCard } from '../modules/loyalty/loyalty.models';
import { Product } from '../modules/catalog/product.model';
import { Review } from '../modules/reviews/review.model';
import { User } from '../modules/users/user.model';
import { WalletTransaction } from '../modules/wallet/walletTransaction.model';
import { runSeed } from './seed';
import { SEED_GIFT_CARD, seedSocial } from './social';

const memoryStorage: StorageService = {
  name: 'local',
  async upload(_b, o) {
    const key = o.fixedKey ?? `${o.folder}/${o.filename}`;
    return { url: `/uploads/${key}`, key };
  },
  async delete() {},
};
beforeAll(() => setStorage(memoryStorage));
afterAll(() => setStorage(undefined));

describe('Phase 8 seed', () => {
  it('seeds reviews (verified only with a delivered order), photos, chat, loyalty and the gift card; idempotent', async () => {
    await runSeed({ demo: true });
    const reviews = await Review.countDocuments({ demo: true });
    expect(reviews).toBeGreaterThan(20);
    expect(await Review.countDocuments({ demo: true, verified: true, orderId: null })).toBe(0);
    expect(await Review.countDocuments({ demo: true, hasMedia: true })).toBeGreaterThan(0);
    expect(await Review.countDocuments({ demo: true, reply: { $exists: true } })).toBeGreaterThan(0);
    const reviewed = await Product.findOne({ demo: true, ratingCount: { $gt: 0 } }).lean();
    expect(await Review.countDocuments({ productId: reviewed!._id, status: 'published' })).toBe(reviewed!.ratingCount);
    expect(await Conversation.countDocuments({ demo: true })).toBe(2);
    expect(await Message.countDocuments({ demo: true })).toBeGreaterThan(4);
    const gc = await GiftCard.findOne({ code: SEED_GIFT_CARD }).lean();
    expect(gc).toMatchObject({ amount: 100_000, balance: 100_000, redeemedBy: null });
    const ayesha = await User.findOne({ email: 'ayesha@demo.souqly.pk' }).lean();
    expect(ayesha!.coins).toBeGreaterThan(0);
    expect(ayesha!.walletBalance).toBe(75_000);
    expect(await WalletTransaction.countDocuments({ userId: ayesha!._id })).toBe(2);

    expect(await seedSocial()).toEqual({ skipped: 1 });
    expect(await Review.countDocuments({ demo: true })).toBe(reviews);
  });
});

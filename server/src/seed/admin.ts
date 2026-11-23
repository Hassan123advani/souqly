import { Types } from 'mongoose';
import { Page } from '../modules/cms/page.model';
import { Product } from '../modules/catalog/product.model';
import { Payout, PAYOUT_STATUSES } from '../modules/payouts/payout.model';
import { Store } from '../modules/stores/store.model';
import { StoreMember } from '../modules/stores/storeMember.model';
import { Ticket } from '../modules/support/ticket.model';
import { User } from '../modules/users/user.model';
import { generateReferralCode } from '../modules/users/user.service';
import { sanitizeRichText } from '../lib/sanitize';

const loc = (en: string, ur = '', ar = '') => ({ en, ur, ar });
const html = (paras: string[]) => sanitizeRichText(paras.map((p) => `<p>${p}</p>`).join(''));

/** Default CMS pages. Seeded everywhere (not demo data); never overwrites admin edits. */
export const DEFAULT_PAGES = [
  {
    slug: 'about',
    title: loc('About Souqly', 'سوقلی کے بارے میں', 'عن سوقلي'),
    body: loc(html(['Souqly — every shop, one souq. We bring local shops and buyers together in one trusted marketplace.']), html(['سوقلی — ہر دکان، ایک سوق۔']), html(['سوقلي — كل متجر، سوق واحد.'])),
  },
  {
    slug: 'terms',
    title: loc('Terms of Service', 'شرائط و ضوابط', 'شروط الخدمة'),
    body: loc(html(['By using Souqly you agree to these terms. Sellers are responsible for their listings; Souqly mediates disputes.']), '', ''),
  },
  {
    slug: 'privacy',
    title: loc('Privacy Policy', 'رازداری کی پالیسی', 'سياسة الخصوصية'),
    body: loc(html(['We collect only what we need to run your account and orders. We never sell your personal data.']), '', ''),
  },
  {
    slug: 'help',
    title: loc('Help Center', 'مدد', 'مركز المساعدة'),
    body: loc(html(['Track orders from My Orders. For anything else, open a support ticket from your account.']), '', ''),
  },
  {
    slug: 'seller-terms',
    title: loc('Seller Terms', 'سیلر شرائط', 'شروط البائع'),
    body: loc(html(['Sellers must list genuine products, ship on time and honour the return policy. Commission is charged per order.']), '', ''),
  },
];

export async function seedPages(): Promise<number> {
  let created = 0;
  for (const p of DEFAULT_PAGES) {
    const r = await Page.updateOne({ slug: p.slug }, { $setOnInsert: { ...p, published: true } }, { upsert: true });
    created += r.upsertedCount;
  }
  return created;
}

/** Demo data for the admin queues: moderator staff, tickets, payouts, pending stores and products. */
export async function seedAdminDemo(demoHash: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (!(await User.exists({ email: 'moderator@demo.souqly.pk' }))) {
    await User.create({ name: 'Mona Moderator', email: 'moderator@demo.souqly.pk', passwordHash: demoHash, emailVerified: true, platformRole: 'MODERATOR', referralCode: await generateReferralCode(), demo: true });
    out.moderator = 1;
  }
  if (await Ticket.exists({ demo: true })) return { ...out, skipped: 1 };

  const buyers = await User.find({ email: { $in: ['ayesha@demo.souqly.pk', 'bilal@demo.souqly.pk', 'sana@demo.souqly.pk'] } }).select('_id').lean();
  const now = Date.now();
  const tickets = [
    { subject: 'Where is my parcel?', category: 'order', priority: 'normal', status: 'open' },
    { subject: 'Refund not received in wallet', category: 'payment', priority: 'high', status: 'pending' },
    { subject: 'Cannot change my phone number', category: 'account', priority: 'low', status: 'resolved' },
  ] as const;
  for (const [i, t] of tickets.entries()) {
    const userId = buyers[i % Math.max(1, buyers.length)]?._id;
    if (!userId) break;
    await Ticket.create({ ...t, userId, messages: [{ authorId: userId, side: 'user', body: `${t.subject} — please help.`, attachments: [], at: new Date(now - (i + 1) * 3_600_000) }], lastMessageAt: new Date(now - (i + 1) * 3_600_000), demo: true });
  }
  out.tickets = tickets.length;

  const stores = await Store.find({ demo: true, status: 'approved' }).select('_id ownerId').limit(4).lean();
  for (const [i, status] of PAYOUT_STATUSES.entries()) {
    const s = stores[i % Math.max(1, stores.length)];
    if (!s) break;
    const at = new Date(now - (i + 1) * 86_400_000);
    await Payout.create({
      storeId: s._id,
      amount: 500_000 * (i + 1),
      status,
      method: { type: 'bank', bankName: 'Meezan Bank', accountTitle: 'Demo Store', accountMasked: '****4321' },
      requestedBy: s.ownerId,
      ...(status === 'approved' || status === 'paid' ? { approvedAt: at } : {}),
      ...(status === 'paid' ? { paidAt: at, reference: 'IBFT-DEMO-001' } : {}),
      ...(status === 'rejected' ? { rejectedAt: at, notes: 'Bank details did not match the store owner' } : {}),
      demo: true,
    });
  }
  out.payouts = PAYOUT_STATUSES.length;

  // Two pending store applications.
  for (const [i, name] of ['Karachi Crafts', 'Lahore Leather Co'].entries()) {
    const email = `pending${i + 1}@demo.souqly.pk`;
    if (await User.exists({ email })) continue;
    const owner = await User.create({ name: `${name} Owner`, email, passwordHash: demoHash, emailVerified: true, isSeller: true, referralCode: await generateReferralCode(), demo: true });
    const store = await Store.create({ ownerId: owner._id, name, slug: `pending-${i + 1}-${name.toLowerCase().replace(/[^a-z]+/g, '-')}`.slice(0, 40), status: 'pending', contact: { email }, address: { city: i ? 'Lahore' : 'Karachi', country: 'PK' }, demo: true });
    await StoreMember.create({ storeId: store._id, userId: owner._id, role: 'OWNER', status: 'active', demo: true });
  }
  out.pendingStores = 2;

  // Pending-review copies of a few demo products (originals stay live).
  const sources = await Product.find({ demo: true, status: 'published' }).limit(3).lean();
  for (const [i, src] of sources.entries()) {
    const { _id, createdAt, updatedAt, publishedAt, ...rest } = src;
    void _id;
    void createdAt;
    void updatedAt;
    void publishedAt;
    await Product.create({
      ...rest,
      title: `${src.title} (New listing)`.slice(0, 150),
      slug: `${src.slug}-review-${i + 1}`.slice(0, 120),
      status: 'pending_review',
      variants: src.variants.map((v) => ({ ...v, _id: new Types.ObjectId(), sku: `${v.sku}-R${i + 1}`.slice(0, 64), reserved: 0 })),
      soldCount: 0,
      ratingAvg: 0,
      ratingCount: 0,
      isFeatured: false,
      demo: true,
    });
  }
  out.pendingProducts = sources.length;
  return out;
}

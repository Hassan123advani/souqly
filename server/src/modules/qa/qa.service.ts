import type { QuestionDTO } from '@souqly/shared';
import type { Request } from 'express';
import { Types } from 'mongoose';
import { AppError } from '../../lib/AppError';
import { cursorFilter, cursorSort, paginate } from '../../lib/pagination';
import { audit } from '../audit/audit.service';
import { Product } from '../catalog/product.model';
import { notifySafe } from '../chat/notifyAdapter';
import { cleanText } from '../reviews/review.service';
import { User } from '../users/user.model';
import { Question, type QuestionLean } from './question.model';

const oid = (s: string | Types.ObjectId) => new Types.ObjectId(String(s));

async function askerNames(ids: Types.ObjectId[]) {
  const users = await User.find({ _id: { $in: ids } }).select('name preferences.privacy').lean();
  return new Map(
    users.map((u) => {
      const name = (u.name ?? 'Buyer').trim();
      return [String(u._id), u.preferences?.privacy?.showProfileInReviews === false ? `${name[0] ?? 'B'}***` : name];
    }),
  );
}

const toDTO = (q: QuestionLean, asker: string | undefined, extra: Partial<QuestionDTO> = {}): QuestionDTO => ({
  id: String(q._id),
  productId: String(q.productId),
  askerName: asker ?? 'Buyer',
  text: q.text,
  ...(q.answer ? { answer: { text: q.answer.text, at: q.answer.at.toISOString() } } : {}),
  createdAt: q.createdAt.toISOString(),
  ...extra,
});

async function productBySlug(slug: string) {
  const p = await Product.findOne({ slug, status: 'published', deletedAt: { $exists: false } }).select('_id storeId title slug').lean();
  if (!p) throw new AppError(404, 'NOT_FOUND', 'Product not found');
  return p;
}

export async function listQuestions(slug: string, q: { cursor?: string; limit: number }) {
  const p = await productBySlug(slug);
  const rows = await Question.find({ productId: p._id, status: 'published', ...cursorFilter('_id', -1, q.cursor) })
    .sort(cursorSort('_id', -1))
    .limit(q.limit + 1)
    .lean<QuestionLean[]>();
  const page = paginate(rows, q.limit, '_id');
  const names = await askerNames(page.items.map((x) => x.askerId));
  return { items: page.items.map((x) => toDTO(x, names.get(String(x.askerId)))), nextCursor: page.nextCursor };
}

export async function askQuestion(req: Request, slug: string, text: string): Promise<QuestionDTO> {
  const p = await productBySlug(slug);
  const clean = cleanText(text);
  if (!clean.text || clean.text.length < 5) throw new AppError(400, 'VALIDATION_ERROR', 'Please write a longer question');
  const q = await Question.create({ productId: p._id, storeId: p.storeId, askerId: oid(req.user!.id), text: clean.text.slice(0, 500), status: clean.flagged ? 'pending' : 'published' });
  await audit({ action: 'question.created', req, targetType: 'Question', targetId: q._id, meta: { productId: String(p._id), flagged: clean.flagged } });
  const names = await askerNames([q.askerId]);
  return toDTO(q.toObject() as QuestionLean, names.get(req.user!.id));
}

export async function sellerQuestions(storeId: Types.ObjectId, q: { unanswered?: boolean; cursor?: string; limit: number }) {
  const rows = await Question.find({ storeId, status: { $ne: 'hidden' }, ...(q.unanswered ? { answered: false } : {}), ...cursorFilter('_id', -1, q.cursor) })
    .sort(cursorSort('_id', -1))
    .limit(q.limit + 1)
    .lean<QuestionLean[]>();
  const page = paginate(rows, q.limit, '_id');
  const [names, products] = await Promise.all([
    askerNames(page.items.map((x) => x.askerId)),
    Product.find({ _id: { $in: page.items.map((x) => x.productId) }, storeId }).select('title slug').lean(),
  ]);
  const byId = new Map(products.map((p) => [String(p._id), p]));
  return {
    items: page.items.map((x) => {
      const p = byId.get(String(x.productId));
      return toDTO(x, names.get(String(x.askerId)), p ? { product: { title: p.title, slug: p.slug } } : {});
    }),
    nextCursor: page.nextCursor,
  };
}

export async function answerQuestion(req: Request, id: string, text: string): Promise<QuestionDTO> {
  const clean = cleanText(text);
  if (!clean.text) throw new AppError(400, 'VALIDATION_ERROR', 'Answer cannot be empty');
  const q = await Question.findOneAndUpdate(
    { _id: oid(id), storeId: req.store!._id, status: { $ne: 'hidden' } },
    { $set: { answer: { text: clean.text.slice(0, 1000), by: oid(req.user!.id), at: new Date() }, answered: true } },
    { new: true },
  ).lean<QuestionLean>();
  if (!q) throw new AppError(404, 'NOT_FOUND', 'Question not found');
  await audit({ action: 'question.answered', req, targetType: 'Question', targetId: q._id, meta: { flagged: clean.flagged } });
  const p = await Product.findById(q.productId).select('title slug').lean();
  void notifySafe({ userId: String(q.askerId), type: 'question.answered', title: 'Your question was answered', body: p?.title ?? 'A seller answered your question', ...(p ? { link: `/p/${p.slug}` } : {}) });
  const names = await askerNames([q.askerId]);
  return toDTO(q, names.get(String(q.askerId)));
}

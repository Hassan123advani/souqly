import type { ConversationDTO, MessageCreateInput, MessageDTO } from '@souqly/shared';
import { Types } from 'mongoose';
import { AppError } from '../../lib/AppError';
import { logger } from '../../lib/logger';
import { cursorFilter, cursorSort, paginate } from '../../lib/pagination';
import { stripHtml } from '../../lib/sanitize';
import { emitToStore, emitToUser, getIO, storeRoom } from '../../socket';
import { Product } from '../catalog/product.model';
import { Order } from '../orders/order.model';
import { maskBadWords } from '../reviews/badWords';
import { resolveOwnUploads } from '../reviews/media';
import { getChatSettings } from '../seller/storeSettings.service';
import { Store } from '../stores/store.model';
import { StoreMember } from '../stores/storeMember.model';
import { User } from '../users/user.model';
import { convRoom } from './access';
import { Conversation, Message, type ChatSide, type ConversationLean, type MessageLean } from './chat.models';
import { notifySafe } from './notifyAdapter';

const oid = (s: string | Types.ObjectId) => new Types.ObjectId(String(s));
const AUTO_REPLY_EVERY_MS = 12 * 60 * 60_000;
const other = (side: ChatSide): ChatSide => (side === 'buyer' ? 'store' : 'buyer');

export function toMessageDTO(m: MessageLean): MessageDTO {
  const card = (m.card ?? {}) as Record<string, unknown>;
  return {
    id: String(m._id),
    conversationId: String(m.conversationId),
    senderSide: m.senderSide,
    type: m.type,
    ...(m.text ? { text: m.text } : {}),
    ...(m.imageUrl ? { imageUrl: m.imageUrl } : {}),
    ...(m.type === 'product' ? { product: card as unknown as NonNullable<MessageDTO['product']> } : {}),
    ...(m.type === 'order' ? { order: card as unknown as NonNullable<MessageDTO['order']> } : {}),
    ...(m.auto ? { auto: true } : {}),
    ...(m.readAt ? { readAt: m.readAt.toISOString() } : {}),
    createdAt: m.createdAt.toISOString(),
  };
}

async function toConversationDTOs(rows: ConversationLean[], side: ChatSide): Promise<ConversationDTO[]> {
  const [stores, buyers] = await Promise.all([
    Store.find({ _id: { $in: rows.map((c) => c.storeId) } }).select('slug name logo').lean(),
    side === 'store' ? User.find({ _id: { $in: rows.map((c) => c.buyerId) } }).select('name avatar').lean() : Promise.resolve([]),
  ]);
  const sById = new Map(stores.map((s) => [String(s._id), s]));
  const bById = new Map(buyers.map((b) => [String(b._id), b]));
  return rows.map((c) => {
    const s = sById.get(String(c.storeId));
    const b = bById.get(String(c.buyerId));
    return {
      id: String(c._id),
      store: { id: String(c.storeId), slug: s?.slug ?? '', name: s?.name ?? 'Store', ...(s?.logo?.url ? { logo: s.logo.url } : {}) },
      ...(side === 'store' ? { buyer: { id: String(c.buyerId), name: b?.name ?? 'Buyer', ...(b?.avatar?.url ? { avatar: b.avatar.url } : {}) } } : {}),
      ...(c.lastMessage ? { lastMessage: { text: c.lastMessage.text, type: c.lastMessage.type as MessageDTO['type'], senderSide: c.lastMessage.senderSide, at: c.lastMessage.at.toISOString() } } : {}),
      unread: side === 'buyer' ? c.unread.buyer : c.unread.store,
      updatedAt: c.updatedAt.toISOString(),
    };
  });
}

/** One conversation as seen from `side` (same shape as the list rows). */
export async function getConversation(conv: ConversationLean, side: ChatSide): Promise<ConversationDTO> {
  const [dto] = await toConversationDTOs([conv], side);
  return dto!;
}

export async function listConversations(side: ChatSide, ownerId: Types.ObjectId, q: { cursor?: string; limit: number }) {
  const filter = side === 'buyer' ? { buyerId: ownerId } : { storeId: ownerId, lastMessage: { $exists: true } };
  const rows = await Conversation.find({ ...filter, ...cursorFilter('updatedAt', -1, q.cursor) })
    .sort(cursorSort('updatedAt', -1))
    .limit(q.limit + 1)
    .lean<ConversationLean[]>();
  const page = paginate(rows, q.limit, 'updatedAt');
  return { items: await toConversationDTOs(page.items, side), nextCursor: page.nextCursor };
}

export async function unreadCount(side: ChatSide, ownerId: Types.ObjectId): Promise<number> {
  const field = side === 'buyer' ? '$unread.buyer' : '$unread.store';
  const [r] = await Conversation.aggregate<{ n: number }>([{ $match: side === 'buyer' ? { buyerId: ownerId } : { storeId: ownerId } }, { $group: { _id: null, n: { $sum: field } } }]);
  return r?.n ?? 0;
}

export async function startConversation(userId: string, storeSlug: string, productId?: string): Promise<ConversationDTO> {
  const store = await Store.findOne({ slug: storeSlug, status: 'approved' }).select('_id').lean();
  if (!store) throw new AppError(404, 'NOT_FOUND', 'Store not found');
  if (await StoreMember.exists({ storeId: store._id, userId: oid(userId), status: 'active' })) {
    throw new AppError(400, 'OWN_STORE', 'You cannot chat with your own store');
  }
  let product: Types.ObjectId | null = null;
  if (productId) {
    const p = await Product.findOne({ _id: oid(productId), storeId: store._id, status: 'published' }).select('_id').lean();
    if (!p) throw new AppError(404, 'NOT_FOUND', 'Product not found');
    product = p._id;
  }
  let conv: ConversationLean | null;
  try {
    conv = await Conversation.findOneAndUpdate(
      { buyerId: oid(userId), storeId: store._id },
      { $setOnInsert: { buyerId: oid(userId), storeId: store._id }, ...(product ? { $set: { productId: product } } : {}) },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean<ConversationLean>();
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err;
    conv = await Conversation.findOne({ buyerId: oid(userId), storeId: store._id }).lean<ConversationLean>();
  }
  return (await toConversationDTOs([conv!], 'buyer'))[0]!;
}

export async function listMessages(conv: ConversationLean, q: { cursor?: string; limit: number }) {
  const rows = await Message.find({ conversationId: conv._id, ...cursorFilter('_id', -1, q.cursor) })
    .sort(cursorSort('_id', -1))
    .limit(q.limit + 1)
    .lean<MessageLean[]>();
  const page = paginate(rows, q.limit, '_id');
  return { items: page.items.map(toMessageDTO), nextCursor: page.nextCursor };
}

const preview = (m: Pick<MessageLean, 'type' | 'text'>) =>
  m.type === 'text' ? (m.text ?? '').slice(0, 140) : m.type === 'image' ? '[Photo]' : m.type === 'product' ? '[Product]' : '[Order]';

/** Builds message fields from the input; enforces card ownership rules. */
async function buildMessage(conv: ConversationLean, senderUserId: string, input: MessageCreateInput) {
  switch (input.type) {
    case 'text': {
      const plain = stripHtml(input.text);
      if (!plain) throw new AppError(400, 'VALIDATION_ERROR', 'Message cannot be empty');
      return { text: maskBadWords(plain).text.slice(0, 2000) };
    }
    case 'image': {
      const urls = await resolveOwnUploads(senderUserId, [{ key: input.imageKey, kind: 'chat_image' }]);
      const caption = input.text ? stripHtml(input.text) : '';
      return { imageUrl: urls.get(input.imageKey)!, ...(caption ? { text: maskBadWords(caption).text.slice(0, 500) } : {}) };
    }
    case 'product': {
      const p = await Product.findOne({ _id: oid(input.productId), status: 'published', deletedAt: { $exists: false } }).select('title slug images priceMin').lean();
      if (!p) throw new AppError(404, 'NOT_FOUND', 'Product not found');
      return { productId: p._id, card: { id: String(p._id), title: p.title, slug: p.slug, ...(p.images?.[0]?.url ? { image: p.images[0].url } : {}), price: p.priceMin } };
    }
    case 'order': {
      // The order must belong to THIS buyer and THIS store, whoever sends the card.
      const o = await Order.findOne({ _id: oid(input.orderId), buyerId: conv.buyerId, storeId: conv.storeId }).select('number status total').lean();
      if (!o) throw new AppError(404, 'NOT_FOUND', 'Order not found');
      return { orderId: o._id, card: { id: String(o._id), number: o.number, status: o.status, total: o.total } };
    }
  }
}

function broadcast(conv: ConversationLean, dto: MessageDTO, unread: { buyer: number; store: number }) {
  getIO()?.to(convRoom(conv._id)).emit('chat:message', dto);
  // List badges only: no message text goes to the store-wide room (not every member has chat access).
  emitToUser(String(conv.buyerId), 'chat:conversation', { id: String(conv._id), unread: unread.buyer });
  emitToStore(String(conv.storeId), 'chat:conversation', { id: String(conv._id), unread: unread.store });
}

async function insertMessage(conv: ConversationLean, side: ChatSide, senderId: Types.ObjectId, fields: Record<string, unknown>, type: MessageLean['type'], auto = false) {
  const now = new Date();
  const msg = (await Message.create({ conversationId: conv._id, storeId: conv.storeId, senderId, senderSide: side, type, auto, ...fields })).toObject() as MessageLean;
  const update: Record<string, unknown> = {
    $set: { lastMessage: { text: preview(msg), type, senderSide: side, at: now } },
    $inc: { [`unread.${other(side)}`]: 1 } as Record<string, number>,
  };
  let responseHours: number | null = null;
  if (!auto && side === 'buyer' && !conv.pendingSince) {
    (update.$set as Record<string, unknown>).pendingSince = now;
    (update.$inc as Record<string, number>)['stats.asked'] = 1;
  }
  if (!auto && side === 'store' && conv.pendingSince) {
    responseHours = (now.getTime() - new Date(conv.pendingSince).getTime()) / 3_600_000;
    (update.$set as Record<string, unknown>).pendingSince = null;
    (update.$inc as Record<string, number>)['stats.answered'] = 1;
    (update.$inc as Record<string, number>)['stats.responseHours'] = responseHours;
  }
  const fresh = await Conversation.findByIdAndUpdate(conv._id, update, { new: true }).lean<ConversationLean>();
  const dto = toMessageDTO(msg);
  broadcast(conv, dto, fresh?.unread ?? conv.unread);
  if (responseHours !== null) void updateStoreResponseStats(conv.storeId);
  return { dto, conv: fresh ?? conv };
}

export async function sendMessage(conv: ConversationLean, side: ChatSide, senderUserId: string, input: MessageCreateInput): Promise<MessageDTO> {
  const fields = await buildMessage(conv, senderUserId, input);
  const { dto, conv: fresh } = await insertMessage(conv, side, oid(senderUserId), fields, input.type);
  if (side === 'buyer') void maybeAutoReply(fresh);
  else {
    const store = await Store.findById(conv.storeId).select('name').lean();
    void notifySafe({ userId: String(conv.buyerId), type: 'chat.message', title: store?.name ?? 'New message', body: preview({ type: input.type, text: dto.text }), link: `/chat/${conv._id}`, channels: ['inapp', 'push'] });
  }
  return dto;
}

/** Whether any socket is connected to the store room (staff online). */
async function staffOnline(storeId: Types.ObjectId): Promise<boolean> {
  const io = getIO();
  if (!io) return false;
  try {
    return (await io.in(storeRoom(String(storeId))).fetchSockets()).length > 0;
  } catch {
    return false;
  }
}

/** Store auto-reply: at most once per conversation per 12h, only while no staff member is online. */
export async function maybeAutoReply(conv: ConversationLean): Promise<boolean> {
  try {
    const settings = await getChatSettings(conv.storeId);
    const auto = settings.autoReply;
    if (!auto?.enabled || !auto.message?.trim()) return false;
    if (await staffOnline(conv.storeId)) return false;
    const since = new Date(Date.now() - AUTO_REPLY_EVERY_MS);
    const claimed = await Conversation.findOneAndUpdate(
      { _id: conv._id, $or: [{ autoReplyAt: null }, { autoReplyAt: { $lt: since } }] },
      { $set: { autoReplyAt: new Date() } },
      { new: true },
    ).lean<ConversationLean>();
    if (!claimed) return false;
    const store = await Store.findById(conv.storeId).select('ownerId').lean();
    if (!store) return false;
    await insertMessage(claimed, 'store', store.ownerId, { text: stripHtml(auto.message).slice(0, 2000) }, 'text', true);
    return true;
  } catch (err) {
    logger.warn({ err }, 'Chat auto-reply failed');
    return false;
  }
}

/** Store.responseRate (% of buyer threads answered) and responseTimeHours (mean first response). */
export async function updateStoreResponseStats(storeId: Types.ObjectId): Promise<void> {
  try {
    const [r] = await Conversation.aggregate<{ asked: number; answered: number; hours: number }>([
      { $match: { storeId } },
      { $group: { _id: null, asked: { $sum: '$stats.asked' }, answered: { $sum: '$stats.answered' }, hours: { $sum: '$stats.responseHours' } } },
    ]);
    if (!r || r.asked <= 0) return;
    const responseRate = Math.min(100, Math.round((r.answered / r.asked) * 100));
    const responseTimeHours = r.answered > 0 ? Math.round((r.hours / r.answered) * 10) / 10 : 24;
    await Store.updateOne({ _id: storeId }, { $set: { responseRate, responseTimeHours } });
  } catch (err) {
    logger.warn({ err }, 'Store response stats update failed');
  }
}

export async function markRead(conv: ConversationLean, side: ChatSide): Promise<{ read: number }> {
  const now = new Date();
  const r = await Message.updateMany({ conversationId: conv._id, senderSide: other(side), readAt: null }, { $set: { readAt: now } });
  await Conversation.updateOne({ _id: conv._id }, { $set: { [`unread.${side}`]: 0 } });
  getIO()?.to(convRoom(conv._id)).emit('chat:read', { conversationId: String(conv._id), side, at: now.toISOString() });
  return { read: r.modifiedCount };
}

export async function quickReplies(storeId: Types.ObjectId): Promise<string[]> {
  return (await getChatSettings(storeId)).quickReplies ?? [];
}

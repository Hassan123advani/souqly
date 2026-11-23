import { PERMISSIONS, conversationCreateSchema, idParamsSchema, messageCreateSchema, messageListQuerySchema, pageQuerySchema } from '@souqly/shared';
import { Router, type Request } from 'express';
import { Types } from 'mongoose';
import { AppError } from '../../lib/AppError';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/auth';
import { requirePermission } from '../../middleware/permissions';
import { storeContext } from '../../middleware/storeContext';
import { validate } from '../../middleware/validate';
import { socialLimits } from '../loyalty/limits';
import { Conversation, type ConversationLean } from './chat.models';
import * as svc from './chat.service';

/** Buyer conversation: only the buyer's own (404 otherwise, no enumeration). */
async function buyerConv(req: Request): Promise<ConversationLean> {
  const c = await Conversation.findOne({ _id: new Types.ObjectId(String(req.params.id)), buyerId: new Types.ObjectId(req.user!.id) }).lean<ConversationLean>();
  if (!c) throw new AppError(404, 'NOT_FOUND', 'Conversation not found');
  return c;
}

/** Seller conversation: storeId comes ONLY from req.store. */
async function storeConv(req: Request): Promise<ConversationLean> {
  const c = await Conversation.findOne({ _id: new Types.ObjectId(String(req.params.id)), storeId: req.store!._id }).lean<ConversationLean>();
  if (!c) throw new AppError(404, 'NOT_FOUND', 'Conversation not found');
  return c;
}

/** Mounted at `/chat`. */
export const chatRouter = Router();
chatRouter.use(requireAuth);

chatRouter.get(
  '/conversations',
  validate({ query: pageQuerySchema }),
  asyncHandler(async (req, res) => {
    const { items, nextCursor } = await svc.listConversations('buyer', new Types.ObjectId(req.user!.id), req.query as never);
    res.json({ data: items, meta: { nextCursor } });
  }),
);

chatRouter.get(
  '/unread',
  asyncHandler(async (req, res) => {
    res.json({ data: { unread: await svc.unreadCount('buyer', new Types.ObjectId(req.user!.id)) } });
  }),
);

chatRouter.post(
  '/conversations',
  socialLimits.chat,
  validate({ body: conversationCreateSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await svc.startConversation(req.user!.id, req.body.storeSlug, req.body.productId) });
  }),
);

chatRouter.get(
  '/conversations/:id/messages',
  validate({ params: idParamsSchema, query: messageListQuerySchema }),
  asyncHandler(async (req, res) => {
    const { items, nextCursor } = await svc.listMessages(await buyerConv(req), req.query as never);
    res.json({ data: items, meta: { nextCursor } });
  }),
);

chatRouter.post(
  '/conversations/:id/messages',
  socialLimits.chat,
  validate({ params: idParamsSchema, body: messageCreateSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await svc.sendMessage(await buyerConv(req), 'buyer', req.user!.id, req.body) });
  }),
);

chatRouter.post(
  '/conversations/:id/read',
  validate({ params: idParamsSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.markRead(await buyerConv(req), 'buyer') });
  }),
);

/** Mounted at `/seller/chat` (requireAuth + storeContext + store.chat.manage). */
export const sellerChatRouter = Router();
sellerChatRouter.use(requireAuth, storeContext, requirePermission(PERMISSIONS.STORE_CHAT_MANAGE));

sellerChatRouter.get(
  '/conversations',
  validate({ query: pageQuerySchema }),
  asyncHandler(async (req, res) => {
    const { items, nextCursor } = await svc.listConversations('store', req.store!._id, req.query as never);
    res.json({ data: items, meta: { nextCursor } });
  }),
);

sellerChatRouter.get(
  '/unread',
  asyncHandler(async (req, res) => {
    res.json({ data: { unread: await svc.unreadCount('store', req.store!._id) } });
  }),
);

sellerChatRouter.get(
  '/quick-replies',
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.quickReplies(req.store!._id) });
  }),
);

sellerChatRouter.get(
  '/conversations/:id/messages',
  validate({ params: idParamsSchema, query: messageListQuerySchema }),
  asyncHandler(async (req, res) => {
    const { items, nextCursor } = await svc.listMessages(await storeConv(req), req.query as never);
    res.json({ data: items, meta: { nextCursor } });
  }),
);

sellerChatRouter.post(
  '/conversations/:id/messages',
  socialLimits.chat,
  validate({ params: idParamsSchema, body: messageCreateSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await svc.sendMessage(await storeConv(req), 'store', req.user!.id, req.body) });
  }),
);

sellerChatRouter.post(
  '/conversations/:id/read',
  validate({ params: idParamsSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.markRead(await storeConv(req), 'store') });
  }),
);

import { PERMISSIONS } from '@souqly/shared';
import { Types } from 'mongoose';
import { resolveMemberPermissions } from '../../middleware/storeContext';
import { Store } from '../stores/store.model';
import { StoreMember } from '../stores/storeMember.model';
import { Conversation, type ChatSide, type ConversationLean } from './chat.models';

export const convRoom = (id: string | Types.ObjectId) => `conv:${id}`;

/** True when the user is an active member of the store with chat permission (and the store is not locked). */
export async function canManageStoreChat(userId: string, storeId: Types.ObjectId | string): Promise<boolean> {
  const member = await StoreMember.findOne({ storeId: new Types.ObjectId(String(storeId)), userId: new Types.ObjectId(userId), status: 'active' });
  if (!member) return false;
  const store = await Store.findById(member.storeId).select('status').lean();
  if (!store || store.status === 'suspended' || store.status === 'rejected') return false;
  return (await resolveMemberPermissions(member)).includes(PERMISSIONS.STORE_CHAT_MANAGE);
}

/**
 * Who may see a conversation: its buyer, or members of its store holding `store.chat.manage`.
 * Returns null otherwise (callers answer 404 / refuse the socket join).
 */
export async function canAccessConversation(
  userId: string,
  conversationId: Types.ObjectId | string,
): Promise<{ conv: ConversationLean; side: ChatSide; storeId: Types.ObjectId } | null> {
  if (!Types.ObjectId.isValid(String(conversationId))) return null;
  const conv = await Conversation.findById(new Types.ObjectId(String(conversationId))).lean<ConversationLean>();
  if (!conv) return null;
  if (String(conv.buyerId) === userId) return { conv, side: 'buyer', storeId: conv.storeId };
  if (await canManageStoreChat(userId, conv.storeId)) return { conv, side: 'store', storeId: conv.storeId };
  return null;
}

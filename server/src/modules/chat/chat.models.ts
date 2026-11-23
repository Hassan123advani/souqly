import { Schema, Types, model } from 'mongoose';

export type ChatSide = 'buyer' | 'store';

export interface IConversation {
  buyerId: Types.ObjectId;
  storeId: Types.ObjectId;
  /** Product the buyer opened the chat from (context only). */
  productId?: Types.ObjectId | null;
  lastMessage?: { text: string; type: string; senderSide: ChatSide; at: Date };
  unread: { buyer: number; store: number };
  /** Last auto-reply (sent at most once per 12h). */
  autoReplyAt?: Date | null;
  /** Oldest unanswered buyer message (response-time tracking). */
  pendingSince?: Date | null;
  stats: { asked: number; answered: number; responseHours: number };
  demo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const conversationSchema = new Schema<IConversation>(
  {
    buyerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', default: null },
    lastMessage: { type: new Schema({ text: String, type: { type: String }, senderSide: String, at: Date }, { _id: false }), default: undefined },
    unread: { buyer: { type: Number, default: 0 }, store: { type: Number, default: 0 } },
    autoReplyAt: { type: Date, default: null },
    pendingSince: { type: Date, default: null },
    stats: { asked: { type: Number, default: 0 }, answered: { type: Number, default: 0 }, responseHours: { type: Number, default: 0 } },
    demo: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);
conversationSchema.index({ buyerId: 1, storeId: 1 }, { unique: true });
conversationSchema.index({ storeId: 1, updatedAt: -1 });
conversationSchema.index({ buyerId: 1, updatedAt: -1 });
export const Conversation = model<IConversation>('Conversation', conversationSchema);
export type ConversationLean = IConversation & { _id: Types.ObjectId };

export interface IMessage {
  conversationId: Types.ObjectId;
  /** Denormalised for tenant-scoped queries. */
  storeId: Types.ObjectId;
  senderId: Types.ObjectId;
  senderSide: ChatSide;
  type: 'text' | 'image' | 'product' | 'order';
  text?: string;
  imageUrl?: string;
  productId?: Types.ObjectId;
  orderId?: Types.ObjectId;
  /** Snapshot shown on product / order cards. */
  card?: Record<string, unknown>;
  auto: boolean;
  readAt?: Date | null;
  demo: boolean;
  createdAt: Date;
}

const messageSchema = new Schema<IMessage>(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    senderSide: { type: String, enum: ['buyer', 'store'], required: true },
    type: { type: String, enum: ['text', 'image', 'product', 'order'], required: true },
    text: { type: String, maxlength: 2000 },
    imageUrl: String,
    productId: { type: Schema.Types.ObjectId, ref: 'Product' },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    card: { type: Schema.Types.Mixed },
    auto: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
    demo: { type: Boolean, default: false, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
messageSchema.index({ conversationId: 1, _id: -1 });
messageSchema.index({ conversationId: 1, senderSide: 1, readAt: 1 });
messageSchema.index({ storeId: 1, createdAt: -1 });
export const Message = model<IMessage>('Message', messageSchema);
export type MessageLean = IMessage & { _id: Types.ObjectId };

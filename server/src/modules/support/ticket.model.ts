import { Schema, model, type Types } from 'mongoose';

export const TICKET_STATUSES = ['open', 'pending', 'resolved', 'closed'] as const;
export const TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export const TICKET_CATEGORIES = ['order', 'payment', 'account', 'seller', 'technical', 'other'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export interface ITicketMessage {
  authorId: Types.ObjectId;
  side: 'user' | 'staff';
  body: string;
  attachments: { url: string; key: string }[];
  at: Date;
}

export interface ITicket {
  userId: Types.ObjectId;
  subject: string;
  category: (typeof TICKET_CATEGORIES)[number];
  priority: (typeof TICKET_PRIORITIES)[number];
  status: TicketStatus;
  messages: ITicketMessage[];
  assigneeId?: Types.ObjectId | null;
  orderId?: Types.ObjectId;
  lastMessageAt: Date;
  demo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<ITicket>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    subject: { type: String, required: true, trim: true, maxlength: 160 },
    category: { type: String, enum: TICKET_CATEGORIES, default: 'other' },
    priority: { type: String, enum: TICKET_PRIORITIES, default: 'normal' },
    status: { type: String, enum: TICKET_STATUSES, default: 'open' },
    messages: [
      {
        authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        side: { type: String, enum: ['user', 'staff'], required: true },
        body: { type: String, required: true, maxlength: 5000 },
        attachments: { type: [{ url: String, key: String, _id: false }], default: [] },
        at: { type: Date, default: () => new Date() },
        _id: false,
      },
    ],
    assigneeId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    lastMessageAt: { type: Date, default: () => new Date() },
    demo: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);
schema.index({ userId: 1, createdAt: -1 });
schema.index({ status: 1, lastMessageAt: -1 });
schema.index({ assigneeId: 1, status: 1 });

export const Ticket = model<ITicket>('Ticket', schema);
export type TicketLean = ITicket & { _id: Types.ObjectId };

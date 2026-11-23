import { RETURN_REASONS, RETURN_STATUSES, type ReturnReason, type ReturnStatus } from '@souqly/shared';
import { Schema, Types, model, type HydratedDocument } from 'mongoose';

export interface IReturnItem {
  variantId: Types.ObjectId;
  productId: Types.ObjectId;
  title: string;
  image?: string;
  options: Record<string, string>;
  price: number;
  qty: number;
  reason?: ReturnReason;
}

export interface IReturnRequest {
  orderId: Types.ObjectId;
  orderNumber: string;
  storeId: Types.ObjectId;
  buyerId: Types.ObjectId;
  items: IReturnItem[];
  reason: ReturnReason;
  description: string;
  photos: { key: string; url: string }[];
  status: ReturnStatus;
  refund: { method: 'wallet' | 'original'; amount: number; at?: Date; transactionId?: string };
  timeline: { status: ReturnStatus; at: Date; by: Types.ObjectId | null; actor: string; note?: string }[];
  sellerNote?: string;
  disputeId?: Types.ObjectId;
  restocked: boolean;
  demo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const returnSchema = new Schema<IReturnRequest>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    orderNumber: { type: String, required: true },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    buyerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    items: [
      {
        variantId: { type: Schema.Types.ObjectId, required: true },
        productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
        title: { type: String, required: true },
        image: String,
        options: { type: Schema.Types.Mixed, default: {} },
        price: { type: Number, required: true, min: 0 },
        qty: { type: Number, required: true, min: 1 },
        reason: { type: String, enum: RETURN_REASONS },
        _id: false,
      },
    ],
    reason: { type: String, enum: RETURN_REASONS, required: true },
    description: { type: String, default: '', maxlength: 2000 },
    photos: [{ key: String, url: String, _id: false }],
    status: { type: String, enum: RETURN_STATUSES, default: 'requested' },
    refund: {
      method: { type: String, enum: ['wallet', 'original'], default: 'wallet' },
      amount: { type: Number, default: 0, min: 0 },
      at: Date,
      transactionId: String,
    },
    timeline: [
      {
        status: { type: String, enum: RETURN_STATUSES, required: true },
        at: { type: Date, required: true },
        by: { type: Schema.Types.ObjectId, ref: 'User', default: null },
        actor: { type: String, default: 'system' },
        note: String,
        _id: false,
      },
    ],
    sellerNote: { type: String, maxlength: 1000 },
    disputeId: { type: Schema.Types.ObjectId, ref: 'Dispute' },
    restocked: { type: Boolean, default: false },
    demo: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

returnSchema.index({ storeId: 1, status: 1, createdAt: -1 });
returnSchema.index({ storeId: 1, createdAt: -1 });
returnSchema.index({ buyerId: 1, createdAt: -1 });
// One return request per order.
returnSchema.index({ orderId: 1 }, { unique: true });

export const ReturnRequest = model<IReturnRequest>('ReturnRequest', returnSchema);
export type ReturnRequestDoc = HydratedDocument<IReturnRequest>;
export type ReturnRequestLean = IReturnRequest & { _id: Types.ObjectId };

// ---------- Dispute (admin handles it in Phase 9) ----------
export interface IDispute {
  returnId?: Types.ObjectId;
  orderId: Types.ObjectId;
  buyerId: Types.ObjectId;
  storeId: Types.ObjectId;
  status: 'open' | 'resolved';
  messages: { by: Types.ObjectId; actor: string; text: string; at: Date }[];
  resolution?: string;
  demo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const disputeSchema = new Schema<IDispute>(
  {
    returnId: { type: Schema.Types.ObjectId, ref: 'ReturnRequest' },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    buyerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    status: { type: String, enum: ['open', 'resolved'], default: 'open' },
    messages: [{ by: { type: Schema.Types.ObjectId, ref: 'User' }, actor: String, text: { type: String, maxlength: 2000 }, at: Date, _id: false }],
    resolution: { type: String, maxlength: 2000 },
    demo: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);
disputeSchema.index({ status: 1, createdAt: -1 });
disputeSchema.index({ storeId: 1, createdAt: -1 });
disputeSchema.index({ buyerId: 1, createdAt: -1 });
disputeSchema.index({ returnId: 1 }, { unique: true, partialFilterExpression: { returnId: { $exists: true } } });

export const Dispute = model<IDispute>('Dispute', disputeSchema);

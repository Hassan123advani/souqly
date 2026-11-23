import { REVIEW_STATUSES, type ReviewStatus } from '@souqly/shared';
import { Schema, Types, model } from 'mongoose';

export interface IReview {
  productId: Types.ObjectId;
  storeId: Types.ObjectId;
  /** Null only for unverified (seed) reviews. */
  orderId: Types.ObjectId | null;
  variantId: Types.ObjectId | null;
  buyerId: Types.ObjectId;
  rating: number;
  title?: string;
  body?: string;
  variantLabel?: string;
  media: { type: 'image' | 'video'; url: string; key: string }[];
  hasMedia: boolean;
  verified: boolean;
  status: ReviewStatus;
  /** Why the review is pending: bad_words | reports | fraud */
  flags: string[];
  helpfulCount: number;
  reportCount: number;
  reply?: { text: string; by: Types.ObjectId; at: Date };
  ip?: string;
  demo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IReview>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', default: null },
    variantId: { type: Schema.Types.ObjectId, default: null },
    buyerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, maxlength: 120 },
    body: { type: String, maxlength: 3000 },
    variantLabel: { type: String, maxlength: 200 },
    media: { type: [new Schema({ type: { type: String, enum: ['image', 'video'], required: true }, url: String, key: String }, { _id: false })], default: [] },
    hasMedia: { type: Boolean, default: false },
    verified: { type: Boolean, default: false },
    status: { type: String, enum: REVIEW_STATUSES, default: 'published' },
    flags: { type: [String], default: [] },
    helpfulCount: { type: Number, default: 0 },
    reportCount: { type: Number, default: 0 },
    reply: { type: { text: String, by: Schema.Types.ObjectId, at: Date, _id: false }, default: undefined },
    ip: { type: String, maxlength: 64, select: false },
    demo: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

// One review per order item (verified reviews); unverified seed reviews have orderId null.
schema.index({ orderId: 1, productId: 1, variantId: 1 }, { unique: true, partialFilterExpression: { orderId: { $type: 'objectId' } } });
schema.index({ productId: 1, status: 1, createdAt: -1 });
schema.index({ productId: 1, status: 1, helpfulCount: -1 });
schema.index({ productId: 1, status: 1, rating: -1 });
schema.index({ storeId: 1, createdAt: -1 });
schema.index({ buyerId: 1, createdAt: -1 });

export const Review = model<IReview>('Review', schema);
export type ReviewLean = IReview & { _id: Types.ObjectId };

export interface IReviewVote {
  reviewId: Types.ObjectId;
  userId: Types.ObjectId;
  createdAt: Date;
}
const voteSchema = new Schema<IReviewVote>(
  {
    reviewId: { type: Schema.Types.ObjectId, ref: 'Review', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
voteSchema.index({ reviewId: 1, userId: 1 }, { unique: true });
voteSchema.index({ userId: 1, reviewId: 1 });
export const ReviewVote = model<IReviewVote>('ReviewVote', voteSchema);

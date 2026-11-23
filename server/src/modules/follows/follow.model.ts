import { Schema, Types, model } from 'mongoose';

export interface IFollow {
  userId: Types.ObjectId;
  storeId: Types.ObjectId;
  demo: boolean;
  createdAt: Date;
}

const schema = new Schema<IFollow>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    demo: { type: Boolean, default: false, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

schema.index({ userId: 1, storeId: 1 }, { unique: true });
schema.index({ userId: 1, createdAt: -1 });
schema.index({ storeId: 1, createdAt: -1 });

/** Model name `Follow` is also what the voucher service looks up for follower-only vouchers. */
export const Follow = model<IFollow>('Follow', schema);
export type FollowLean = IFollow & { _id: Types.ObjectId };

import { Schema, Types, model } from 'mongoose';

export interface IQuestion {
  productId: Types.ObjectId;
  storeId: Types.ObjectId;
  askerId: Types.ObjectId;
  text: string;
  /** `pending` when the text tripped the bad-words filter (moderation). */
  status: 'published' | 'pending' | 'hidden';
  answer?: { text: string; by: Types.ObjectId; at: Date };
  answered: boolean;
  demo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IQuestion>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    askerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, maxlength: 500 },
    status: { type: String, enum: ['published', 'pending', 'hidden'], default: 'published' },
    answer: { type: { text: String, by: Schema.Types.ObjectId, at: Date, _id: false }, default: undefined },
    answered: { type: Boolean, default: false },
    demo: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

schema.index({ productId: 1, status: 1, _id: -1 });
schema.index({ storeId: 1, answered: 1, _id: -1 });
schema.index({ askerId: 1, createdAt: -1 });

export const Question = model<IQuestion>('Question', schema);
export type QuestionLean = IQuestion & { _id: Types.ObjectId };

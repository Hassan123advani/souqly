import { Schema, model, type Types } from 'mongoose';

export type Localized = { en: string; ur: string; ar: string };

/** Static CMS page (About, Terms, ...). `body` is sanitized HTML per locale. */
export interface IPage {
  slug: string;
  title: Localized;
  body: Localized;
  published: boolean;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const loc = (max: number) => ({ en: { type: String, default: '', maxlength: max }, ur: { type: String, default: '', maxlength: max }, ar: { type: String, default: '', maxlength: max } });

const schema = new Schema<IPage>(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 80 },
    title: loc(160),
    body: loc(100_000),
    published: { type: Boolean, default: false },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
schema.index({ published: 1, slug: 1 });

export const Page = model<IPage>('Page', schema);
export type PageLean = IPage & { _id: Types.ObjectId };

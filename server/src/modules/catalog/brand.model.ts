import { Schema, model, type HydratedDocument } from 'mongoose';

export interface IBrand {
  name: string;
  slug: string;
  logo?: string;
  description?: string;
  isFeatured: boolean;
  demo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const brandSchema = new Schema<IBrand>(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    logo: String,
    description: { type: String, maxlength: 500 },
    isFeatured: { type: Boolean, default: false },
    demo: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);
brandSchema.index({ isFeatured: 1, name: 1 });

export const Brand = model<IBrand>('Brand', brandSchema);
export type BrandDoc = HydratedDocument<IBrand>;

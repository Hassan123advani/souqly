import { ATTRIBUTE_TYPES, type AttributeDef } from '@souqly/shared';
import { Schema, Types, model, type HydratedDocument } from 'mongoose';

export type Localized = { en: string; ur: string; ar: string };

export interface ICategory {
  name: Localized;
  slug: string;
  parentId: Types.ObjectId | null;
  ancestors: { _id: Types.ObjectId; slug: string; name: Localized }[];
  icon: string;
  image?: string;
  color?: string;
  order: number;
  attributes: AttributeDef[];
  commissionBps?: number;
  isActive: boolean;
  demo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const localized = { en: { type: String, required: true, trim: true }, ur: { type: String, default: '' }, ar: { type: String, default: '' } };

const attributeDefSchema = new Schema<AttributeDef>(
  {
    key: { type: String, required: true },
    label: localized,
    type: { type: String, enum: ATTRIBUTE_TYPES, required: true },
    options: { type: [String], default: undefined },
    filterable: { type: Boolean, default: false },
    variantDefining: { type: Boolean, default: false },
    unit: String,
  },
  { _id: false },
);

const categorySchema = new Schema<ICategory>(
  {
    name: localized,
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    parentId: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    ancestors: [{ _id: { type: Schema.Types.ObjectId, ref: 'Category' }, slug: String, name: localized }],
    icon: { type: String, default: 'Tag' },
    image: String,
    color: String,
    order: { type: Number, default: 0 },
    attributes: { type: [attributeDefSchema], default: [] },
    commissionBps: Number,
    isActive: { type: Boolean, default: true },
    demo: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);
categorySchema.index({ parentId: 1, order: 1 });

export const Category = model<ICategory>('Category', categorySchema);
export type CategoryDoc = HydratedDocument<ICategory>;

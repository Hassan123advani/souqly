import { Schema, Types, model, type HydratedDocument } from 'mongoose';

/** Store-defined role: a named subset of store.* permissions. Members reference it via customRoleId. */
export interface ICustomRole {
  storeId: Types.ObjectId;
  name: string;
  permissions: string[];
  createdAt: Date;
  updatedAt: Date;
}

const customRoleSchema = new Schema<ICustomRole>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    permissions: { type: [String], default: [] },
  },
  { timestamps: true },
);
customRoleSchema.index({ storeId: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

export const CustomRole = model<ICustomRole>('CustomRole', customRoleSchema);
export type CustomRoleDoc = HydratedDocument<ICustomRole>;

import { STORE_ROLES, type StoreRole } from '@souqly/shared';
import { Schema, Types, model, type HydratedDocument } from 'mongoose';

/** Membership of a user in a store. The ONLY source of a user's store access (see D-005). */
export interface IStoreMember {
  storeId: Types.ObjectId;
  userId: Types.ObjectId;
  role: StoreRole;
  customRoleId?: Types.ObjectId;
  /** Explicit permissions when a custom role is used; otherwise derived from `role`. */
  permissions: string[];
  status: 'active' | 'invited' | 'disabled';
  demo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const storeMemberSchema = new Schema<IStoreMember>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: STORE_ROLES, required: true },
    customRoleId: { type: Schema.Types.ObjectId },
    permissions: { type: [String], default: [] },
    status: { type: String, enum: ['active', 'invited', 'disabled'], default: 'active' },
    demo: { type: Boolean, default: false },
  },
  { timestamps: true },
);
storeMemberSchema.index({ storeId: 1, userId: 1 }, { unique: true });
storeMemberSchema.index({ userId: 1, status: 1, createdAt: 1 });

export const StoreMember = model<IStoreMember>('StoreMember', storeMemberSchema);
export type StoreMemberDoc = HydratedDocument<IStoreMember>;

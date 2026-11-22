import type { AddressInput } from '@souqly/shared';
import { Schema, Types, model, type HydratedDocument } from 'mongoose';

export type IAddress = AddressInput & { userId: Types.ObjectId; demo: boolean; createdAt: Date; updatedAt: Date };

const addressSchema = new Schema<IAddress>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    label: { type: String, default: 'Home', maxlength: 30 },
    fullName: { type: String, required: true, maxlength: 80 },
    phone: { type: String, required: true, maxlength: 20 },
    country: { type: String, default: 'PK', maxlength: 2 },
    city: { type: String, required: true, maxlength: 60 },
    area: { type: String, maxlength: 80 },
    line1: { type: String, required: true, maxlength: 160 },
    line2: { type: String, maxlength: 160 },
    postalCode: { type: String, maxlength: 12 },
    location: { type: new Schema({ lat: Number, lng: Number }, { _id: false }), default: undefined },
    isDefault: { type: Boolean, default: false },
    demo: { type: Boolean, default: false },
  },
  { timestamps: true },
);
addressSchema.index({ userId: 1, isDefault: -1, createdAt: -1 });

export const Address = model<IAddress>('Address', addressSchema);
export type AddressDoc = HydratedDocument<IAddress>;

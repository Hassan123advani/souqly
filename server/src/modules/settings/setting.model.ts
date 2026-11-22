import { Schema, model } from 'mongoose';

/** Key/value platform settings editable by admins (e.g. `featureFlags`, `site`). */
export interface ISetting {
  key: string;
  value: unknown;
  updatedAt: Date;
}

const settingSchema = new Schema<ISetting>(
  {
    key: { type: String, required: true, unique: true, trim: true, maxlength: 100 },
    value: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: false, updatedAt: true }, minimize: false },
);

export const Setting = model<ISetting>('Setting', settingSchema);

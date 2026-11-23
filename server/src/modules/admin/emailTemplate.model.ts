import { Schema, model, type Types } from 'mongoose';

/** Admin override of a built-in email template (subject + HTML with {{var}} placeholders). */
export interface IEmailTemplateOverride {
  key: string;
  subject: string;
  html: string;
  updatedBy?: Types.ObjectId;
  updatedAt: Date;
}

const schema = new Schema<IEmailTemplateOverride>(
  {
    key: { type: String, required: true, unique: true, maxlength: 60 },
    subject: { type: String, required: true, maxlength: 200 },
    html: { type: String, required: true, maxlength: 100_000 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: { createdAt: false, updatedAt: true } },
);

export const EmailTemplateOverride = model<IEmailTemplateOverride>('EmailTemplateOverride', schema);

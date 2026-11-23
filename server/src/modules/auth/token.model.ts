import { Schema, Types, model } from 'mongoose';

/** `google_2fa`: short-lived ticket issued by the Google callback when the account has 2FA (POST /auth/google/2fa). */
export const TOKEN_TYPES = ['verify_email', 'reset_password', 'change_email', 'google_2fa'] as const;
export type TokenType = (typeof TOKEN_TYPES)[number];

/** Single-use emailed tokens. Only sha256(token) is stored. */
export interface IToken {
  type: TokenType;
  userId: Types.ObjectId;
  tokenHash: string;
  /** For verify_email: the address the token was sent to (must still match the user's email). */
  email?: string;
  expiresAt: Date;
  usedAt?: Date;
  /** Failed attempts against this token (google_2fa tickets die after 5). */
  attempts: number;
  /** google_2fa: validated relative path to return to after sign-in. */
  next?: string;
  createdAt: Date;
}

const tokenSchema = new Schema<IToken>({
  type: { type: String, enum: TOKEN_TYPES, required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  tokenHash: { type: String, required: true, unique: true },
  email: { type: String },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date },
  attempts: { type: Number, default: 0 },
  next: { type: String, maxlength: 300 },
  createdAt: { type: Date, default: () => new Date() },
});
tokenSchema.index({ userId: 1, type: 1 });
tokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Token = model<IToken>('Token', tokenSchema);

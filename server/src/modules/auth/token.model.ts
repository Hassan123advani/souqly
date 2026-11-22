import { Schema, Types, model } from 'mongoose';

export const TOKEN_TYPES = ['verify_email', 'reset_password', 'change_email'] as const;
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
  createdAt: Date;
}

const tokenSchema = new Schema<IToken>({
  type: { type: String, enum: TOKEN_TYPES, required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  tokenHash: { type: String, required: true, unique: true },
  email: { type: String },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date },
  createdAt: { type: Date, default: () => new Date() },
});
tokenSchema.index({ userId: 1, type: 1 });
tokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Token = model<IToken>('Token', tokenSchema);

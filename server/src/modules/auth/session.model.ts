import { Schema, Types, model, type HydratedDocument } from 'mongoose';

/**
 * One login on one device. The refresh token is `<sessionId>.<secret>`; only sha256(token) is stored.
 * Rotation creates a new Session and marks the old one revoked with `replacedBy` (used for reuse detection).
 */
export interface ISession {
  userId: Types.ObjectId;
  refreshTokenHash: string;
  userAgent: string;
  ip: string;
  /** Time of the original login (kept across rotations). */
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
  replacedBy?: Types.ObjectId;
  impersonatorId?: Types.ObjectId;
}

const sessionSchema = new Schema<ISession>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  refreshTokenHash: { type: String, required: true },
  userAgent: { type: String, default: '', maxlength: 300 },
  ip: { type: String, default: '', maxlength: 64 },
  createdAt: { type: Date, default: () => new Date() },
  lastUsedAt: { type: Date, default: () => new Date() },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date },
  replacedBy: { type: Schema.Types.ObjectId, ref: 'Session' },
  impersonatorId: { type: Schema.Types.ObjectId, ref: 'User' },
});

sessionSchema.index({ userId: 1, revokedAt: 1 });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = model<ISession>('Session', sessionSchema);
export type SessionDoc = HydratedDocument<ISession>;

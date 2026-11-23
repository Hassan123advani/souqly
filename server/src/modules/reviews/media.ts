import { SOCIAL_UPLOAD_KINDS, socialUploadSchema, type SocialUploadKind } from '@souqly/shared';
import { Router } from 'express';
import multer from 'multer';
import { Schema, Types, model } from 'mongoose';
import { AppError } from '../../lib/AppError';
import { asyncHandler } from '../../lib/asyncHandler';
import { IMAGE_UPLOAD_MIME, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, VIDEO_UPLOAD_MIME, sniffMime } from '../../lib/fileType';
import { requireAuth } from '../../middleware/auth';
import { getStorage } from '../../services/storage';
import { socialLimits } from '../loyalty/limits';

/** Every review/chat upload is recorded so later references can be checked for ownership and kind. */
export interface ISocialUpload {
  userId: Types.ObjectId;
  kind: SocialUploadKind;
  key: string;
  url: string;
  mimetype: string;
  size: number;
  usedAt?: Date;
  createdAt: Date;
}
const schema = new Schema<ISocialUpload>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: SOCIAL_UPLOAD_KINDS, required: true },
    key: { type: String, required: true },
    url: { type: String, required: true },
    mimetype: { type: String, required: true },
    size: { type: Number, required: true },
    usedAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
schema.index({ key: 1 }, { unique: true });
schema.index({ userId: 1, createdAt: -1 });
export const SocialUpload = model<ISocialUpload>('SocialUpload', schema);

const RULES: Record<SocialUploadKind, { mimes: Set<string>; max: number; label: string }> = {
  review_image: { mimes: IMAGE_UPLOAD_MIME, max: MAX_IMAGE_BYTES, label: 'Photos must be JPG, PNG, WebP or AVIF up to 5 MB' },
  review_video: { mimes: VIDEO_UPLOAD_MIME, max: MAX_VIDEO_BYTES, label: 'Videos must be MP4 or WebM up to 30 MB' },
  chat_image: { mimes: IMAGE_UPLOAD_MIME, max: MAX_IMAGE_BYTES, label: 'Images must be JPG, PNG, WebP or AVIF up to 5 MB' },
};

export async function storeSocialUpload(userId: string, kind: SocialUploadKind, file: { buffer: Buffer; size: number }) {
  const rule = RULES[kind];
  if (file.size > rule.max) throw new AppError(413, 'FILE_TOO_LARGE', rule.label);
  const mime = sniffMime(file.buffer);
  if (!mime || !rule.mimes.has(mime)) throw new AppError(400, 'INVALID_FILE_TYPE', rule.label);
  const stored = await getStorage().upload(file.buffer, { folder: `social/${userId}/${kind}`, filename: kind.endsWith('video') ? 'video' : 'image', mimetype: mime });
  await SocialUpload.create({ userId: new Types.ObjectId(userId), kind, key: stored.key, url: stored.url, mimetype: mime, size: file.size });
  return { url: stored.url, key: stored.key, mimetype: mime, size: file.size };
}

/** Resolves upload keys owned by `userId` of the allowed kinds; any foreign / unknown key → 400. */
export async function resolveOwnUploads(userId: string, keys: { key: string; kind: SocialUploadKind }[]): Promise<Map<string, string>> {
  if (!keys.length) return new Map();
  const rows = await SocialUpload.find({ userId: new Types.ObjectId(userId), key: { $in: keys.map((k) => k.key) } }).lean();
  const out = new Map<string, string>();
  for (const k of keys) {
    const row = rows.find((r) => r.key === k.key && r.kind === k.kind);
    if (!row) throw new AppError(400, 'INVALID_MEDIA', 'Upload the file again and retry');
    out.set(k.key, row.url);
  }
  await SocialUpload.updateMany({ _id: { $in: rows.map((r) => r._id) } }, { $set: { usedAt: new Date() } });
  return out;
}

/** `POST /social/uploads` (multipart: file + kind). */
export const socialUploadRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_VIDEO_BYTES, files: 1, fields: 2 } });

socialUploadRouter.post(
  '/uploads',
  requireAuth,
  socialLimits.upload,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    // Multipart fields are only available after multer, so the Zod check runs here.
    const { kind } = socialUploadSchema.parse(req.body ?? {});
    if (!req.file) throw new AppError(400, 'FILE_REQUIRED', 'Choose a file to upload');
    res.status(201).json({ data: await storeSocialUpload(req.user!.id, kind, req.file) });
  }),
);

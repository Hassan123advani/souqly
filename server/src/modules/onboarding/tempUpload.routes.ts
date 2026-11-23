import { Router } from 'express';
import multer from 'multer';
import { AppError } from '../../lib/AppError';
import { asyncHandler } from '../../lib/asyncHandler';
import { IMAGE_UPLOAD_MIME, MAX_IMAGE_BYTES, sniffMime } from '../../lib/fileType';
import { requireAuth } from '../../middleware/auth';
import { getStorage } from '../../services/storage';
import { audit } from '../audit/audit.service';

/**
 * POST /uploads/temp — uploads for users who do not have a store yet (onboarding logo / banner /
 * ID document). Images or PDF ≤ 5 MB, type sniffed from magic bytes, stored under tmp/{userId}/.
 * Onboarding only accepts keys from the caller's own tmp folder (see onboarding.service.ts).
 */
export const tempUploadsRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 2 } });

const isPdf = (buf: Buffer) => buf.length >= 5 && buf.subarray(0, 5).toString('ascii') === '%PDF-';

tempUploadsRouter.post(
  '/temp',
  requireAuth,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) throw new AppError(400, 'FILE_REQUIRED', 'Choose a file to upload');
    if (file.size > MAX_IMAGE_BYTES) throw new AppError(413, 'FILE_TOO_LARGE', 'Files must be 5 MB or smaller');
    const sniffed = sniffMime(file.buffer);
    const mime = sniffed && IMAGE_UPLOAD_MIME.has(sniffed) ? sniffed : isPdf(file.buffer) ? 'application/pdf' : null;
    if (!mime) throw new AppError(400, 'INVALID_FILE_TYPE', 'Use a JPG, PNG, WebP or AVIF image, or a PDF');
    const stored = await getStorage().upload(file.buffer, { folder: `tmp/${req.user!.id}`, filename: mime === 'application/pdf' ? 'doc' : 'image', mimetype: mime });
    await audit({ action: 'upload.temp', targetType: 'User', targetId: req.user!.id, meta: { key: stored.key, size: file.size, mime }, req });
    res.status(201).json({ data: { url: stored.url, key: stored.key, mimetype: mime, size: file.size } });
  }),
);

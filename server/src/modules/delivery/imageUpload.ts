import type { Request, RequestHandler } from 'express';
import multer from 'multer';
import { AppError } from '../../lib/AppError';
import { decrypt, encrypt } from '../../lib/crypto';
import { IMAGE_UPLOAD_MIME, MAX_IMAGE_BYTES, sniffMime } from '../../lib/fileType';
import { getStorage } from '../../services/storage';

/** Single image field `file` (≤ 5 MB) kept in memory. */
export const singleImage: RequestHandler = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 0 } }).single('file');

export type UploadedImage = { key: string; url: string };
type RefPayload = UploadedImage & { u: string; p: string };

/**
 * Validates the uploaded image by magic bytes and stores it under `<folder>/`. Returns `ref`, an
 * AES-GCM sealed `{key,url,userId,purpose}` the client sends back later — so the server never trusts a
 * client-supplied URL and a user cannot attach someone else's upload.
 */
export async function storeUploadedImage(req: Request, folder: string, purpose: string): Promise<UploadedImage & { ref: string }> {
  const file = req.file;
  if (!file) throw new AppError(400, 'FILE_REQUIRED', 'Choose an image to upload');
  const mime = sniffMime(file.buffer);
  if (!mime || !IMAGE_UPLOAD_MIME.has(mime)) throw new AppError(400, 'INVALID_FILE_TYPE', 'Use a JPG, PNG, WebP or AVIF image');
  const stored = await getStorage().upload(file.buffer, { folder, filename: 'image', mimetype: mime });
  const payload: RefPayload = { key: stored.key, url: stored.url, u: req.user!.id, p: purpose };
  return { key: stored.key, url: stored.url, ref: encrypt(JSON.stringify(payload)) };
}

/** Opens an upload ref; throws 400 INVALID_UPLOAD unless it was issued to this user for this purpose. */
export function openUploadRef(ref: string, userId: string, purpose: string): UploadedImage {
  try {
    const p = JSON.parse(decrypt(ref)) as RefPayload;
    if (p.u === userId && p.p === purpose && typeof p.key === 'string' && typeof p.url === 'string') return { key: p.key, url: p.url };
  } catch {
    /* fall through */
  }
  throw new AppError(400, 'INVALID_UPLOAD', 'Upload the image again');
}

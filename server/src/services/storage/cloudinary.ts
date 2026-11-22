import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import { env } from '../../config/env';
import type { StorageService, StoredFile, UploadOptions } from './index';

export class CloudinaryStorage implements StorageService {
  readonly name = 'cloudinary' as const;

  constructor() {
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }

  upload(buffer: Buffer, opts: UploadOptions): Promise<StoredFile> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          ...(opts.fixedKey
            ? { public_id: `souqly/${opts.fixedKey.replace(/\.[a-z0-9]+$/i, '')}`, overwrite: true }
            : { folder: `souqly/${opts.folder}`, unique_filename: true }),
          resource_type: opts.mimetype.startsWith('image/') ? 'image' : opts.mimetype.startsWith('video/') ? 'video' : 'raw',
        },
        (err, result?: UploadApiResponse) => {
          if (err || !result) return reject(err ?? new Error('Cloudinary upload failed'));
          resolve({ url: result.secure_url, key: result.public_id });
        },
      );
      stream.end(buffer);
    });
  }

  async delete(key: string): Promise<void> {
    await cloudinary.uploader.destroy(key);
  }
}

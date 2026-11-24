import path from 'node:path';
import { SERVER_ROOT, env, integrations } from '../../config/env';
import { AppError } from '../../lib/AppError';
import { CloudinaryStorage } from './cloudinary';
import { LocalDiskStorage } from './local';

export type UploadOptions = {
  folder: string;
  filename: string;
  mimetype: string;
  /**
   * Exact storage key (`<folder>/<name>.<ext>`), overwriting any existing file. Used only by the seed so
   * demo art is written to stable paths (re-seeding never piles up files). Never pass user input here.
   */
  fixedKey?: string;
};
export type StoredFile = { url: string; key: string };

export interface StorageService {
  readonly name: 'cloudinary' | 'local' | 'unavailable';
  upload(buffer: Buffer, opts: UploadOptions): Promise<StoredFile>;
  delete(key: string): Promise<void>;
}

export const UPLOADS_DIR = path.join(SERVER_ROOT, 'uploads');

/**
 * Serverless without Cloudinary: the function's disk is read-only (except /tmp, which is per-instance
 * and ephemeral), so local storage would silently lose files. Uploads fail loudly instead.
 */
export class UnavailableStorage implements StorageService {
  readonly name = 'unavailable' as const;
  async upload(): Promise<StoredFile> {
    throw new AppError(503, 'STORAGE_NOT_CONFIGURED', 'File uploads are not available: cloud storage is not configured on this server');
  }
  async delete(): Promise<void> {
    // Nothing was ever stored here; deleting old local keys is a no-op.
  }
}

let instance: StorageService | undefined;

export function getStorage(): StorageService {
  instance ??= integrations.hasCloudinary ? new CloudinaryStorage() : env.SERVERLESS ? new UnavailableStorage() : new LocalDiskStorage(UPLOADS_DIR);
  return instance;
}

/** Test hook. */
export function setStorage(s: StorageService | undefined): void {
  instance = s;
}

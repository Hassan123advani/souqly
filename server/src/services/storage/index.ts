import path from 'node:path';
import { SERVER_ROOT, integrations } from '../../config/env';
import { CloudinaryStorage } from './cloudinary';
import { LocalDiskStorage } from './local';

export type UploadOptions = { folder: string; filename: string; mimetype: string };
export type StoredFile = { url: string; key: string };

export interface StorageService {
  readonly name: 'cloudinary' | 'local';
  upload(buffer: Buffer, opts: UploadOptions): Promise<StoredFile>;
  delete(key: string): Promise<void>;
}

export const UPLOADS_DIR = path.join(SERVER_ROOT, 'uploads');

let instance: StorageService | undefined;

export function getStorage(): StorageService {
  instance ??= integrations.hasCloudinary ? new CloudinaryStorage() : new LocalDiskStorage(UPLOADS_DIR);
  return instance;
}

/** Test hook. */
export function setStorage(s: StorageService | undefined): void {
  instance = s;
}

import fs from 'node:fs/promises';
import path from 'node:path';
import { randomToken } from '../../lib/crypto';
import type { StorageService, StoredFile, UploadOptions } from './index';

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'image/svg+xml': '.svg',
  'application/pdf': '.pdf',
};

function safeSegment(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'file';
}

/** Dev fallback: writes files to server/uploads, served by express at /uploads. */
export class LocalDiskStorage implements StorageService {
  readonly name = 'local' as const;
  constructor(private readonly root: string) {}

  async upload(buffer: Buffer, opts: UploadOptions): Promise<StoredFile> {
    const folder = opts.folder.split('/').map(safeSegment).join('/');
    const base = safeSegment(path.parse(opts.filename).name);
    const ext = EXT_BY_MIME[opts.mimetype] ?? '';
    const key = opts.fixedKey ?? `${folder}/${base}-${randomToken(9)}${ext}`;
    const abs = this.resolve(key);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, buffer);
    return { url: `/uploads/${key}`, key };
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolve(key), { force: true });
  }

  /** Removes a whole folder (seed:clear wipes `seed/`). */
  async deleteFolder(folder: string): Promise<void> {
    await fs.rm(this.resolve(folder), { recursive: true, force: true });
  }

  /** Resolves a key inside the uploads root; rejects path traversal. */
  private resolve(key: string): string {
    const abs = path.resolve(this.root, key);
    if (!abs.startsWith(path.resolve(this.root) + path.sep)) throw new Error('Invalid storage key');
    return abs;
  }
}

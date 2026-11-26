import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { SERVER_ROOT, isTest } from '../config/env';
import { logger } from '../lib/logger';

/**
 * Real product photos for the demo seed (D-093). Images are downloaded once from the allow-listed
 * demo CDN, cached on disk (server/.seed-cache, gitignored) and then re-hosted in our own storage, so
 * the live site never hotlinks a third party. Any failure returns null and the caller falls back to
 * the original SVG art, so seeding still works offline. Disabled in tests and with SEED_REAL_IMAGES=false.
 */

const ALLOWED_HOSTS = new Set(['cdn.dummyjson.com']);
const CACHE_DIR = path.join(SERVER_ROOT, '.seed-cache', 'images');
const MAX_BYTES = 3 * 1024 * 1024;
const TIMEOUT_MS = 20_000;

export type SeedImage = { buffer: Buffer; mimetype: string; ext: string };

export function realImagesEnabled(): boolean {
  return !isTest && process.env.SEED_REAL_IMAGES !== 'false';
}

/** Detects the image type from magic bytes (never trusts the remote content-type). */
function sniff(buf: Buffer): { mimetype: string; ext: string } | null {
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return { mimetype: 'image/webp', ext: 'webp' };
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mimetype: 'image/jpeg', ext: 'jpg' };
  if (buf.length > 8 && buf.toString('hex', 0, 8) === '89504e470d0a1a0a') return { mimetype: 'image/png', ext: 'png' };
  return null;
}

let warned = false;

export async function loadSeedImage(url: string): Promise<SeedImage | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.hostname)) return null;

  const cacheFile = path.join(CACHE_DIR, createHash('sha1').update(url).digest('hex'));
  try {
    const cached = await fs.readFile(cacheFile);
    const type = sniff(cached);
    if (type) return { buffer: cached, ...type };
  } catch {
    // not cached yet
  }

  try {
    const res = await fetch(parsed, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'error' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > MAX_BYTES) throw new Error('image too large');
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > MAX_BYTES) throw new Error('image too large');
    const type = sniff(buffer);
    if (!type) throw new Error('not an image');
    try {
      await fs.mkdir(CACHE_DIR, { recursive: true });
      await fs.writeFile(cacheFile, buffer);
    } catch {
      // read-only disk (serverless): the cache is only an optimisation
    }
    return { buffer, ...type };
  } catch (err) {
    if (!warned) {
      warned = true;
      logger.warn({ err: (err as Error).message, url }, 'Seed: real product image unavailable, using SVG art instead');
    }
    return null;
  }
}

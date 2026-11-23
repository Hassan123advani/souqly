import { AppError } from '../../lib/AppError';

/**
 * A media reference sent in a JSON body must be one WE stored, under a folder the caller owns
 * (e.g. `tmp/{userId}/` during onboarding, `stores/{storeId}/` afterwards). Prevents pointing a
 * store logo at another user's private upload or at an arbitrary external URL.
 */
export function assertOwnedMedia(media: { url: string; key: string } | undefined | null, prefixes: string[]): void {
  if (!media) return;
  const { url, key } = media;
  const keyOk = !key.includes('..') && !key.startsWith('/') && prefixes.some((p) => key.startsWith(p));
  let urlOk = url === `/uploads/${key}`;
  if (!urlOk) {
    try {
      const u = new URL(url);
      urlOk = u.protocol === 'https:' && u.hostname === 'res.cloudinary.com' && u.pathname.includes(`/${key}`);
    } catch {
      urlOk = false;
    }
  }
  if (!keyOk || !urlOk) throw new AppError(400, 'INVALID_MEDIA', 'Upload files through Souqly before using them');
}

export const tmpPrefix = (userId: string) => `tmp/${userId}/`;
export const storePrefix = (storeId: string) => `stores/${storeId}/`;

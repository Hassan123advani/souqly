export const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

export const RESERVED_SLUGS = new Set([
  'admin', 'api', 'seller', 'rider', 'store', 'stores', 'souqly', 'help', 'support', 'login', 'signup',
  'account', 'cart', 'checkout', 'search', 'mall', 'official', 'static', 'assets', 'uploads',
]);

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function isValidStoreSlug(slug: string): boolean {
  return SLUG_REGEX.test(slug) && !RESERVED_SLUGS.has(slug);
}

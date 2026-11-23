import { expect, type APIRequestContext, type APIResponse, type BrowserContext, type Page } from '@playwright/test';

/** Seed accounts (see server/src/seed and DECISIONS.md). */
export const ADMIN = { email: 'souqly@gmail.com', password: 'souqly123' };
export const DEMO_PASSWORD = 'Demo1234';
export const NOOR = { email: 'noor@demo.souqly.pk', password: DEMO_PASSWORD, store: 'noor-textiles', storeName: 'Noor Textiles' };
export const MANDI = { email: 'mandi@demo.souqly.pk', password: DEMO_PASSWORD };
export const BUYERS = {
  ayesha: { email: 'ayesha@demo.souqly.pk', password: DEMO_PASSWORD },
  bilal: { email: 'bilal@demo.souqly.pk', password: DEMO_PASSWORD },
  sana: { email: 'sana@demo.souqly.pk', password: DEMO_PASSWORD },
};

/** The API is reached through the Vite proxy so cookies land on the client origin. */
export const API = '/api/v1';

/** Short unique suffix for emails, store names and slugs (lowercase, slug-safe). */
export function uid(prefix = ''): string {
  const rnd = Math.random().toString(36).slice(2, 6);
  return `${prefix}${Date.now().toString(36)}${rnd}`;
}

export function uniqueEmail(tag = 'user'): string {
  return `e2e-${tag}-${uid()}@e2e.souqly.test`;
}

/** A unique, valid Pakistani mobile number in E.164 (+923xxxxxxxxx). */
export function uniquePhone(): string {
  const n = (Date.now() % 1_000_000_000).toString().padStart(9, '0');
  return `+923${n}`;
}

/** Every mutation must be JSON or carry X-Requested-With (CSRF hardening, docs/api-auth.md). */
const HEADERS = { 'X-Requested-With': 'XMLHttpRequest' };

type Ctx = APIRequestContext | BrowserContext | Page;
const req = (c: Ctx): APIRequestContext => ('request' in c ? c.request : c);

async function json<T>(res: APIResponse, what: string): Promise<T> {
  const body = await res.text();
  expect(res.ok(), `${what} -> ${res.status()} ${body.slice(0, 400)}`).toBeTruthy();
  return (body ? JSON.parse(body) : {}) as T;
}

export async function apiGet<T = any>(c: Ctx, path: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await req(c).get(`${API}${path}`, { headers: { ...HEADERS, ...headers } });
  return json<T>(res, `GET ${path}`);
}

export async function apiPost<T = any>(c: Ctx, path: string, data?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const res = await req(c).post(`${API}${path}`, { data: data ?? {}, headers: { ...HEADERS, ...headers } });
  return json<T>(res, `POST ${path}`);
}

export async function apiPatch<T = any>(c: Ctx, path: string, data: unknown, headers: Record<string, string> = {}): Promise<T> {
  const res = await req(c).patch(`${API}${path}`, { data, headers: { ...HEADERS, ...headers } });
  return json<T>(res, `PATCH ${path}`);
}

/** Log in through the API; the session cookies are stored in the given context (fast, no UI). */
export async function apiLogin(c: Ctx, email: string, password: string) {
  const res = await req(c).post(`${API}/auth/login`, { data: { email, password }, headers: HEADERS });
  return (await json<{ data: { user: any } }>(res, `login ${email}`)).data.user;
}

export async function apiSignup(c: Ctx, name: string, email: string, password: string) {
  const res = await req(c).post(`${API}/auth/signup`, { data: { name, email, password, terms: true }, headers: HEADERS });
  return (await json<{ data: { user: any } }>(res, `signup ${email}`)).data.user;
}

export async function apiLogout(c: Ctx) {
  await req(c).post(`${API}/auth/logout`, { headers: HEADERS });
}

export async function setMode(c: Ctx, mode: 'buyer' | 'seller') {
  return apiPost(c, '/account/mode', { mode });
}

export async function changePassword(c: Ctx, currentPassword: string, newPassword: string) {
  return apiPost(c, '/account/change-password', { currentPassword, newPassword, confirmPassword: newPassword });
}

/** Default Pakistani address used by API-created orders. */
export function addressBody(fullName: string, phone = '+923001234500') {
  return {
    label: 'home',
    fullName,
    phone,
    country: 'PK',
    city: 'Lahore',
    area: 'Gulberg',
    line1: 'House 5, Street 9',
    isDefault: true,
  };
}

/** Pick the first in-stock variant of a product slug. */
export async function firstVariant(c: Ctx, slug: string) {
  const { data } = await apiGet<{ data: any }>(c, `/products/${slug}`);
  const v = (data.variants as any[]).find((x) => (x.stock ?? 0) > 2) ?? data.variants[0];
  return { productId: data.id as string, variantId: (v.id ?? v._id) as string, product: data };
}

/**
 * Places a COD order through the API as the logged-in buyer for one product slug.
 * Returns the checkout response (sub-order numbers live in `data.orders`).
 */
export async function placeOrderApi(c: Ctx, slug: string, fullName = 'E2E Buyer') {
  const { productId, variantId } = await firstVariant(c, slug);
  // Only this item should be selected, whatever else is in the cart.
  await apiPost(c, '/cart/select-all', { selected: false });
  await apiPost(c, '/cart/items', { productId, variantId, qty: 1 });
  const addresses = await apiGet<{ data: any[] }>(c, '/account/addresses');
  const address = addresses.data[0] ?? (await apiPost<{ data: any }>(c, '/account/addresses', addressBody(fullName))).data;
  const addressId = address.id ?? address._id;
  return apiPost<{ data: any }>(c, '/checkout', { addressId, paymentMethod: 'cod', idempotencyKey: uid('idem-') });
}

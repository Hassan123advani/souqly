import { test as base, expect, type Page } from '@playwright/test';
import { apiLogin, setMode } from './api';

/**
 * Project-wide `test`: map tiles (OpenStreetMap) are external network calls that make runs slow
 * and non-deterministic offline, so they are answered with an empty 204 for every context.
 */
export const test = base.extend<{ blockTiles: void }>({
  blockTiles: [
    async ({ context }, use) => {
      await context.route(/(tile\.openstreetmap\.org|basemaps\.cartocdn\.com|fonts\.(googleapis|gstatic)\.com)/, (r) =>
        r.fulfill({ status: 204, body: '' }),
      );
      await use();
    },
    { auto: true },
  ],
});
export { expect };

/** Log in through the real login form. */
export async function loginUI(page: Page, email: string, password: string, next?: string) {
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : '/login');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  // Check the pathname: `/login?next=/admin` would otherwise satisfy an `/admin` URL regex.
  await page.waitForURL((u) => u.pathname !== '/login');
}

/** Fast login: API call in the page's context (cookies shared), then optional mode + navigation. */
export async function loginFast(page: Page, email: string, password: string, opts: { mode?: 'buyer' | 'seller'; goto?: string } = {}) {
  const user = await apiLogin(page, email, password);
  if (opts.mode) await setMode(page, opts.mode);
  if (opts.goto) await page.goto(opts.goto);
  return user;
}

/** Opens the header account menu. */
export async function openAccountMenu(page: Page) {
  await page.getByRole('button', { name: 'Account menu' }).click();
  return page.getByRole('menu', { name: 'Account menu' });
}

/** Closes the staff first-login "change your password" modal if it shows up. */
export async function dismissPasswordModal(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Change your password first' });
  if (await dialog.isVisible().catch(() => false)) await dialog.getByRole('button', { name: 'Close' }).click();
}

import type { Browser, BrowserContext, Page } from '@playwright/test';
import { test, expect, openAccountMenu } from '../helpers/test';
import { ADMIN, apiLogin, apiSignup, changePassword, uid, uniqueEmail } from '../helpers/api';
import { pngFile } from '../helpers/png';

/**
 * The main marketplace journey, end to end, through the UI:
 * signup -> become a seller -> admin approval -> product -> another buyer orders it (COD)
 * -> seller confirms/packs/ships with an invited rider -> rider delivers with the buyer's OTP
 * -> buyer reviews -> review visible on the product page.
 *
 * Each actor keeps one browser context for the whole file, so every account signs in once
 * (login is rate limited to 10 attempts / 15 min per account).
 */
test.describe.configure({ mode: 'serial' });

const id = uid();
const PASSWORD = 'Journey1234';
const seller = { name: `Seller ${id}`, email: uniqueEmail('seller'), store: `E2E Lantern Shop ${id}`, slug: '' };
const buyer = { name: `Buyer ${id}`, email: uniqueEmail('buyer') };
const rider = { name: `Rider ${id}`, email: uniqueEmail('rider') };
const product = { title: `E2E Brass Lantern ${id}`, slug: '', price: '2499', stock: '25' };
const NEW_ADMIN_PASSWORD = `Souq-${id}-9x`;
let adminPassword = ADMIN.password;
let orderNumber = ''; // sub-order number, e.g. SQ-261123-ABCDE-A
let otp = '';

type Actor = { ctx: BrowserContext; page: Page };
const actors: Record<string, Actor> = {};
async function actor(browser: Browser, name: string, opts: Parameters<Browser['newContext']>[0] = {}): Promise<Actor> {
  if (!actors[name]) {
    const ctx = await browser.newContext({ ...test.info().project.use, ...opts });
    await ctx.route(/(tile\.openstreetmap\.org|fonts\.(googleapis|gstatic)\.com)/, (r) => r.fulfill({ status: 204, body: '' }));
    actors[name] = { ctx, page: await ctx.newPage() };
  }
  return actors[name]!;
}

test.afterAll(async () => {
  // Restore the seeded admin password so other specs / later runs can still sign in.
  if (adminPassword !== ADMIN.password && actors.admin) {
    await changePassword(actors.admin.page, adminPassword, ADMIN.password).catch(async () => {
      await apiLogin(actors.admin!.page, ADMIN.email, adminPassword);
      await changePassword(actors.admin!.page, adminPassword, ADMIN.password);
    });
    adminPassword = ADMIN.password;
  }
  for (const a of Object.values(actors)) await a.ctx.close();
});

test('new user signs up and lands in buyer mode', async ({ browser }) => {
  const { page } = await actor(browser, 'seller');
  await page.goto('/signup');
  await page.getByRole('textbox', { name: 'Full name' }).fill(seller.name);
  await page.getByRole('textbox', { name: 'Email' }).fill(seller.email);
  await page.getByRole('textbox', { name: 'Password' }).fill(PASSWORD);
  await page.getByRole('checkbox', { name: /I agree to the Terms/ }).check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).not.toHaveURL(/\/signup/);

  const menu = await openAccountMenu(page);
  await expect(menu.getByText(seller.email)).toBeVisible();
  await expect(menu.getByRole('radio', { name: 'Buyer' })).toBeChecked();
});

test('switching to seller opens the Become-a-Seller wizard and submits a store', async ({ browser }) => {
  const { page } = await actor(browser, 'seller');
  const menu = page.getByRole('menu', { name: 'Account menu' });
  if (!(await menu.isVisible())) await openAccountMenu(page);
  await menu.getByRole('radio', { name: 'Seller' }).click();
  await expect(page).toHaveURL(/\/seller\/onboarding/);
  // QA-E2E-1 (low): the account menu stays open after the mode switch navigates; close it.
  if (await menu.isVisible()) await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await page.getByRole('button', { name: 'Start setting up my shop' }).click();

  // 1. Basics
  await page.getByRole('textbox', { name: 'Store name' }).fill(seller.store);
  await expect(page.getByText('Available', { exact: true })).toBeVisible();
  seller.slug = await page.getByRole('textbox', { name: 'Store web address' }).inputValue();
  expect(seller.slug).toMatch(/^e2e-lantern-shop-/);
  await page.getByRole('textbox', { name: 'Tagline' }).fill('Hand-made brass lanterns for every home');
  await page.getByRole('button', { name: 'Home & Living', exact: true }).click();
  await page.getByRole('button', { name: 'Next' }).click();

  // 2. Branding (optional) - upload a logo anyway
  await expect(page.getByRole('heading', { level: 1, name: 'Make it recognisable' })).toBeVisible();
  await page.locator('input[type=file]').first().setInputFiles(pngFile('logo.png'));
  await expect(page.locator('main img[src*="/uploads/"]').first()).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();

  // 3. Contact & pickup
  await expect(page.getByRole('heading', { level: 1, name: 'Contact & pickup address' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Phone', exact: true }).fill('+923001112233');
  await page.getByRole('textbox', { name: 'Pickup phone' }).fill('+923001112233');
  await page.getByRole('textbox', { name: 'Street address' }).fill('12 Anarkali Bazaar');
  await page.getByRole('combobox', { name: 'City' }).fill('Lahore');
  await page.getByRole('button', { name: 'Next' }).click();

  // 4. Business
  await expect(page.getByRole('heading', { level: 1, name: 'Tell us about your business' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Full legal name' }).fill(seller.name);
  await page.getByRole('textbox', { name: 'CNIC number' }).fill('35202-1234567-1');
  await page.getByRole('button', { name: 'Next' }).click();

  // 5. Payout
  await expect(page.getByRole('heading', { level: 1, name: 'Where should we send your earnings?' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Account title' }).fill(seller.name);
  await page.getByRole('textbox', { name: 'Bank name' }).fill('Meezan Bank');
  await page.getByRole('textbox', { name: 'Account number' }).fill('01234567890123');
  await page.getByRole('button', { name: 'Next' }).click();

  // 6. Policies: start from the shipping template
  await expect(page.getByRole('heading', { level: 1, name: 'Set your store policies' })).toBeVisible();
  await page.getByRole('button', { name: 'Use template' }).first().click();
  await expect(page.getByRole('textbox', { name: 'Shipping policy' })).not.toHaveValue('');
  await page.getByRole('button', { name: 'Next' }).click();

  // 7. Review + submit
  await expect(page.getByRole('heading', { level: 1, name: 'Review and submit' })).toBeVisible();
  await expect(page.getByText(seller.store)).toBeVisible();
  await page.getByRole('checkbox', { name: /accept the Souqly seller terms/ }).check();
  await page.getByRole('button', { name: 'Submit for review' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Your store is under review' })).toBeVisible();
  await expect(page.getByText('Pending review')).toBeVisible();
});

test('admin signs in, changes the first-login password and approves the store', async ({ browser }) => {
  const { page } = await actor(browser, 'admin');
  await page.goto('/login?next=/admin');
  await page.getByRole('textbox', { name: 'Email' }).fill(ADMIN.email);
  await page.getByRole('textbox', { name: 'Password' }).fill(adminPassword);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL((u) => u.pathname.startsWith('/admin'));

  // First-login staff modal: shown on a fresh database while the seeded password has never been
  // changed (passwordChangeRecommended). A previous run against the same server clears the flag.
  const modal = page.getByRole('dialog', { name: 'Change your password first' });
  await expect(modal.or(page.getByRole('main').getByRole('heading', { level: 1 })).first()).toBeVisible();
  if (await modal.isVisible()) {
    await modal.getByRole('textbox', { name: 'Current password' }).fill(adminPassword);
    await modal.getByRole('textbox', { name: 'New password', exact: true }).fill(NEW_ADMIN_PASSWORD);
    await modal.getByRole('textbox', { name: 'Confirm new password' }).fill(NEW_ADMIN_PASSWORD);
    await modal.getByRole('button', { name: 'Update password' }).click();
    await expect(modal).toBeHidden();
    adminPassword = NEW_ADMIN_PASSWORD;
  }

  await page.goto('/admin/stores');
  await page.getByRole('tab', { name: /^Pending/ }).click();
  const row = page.getByRole('row', { name: new RegExp(seller.store) });
  await expect(row).toBeVisible();
  await expect(row.getByRole('cell', { name: 'Pending' })).toBeVisible();
  await row.click();
  await expect(page.getByRole('heading', { level: 1, name: seller.store })).toBeVisible();
  await page.getByRole('main').getByRole('button', { name: 'Approve' }).click();
  const confirm = page.getByRole('dialog', { name: `Approve ${seller.store}?` });
  await confirm.getByRole('button', { name: 'Approve' }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByRole('main').getByText('Approved').first()).toBeVisible();
  await expect(page.getByRole('main').getByRole('button', { name: 'Approve' })).toHaveCount(0);
});

test('seller adds and publishes a product (admin approves it if moderated)', async ({ browser }) => {
  const { page } = await actor(browser, 'seller');
  await page.goto('/seller/products/new');
  await expect(page.getByRole('heading', { level: 1, name: 'New product' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Product title' }).fill(product.title);

  await page.getByRole('combobox', { name: 'Choose a category' }).click();
  await page.getByRole('option', { name: 'Home & Living' }).click();
  // Pick the first subcategory if the tree goes deeper.
  const sub = page.getByRole('combobox').filter({ hasNotText: 'Home & Living' }).and(page.locator('[aria-label*="ubcategory"]'));
  if (await sub.count()) {
    await sub.first().click();
    await page.getByRole('option').first().click();
  }

  await page.locator('[contenteditable=true]').first().fill('A hand-made brass lantern. Warm light for courtyards and dinner tables.');
  await page.locator('input[type=file][multiple]').setInputFiles(pngFile('lantern.png'));
  await expect(page.locator('main img[src*="/uploads/"]').first()).toBeVisible();

  await page.getByRole('textbox', { name: 'Default Price (Rs)' }).fill(product.price);
  await page.getByRole('textbox', { name: 'Default Stock' }).fill(product.stock);
  await page.getByRole('button', { name: 'Publish' }).click();

  // New (non-Mall) stores go through moderation: pending_review until an admin approves.
  await expect(page).toHaveURL(/\/seller\/products\/(?!new)[a-f0-9]{24}/);
  const status = page.getByRole('main').getByText(/^(In review|Live)$/).first();
  await expect(status).toBeVisible();
  const moderated = /review/i.test((await status.textContent()) ?? '');

  if (moderated) {
    const { page: admin } = await actor(browser, 'admin');
    await admin.goto('/admin/products');
    const pick = admin.getByRole('checkbox', { name: product.title });
    await expect(pick).toBeVisible();
    await pick.check();
    await admin.getByRole('button', { name: /Approve all|Approve selected/ }).click();
    const dialog = admin.getByRole('dialog');
    await dialog.getByRole('button', { name: /Approve/ }).click();
    await expect(admin.getByRole('checkbox', { name: product.title })).toHaveCount(0);
  }

  await page.reload();
  await expect(page.getByRole('main').getByText('Live', { exact: true })).toBeVisible();
});

test('owner invites a rider who accepts the invitation', async ({ browser }) => {
  const { page: riderPage } = await actor(browser, 'rider', { geolocation: { latitude: 31.5204, longitude: 74.3587 }, permissions: ['geolocation'] });
  await apiSignup(riderPage, rider.name, rider.email, PASSWORD);

  const { page } = await actor(browser, 'seller');
  await page.goto('/seller/staff');
  await page.getByRole('button', { name: 'Invite member' }).click();
  const dialog = page.getByRole('dialog', { name: 'Invite a team member' });
  await dialog.getByRole('textbox', { name: 'Email' }).fill(rider.email);
  await dialog.getByRole('combobox').click();
  await page.getByRole('option', { name: 'Rider', exact: true }).click();
  await dialog.getByRole('button', { name: 'Send invitation' }).click();
  await expect(dialog).toBeHidden();

  await riderPage.goto('/account/profile');
  await expect(riderPage.getByText(`${seller.store} invited you to join as Rider.`)).toBeVisible();
  await riderPage.getByRole('button', { name: 'Accept' }).click();
  await expect(riderPage.getByText(`You've joined ${seller.store}`)).toBeVisible();
});

test('another buyer finds the product and checks out with COD', async ({ browser }) => {
  const { page } = await actor(browser, 'buyer');
  await apiSignup(page, buyer.name, buyer.email, PASSWORD);

  // Store page lists it.
  await page.goto(`/store/${seller.slug}`);
  await expect(page.getByRole('heading', { level: 1, name: new RegExp(seller.store) })).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: product.title }).first()).toBeVisible();

  // Search with autocomplete finds it.
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Search Souqly' }).fill(product.title);
  const option = page
    .getByRole('listbox', { name: 'Search suggestions' })
    .getByRole('group', { name: 'Products' })
    .getByRole('option', { name: new RegExp(product.title) });
  await expect(option).toBeVisible();
  await option.click();
  await expect(page).toHaveURL(/\/p\//);
  product.slug = page.url().split('/p/')[1]!.split(/[?#]/)[0]!;
  await expect(page.getByRole('heading', { level: 1, name: product.title })).toBeVisible();

  await page.getByRole('button', { name: 'Add to cart' }).click();
  await expect(page.getByRole('link', { name: 'Cart (1 items)' })).toBeVisible();

  await page.goto('/checkout');
  await page.getByRole('button', { name: 'Add address' }).click();
  const addr = page.getByRole('dialog', { name: 'Add a new address' });
  await addr.getByRole('textbox', { name: 'Phone number' }).fill('+923004445566');
  await addr.getByRole('combobox', { name: 'City' }).fill('Lahore');
  await addr.getByRole('textbox', { name: 'Area / neighbourhood' }).fill('Gulberg III');
  await addr.getByRole('textbox', { name: 'Street address' }).fill('House 7, Street 3, Block C');
  await addr.getByRole('button', { name: 'Save address' }).click();
  await expect(addr).toBeHidden();

  await expect(page.getByRole('radiogroup', { name: 'Delivery address' }).getByRole('radio', { checked: true })).toContainText('House 7, Street 3');
  await expect(page.getByRole('main').getByText(product.title)).toBeVisible();
  await expect(page.getByRole('radio', { name: /Cash on Delivery/ })).toBeChecked();
  await page.getByRole('button', { name: 'Place order' }).click();

  await expect(page).toHaveURL(/\/checkout\/success\//);
  const checkoutNumber = decodeURIComponent(page.url().split('/checkout/success/')[1]!.split(/[?#]/)[0]!);
  await expect(page.getByRole('main')).toContainText(checkoutNumber);

  // The sub-order for our store is checkout number + "-A" (single store).
  await page.goto('/account/orders');
  const link = page.getByRole('main').getByRole('link', { name: new RegExp(`${checkoutNumber}-A`) }).first();
  await expect(link).toBeVisible();
  orderNumber = `${checkoutNumber}-A`;
});

test('seller confirms, packs, assigns the rider and ships the order', async ({ browser }) => {
  const { page } = await actor(browser, 'seller');
  await page.goto('/seller/orders');
  await page.getByRole('main').getByRole('link', { name: new RegExp(orderNumber) }).click();
  await expect(page.getByRole('heading', { level: 1, name: orderNumber })).toBeVisible();

  await page.getByRole('button', { name: 'Confirm order' }).click();
  await expect(page.getByRole('button', { name: 'Mark as packed' })).toBeVisible();
  await page.getByRole('button', { name: 'Mark as packed' }).click();
  await expect(page.getByRole('button', { name: 'Ship', exact: true })).toBeVisible();

  await page.getByRole('combobox', { name: 'Assign a rider' }).click();
  await page.getByRole('option', { name: new RegExp(rider.name) }).click();
  await expect(page.getByText('Rider assigned').or(page.getByRole('combobox', { name: 'Assign a rider' }).filter({ hasText: rider.name })).first()).toBeVisible();

  await page.getByRole('button', { name: 'Ship', exact: true }).click();
  const ship = page.getByRole('dialog', { name: 'Ship this order' });
  await ship.getByRole('textbox', { name: 'Tracking number' }).fill(`E2E-${id}`);
  await ship.getByRole('button', { name: 'Ship' }).click();
  await expect(ship).toBeHidden();
  await expect(page.getByRole('main').getByText('Shipped').first()).toBeVisible();
});

test('buyer sees the delivery code on the order page', async ({ browser }) => {
  const { page } = await actor(browser, 'buyer');
  await page.goto(`/account/orders/${orderNumber}`);
  const code = page.getByLabel(/^Delivery code \d \d \d \d$/);
  await expect(code).toBeVisible();
  otp = ((await code.getAttribute('aria-label')) ?? '').replace(/\D/g, '');
  expect(otp).toMatch(/^\d{4}$/);
});

test('rider starts the delivery and completes it with the buyer OTP', async ({ browser }) => {
  const { page } = await actor(browser, 'rider');
  await page.goto('/rider');
  const delivery = page.getByRole('main').getByRole('link', { name: new RegExp(orderNumber) });
  await expect(delivery).toBeVisible();
  await delivery.click();
  await expect(page).toHaveURL(/\/rider\/d\//);

  await page.getByRole('button', { name: 'Start delivery' }).click();
  await expect(page.getByText('Sharing live location').first()).toBeVisible();

  await page.getByRole('button', { name: 'Mark delivered' }).click();
  const dialog = page.getByRole('dialog', { name: 'Hand over the order' });
  await expect(dialog).toBeVisible();
  const codeBox = dialog.getByRole('textbox', { name: /4-digit code/ });
  if ((await codeBox.count()) === 1) await codeBox.fill(otp);
  else await dialog.getByRole('textbox').first().pressSequentially(otp);
  await dialog.getByRole('checkbox', { name: /I collected .* in cash/ }).check();
  await dialog.getByRole('button', { name: 'Confirm delivery' }).click();
  await expect(page.getByText('Delivered! Great job.').or(page.getByRole('heading', { name: 'Delivered' })).first()).toBeVisible();
});

test('buyer reviews the product and the review shows on the product page', async ({ browser }) => {
  const { page } = await actor(browser, 'buyer');
  await page.goto(`/account/orders/${orderNumber}`);
  await expect(page.getByRole('main').getByText('Delivered').first()).toBeVisible();

  await page.goto('/account/reviews');
  await page.getByRole('main').getByRole('button', { name: /Write a review|Review/ }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Write a review' });
  await dialog.getByRole('radio', { name: '5 stars' }).click();
  const headline = `Glows beautifully ${id}`;
  await dialog.getByRole('textbox', { name: 'Headline' }).fill(headline);
  await dialog.getByRole('textbox', { name: 'Your review' }).fill('Solid brass, arrived well packed and the rider was polite.');
  await dialog.getByRole('button', { name: 'Submit review' }).click();
  await expect(page.getByText('Thanks! Your review is live.')).toBeVisible();

  await page.goto(`/p/${product.slug}`);
  const reviews = page.getByRole('region', { name: 'Ratings & reviews' });
  await expect(reviews.getByRole('heading', { name: headline })).toBeVisible();
  await expect(reviews.getByText(buyer.name)).toBeVisible();
});

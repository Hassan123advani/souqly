import { test, expect } from '../helpers/test';
import { apiGet } from '../helpers/api';

test.describe('Marketplace (guest)', () => {
  test('home renders hero, categories, flash sale countdown and products', async ({ page }) => {
    await page.goto('/');
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { level: 1 })).toContainText('Souqly');
    await expect(main.getByRole('region', { name: 'Featured promotions' })).toBeVisible();

    const categories = main.getByRole('region', { name: 'Shop by category' });
    await expect(categories.getByRole('link', { name: "Women's Fashion" })).toBeVisible();

    const flash = main.getByRole('region', { name: 'Flash Sale' });
    const timer = flash.getByRole('timer');
    await expect(timer).toBeVisible();
    // The countdown ticks: its text must change within a few seconds (polled, no sleep).
    const first = await timer.textContent();
    await expect.poll(async () => timer.textContent(), { timeout: 5_000 }).not.toBe(first);

    const flashItems = flash.getByRole('list', { name: 'Flash Sale' }).getByRole('link');
    await expect(flashItems.first()).toHaveAttribute('href', /^\/p\//);
    expect(await main.locator('a[href^="/p/"]').count()).toBeGreaterThan(8);
  });

  test('search autocomplete suggests products and opens results', async ({ page }) => {
    await page.goto('/');
    const box = page.getByRole('combobox', { name: 'Search Souqly' });
    await box.fill('kurta');
    const suggestions = page.getByRole('listbox', { name: 'Search suggestions' });
    await expect(suggestions.getByRole('group', { name: 'Products' }).getByRole('option').first()).toBeVisible();
    await expect(suggestions.getByRole('option', { name: 'Kurtas & Kurtis' })).toBeVisible();

    await suggestions.getByRole('option', { name: /Search for .kurta./ }).click();
    await expect(page).toHaveURL(/\/search\?.*q=kurta/);
    const results = page.getByRole('main').getByRole('article');
    await expect(results.first()).toBeVisible();
    await expect(results.first().getByRole('heading')).toContainText(/kurta/i);
  });

  test('stores tab finds Noor Textiles and opens its store page', async ({ page }) => {
    await page.goto('/stores');
    await page.getByRole('searchbox', { name: 'Search stores' }).fill('Noor');
    await expect(page).toHaveURL(/q=Noor/i);
    const link = page.getByRole('main').getByRole('link', { name: 'Noor Textiles', exact: true });
    await expect(link).toBeVisible();
    await expect(page.getByRole('main').getByRole('link', { name: 'Volt Bazaar' })).toHaveCount(0);
    await link.click();
    await expect(page).toHaveURL(/\/store\/noor-textiles/);
    await expect(page.getByRole('heading', { level: 1, name: /Noor Textiles/ })).toBeVisible();
  });

  test('category filters change the URL and the results', async ({ page }) => {
    await page.goto('/c/womens-fashion');
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { level: 1, name: "Women's Fashion" })).toBeVisible();
    const count = main.getByText(/^\d+ products?$/);
    await expect(count).toBeVisible();
    const before = Number((await count.textContent())!.split(' ')[0]);

    // Brand filter: narrows the results and is reflected in the URL.
    const brand = main.getByRole('complementary', { name: 'Filters' }).getByRole('checkbox', { name: /^Sitara \(\d+\)$/ });
    const brandCount = Number((await brand.getAttribute('aria-label').catch(() => null))?.match(/\((\d+)\)/)?.[1] ?? NaN);
    await brand.check();
    await expect(page).toHaveURL(/brand=sitara/);
    await expect.poll(async () => Number((await count.textContent())!.split(' ')[0])).toBeLessThan(before);
    if (!Number.isNaN(brandCount)) await expect(count).toHaveText(new RegExp(`^${brandCount} products?$`));

    // Sort is URL-synced too.
    await main.getByRole('combobox', { name: 'Sort by' }).selectOption({ label: 'Price: low to high' }).catch(async () => {
      await main.getByRole('combobox', { name: 'Sort by' }).click();
      await page.getByRole('option', { name: /low to high/i }).click();
    });
    await expect(page).toHaveURL(/sort=price_asc/);
  });

  test('product page: changing a variant updates the price', async ({ page, request }) => {
    // Find a published product whose variants have different prices (seed is deterministic,
    // but discovering it keeps the test independent of slugs).
    const list = await apiGet<{ data: any[] }>(request, '/products?q=pressure%20cooker&limit=10');
    let target: { slug: string; option: string; value: string; price: number } | undefined;
    for (const card of list.data) {
      const { data: p } = await apiGet<{ data: any }>(request, `/products/${card.slug}`);
      const vs = p.variants as any[];
      if (new Set(vs.map((v) => v.price)).size < 2) continue;
      const def = vs.find((v) => (v.id ?? v._id) === p.defaultVariantId) ?? vs[0];
      const other = vs.find((v) => v.price !== def.price && v.stock > 0);
      if (!other) continue;
      const [option, value] = Object.entries(other.options as Record<string, string>).find(([k, val]) => def.options[k] !== val)!;
      target = { slug: card.slug, option, value, price: other.price };
      break;
    }
    test.skip(!target, 'no product with variant-dependent prices in the seed');

    await page.goto(`/p/${target!.slug}`);
    const buy = page.getByRole('main');
    await expect(buy.getByRole('heading', { level: 1 })).toBeVisible();
    const priceLine = buy.getByText(/^Rs\. [\d,]+/).first();
    const before = await priceLine.textContent();
    await buy.getByRole('radio', { name: target!.value, exact: true }).click();
    await expect(buy.getByRole('radio', { name: target!.value, exact: true })).toBeChecked();
    await expect.poll(async () => priceLine.textContent()).not.toBe(before);
  });

  test('guest add to cart updates the header badge', async ({ page }) => {
    await page.goto('/c/kurtas-kurtis');
    const firstProduct = page.getByRole('main').getByRole('article').first().getByRole('link').first();
    await firstProduct.click();
    await expect(page).toHaveURL(/\/p\//);
    await expect(page.getByRole('link', { name: 'Cart (0 items)' })).toBeVisible();
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await expect(page.getByRole('link', { name: 'Cart (1 items)' })).toBeVisible();
    // Persists across navigation (guest cart in local storage).
    await page.goto('/cart');
    await expect(page.getByRole('link', { name: 'Cart (1 items)' })).toBeVisible();
  });
});

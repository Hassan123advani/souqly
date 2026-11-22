// Visual QA helper: screenshots routes at desktop (1440x900) and mobile (390x844), light + dark.
//
// Usage (from repo root, with the client dev server running):
//   node e2e/screenshots.mjs [routes...] [--lang=en|ur|ar] [--themes=light,dark] [--mock] [--full]
//     [--base=http://localhost:5173] [--out=e2e/screenshots] [--only=desktop|mobile]
//
//   --mock   intercepts /api/v1/* with fixture data (signed-in user, addresses, sessions) so
//            account/admin pages can be reviewed without the server running.
//   --full   full-page screenshots instead of the viewport only.
// Default routes: / /login /signup /about /help /sell /account/profile /nope-404
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, def) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split('=').slice(1).join('=') : def;
};
const has = (name) => args.includes(`--${name}`);

const base = flag('base', process.env.BASE_URL || 'http://localhost:5173');
const lang = flag('lang', 'en');
const themes = flag('themes', 'light,dark').split(',');
const only = flag('only', '');
const outDir = path.resolve(flag('out', path.join(here, 'screenshots')));
const routes = args.filter((a) => !a.startsWith('--'));
const list = routes.length ? routes : ['/', '/login', '/signup', '/about', '/help', '/sell', '/account/profile', '/nope-404'];
const viewports = [
  { name: 'desktop', width: 1440, height: 900, isMobile: false },
  { name: 'mobile', width: 390, height: 844, isMobile: true },
].filter((v) => !only || v.name === only);

const now = new Date().toISOString();
const ME = {
  id: '665f00000000000000000001',
  name: 'Ayesha Khan',
  email: 'ayesha@example.com',
  phone: '+923001234567',
  emailVerified: true,
  phoneVerified: true,
  activeMode: 'buyer',
  isSeller: false,
  platformRole: has('admin') ? 'SUPER_ADMIN' : undefined,
  permissions: has('admin') ? ['admin.dashboard.view', 'admin.users.view'] : [],
  stores: [],
  passwordChangeRecommended: has('admin'),
  twoFactorEnabled: false,
  preferences: {
    language: lang,
    currency: 'PKR',
    theme: 'system',
    notifications: { email: true, sms: true, push: false, marketing: false },
    privacy: { showProfileInReviews: true, personalizedRecommendations: true },
  },
  referralCode: 'AYESHA25',
  coins: 1240,
  walletBalance: 350000,
  createdAt: '2025-03-14T10:00:00.000Z',
};
const FIXTURES = {
  'GET /auth/me': { user: ME },
  'GET /config/public': {
    site: { name: 'Souqly', tagline: 'Every shop, one souq', maintenance: false, announcement: { text: 'Free delivery on your first order this week', link: '/help', tone: 'info' } },
    integrations: { googleLogin: true, cloudStorage: false, email: false, sms: false, webPush: false, payments: { cod: true, jazzcash: true, easypaisa: true, stripe: false, wallet: true } },
    flags: { referrals: true, loyaltyCoins: true },
    devMode: true,
  },
  'GET /account/addresses': [
    { id: 'a1', label: 'Home', fullName: 'Ayesha Khan', phone: '+923001234567', country: 'PK', city: 'Karachi', area: 'DHA Phase 6', line1: 'House 21, Street 7, Khayaban-e-Ittehad', isDefault: true, location: { lat: 24.8, lng: 67.06 } },
    { id: 'a2', label: 'Work', fullName: 'Ayesha Khan', phone: '+923001234567', country: 'PK', city: 'Karachi', area: 'Shahrah-e-Faisal', line1: 'Office 402, Business Tower', isDefault: false },
  ],
  'GET /account/sessions': [
    { id: 's1', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0 Safari/537.36', ip: '39.32.10.4', createdAt: now, lastUsedAt: now, current: true },
    { id: 's2', userAgent: 'Mozilla/5.0 (Linux; Android 14) Mobile Chrome/130.0 Safari/537.36', ip: '39.40.2.77', createdAt: now, lastUsedAt: new Date(Date.now() - 3 * 3600e3).toISOString(), current: false },
  ],
};

fs.mkdirSync(outDir, { recursive: true });
const slug = (r) => (r === '/' ? 'home' : r.replace(/^\//, '').replace(/[/?=&]+/g, '_'));

const browser = await chromium.launch();
let count = 0;
let errors = 0;
try {
  for (const vp of viewports) {
    for (const theme of themes) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
        isMobile: vp.isMobile,
        hasTouch: vp.isMobile,
        colorScheme: theme === 'dark' ? 'dark' : 'light',
        reducedMotion: 'reduce',
      });
      await ctx.addInitScript(
        ([t, l]) => localStorage.setItem('souqly-ui', JSON.stringify({ state: { theme: t, language: l, currency: 'PKR' }, version: 0 })),
        [theme, lang],
      );
      if (has('mock')) {
        await ctx.route('**/api/v1/**', (route) => {
          const url = new URL(route.request().url());
          const key = `${route.request().method()} ${url.pathname.replace('/api/v1', '')}`;
          if (key in FIXTURES) return route.fulfill({ json: { data: FIXTURES[key] } });
          return route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND', message: 'Not mocked' } } });
        });
      }
      const page = await ctx.newPage();
      page.on('pageerror', (err) => {
        errors++;
        console.log(`  [pageerror] ${err.message}`);
      });
      page.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        const text = msg.text();
        // Expected when the API server isn't running and --mock isn't used.
        if (/Failed to load resource|ERR_CONNECTION|status of 50\d|status of 404/.test(text)) return;
        errors++;
        console.log(`  [console.error] ${text.slice(0, 300)}`);
      });
      for (const r of list) {
        // Avoid 'networkidle': Vite's HMR socket and failing API retries can keep the network busy.
        await page.goto(base + r, { waitUntil: 'load', timeout: 30_000 }).catch((e) => console.log(`  [goto] ${e.message}`));
        await page.waitForSelector('#root > *', { timeout: 15_000 }).catch(() => console.log(`  [warn] ${r}: #root stayed empty`));
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(900);
        const file = path.join(outDir, `${slug(r)}__${lang}__${vp.name}__${theme}.png`);
        await page.screenshot({ path: file, fullPage: has('full') });
        count++;
        console.log('saved', path.relative(process.cwd(), file));
      }
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
console.log(`${count} screenshot(s) in ${outDir}; ${errors} runtime error(s)`);
process.exitCode = errors ? 1 : 0;

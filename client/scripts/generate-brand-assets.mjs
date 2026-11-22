// Renders Souqly PNG brand assets (PWA icons, apple-touch-icon, OG image) from inline SVG/HTML
// using headless Chromium. Run from the repo root:  node client/scripts/generate-brand-assets.mjs
// (requires `npx playwright install chromium` once).
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = (f) => path.resolve(here, '../public', f);

const FONTS =
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;700;800&family=Readex+Pro:wght@500;600&display=swap">';

const mark = (arch = '#0E5E5A', inner = '#2E847E') => `
<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <path d="M9 57.5V30.5C9 17.6 18.6 8.6 32 2.5c13.4 6.1 23 15.1 23 28v27c0 2.2-1.8 4-4 4H13c-2.2 0-4-1.8-4-4Z" fill="${arch}"/>
  <path d="M14.5 61.5V32c0-9.6 6.6-16.4 17.5-22.3C42.9 15.6 49.5 22.4 49.5 32v29.5" fill="none" stroke="${inner}" stroke-width="1.6"/>
  <path d="M41.5 27c-2.6-4-17.5-5-17.5 3.6 0 8.4 17 6 17 15.1 0 8.6-15.6 8.6-18.5 3.6" fill="none" stroke="#F2A93B" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="32" cy="15.5" r="2.6" fill="#F2A93B"/>
</svg>`;

// App icon: dusk-teal tile with a parchment arch so it reads on any home screen.
const icon = (size, { maskable = false, radius = 0 } = {}) => `
<html><head><style>
  html,body{margin:0;width:${size}px;height:${size}px;background:transparent}
  .tile{width:${size}px;height:${size}px;border-radius:${radius}px;overflow:hidden;position:relative;
    background:radial-gradient(120% 90% at 50% 0%, #1A7A73 0%, #0E5E5A 45%, #073C39 100%);display:grid;place-items:center}
  .glow{position:absolute;inset:auto 0 -30% 0;height:70%;background:radial-gradient(closest-side,rgba(242,169,59,.28),transparent)}
  svg{position:relative;width:${maskable ? 52 : 66}%;height:${maskable ? 52 : 66}%;filter:drop-shadow(0 ${size / 64}px ${size / 32}px rgba(0,0,0,.25))}
</style></head><body><div class="tile"><div class="glow"></div>${mark('#FBF8F3', '#E7E0D4')}</div></body></html>`;

const og = `
<html><head>${FONTS}<style>
  html,body{margin:0;width:1200px;height:630px}
  body{font-family:'Plus Jakarta Sans',sans-serif;background:#0F1716;color:#FBF8F3;position:relative;overflow:hidden}
  .bg{position:absolute;inset:0;background:
     radial-gradient(60% 80% at 85% 20%, rgba(242,169,59,.30), transparent 60%),
     radial-gradient(70% 90% at 10% 100%, rgba(14,94,90,.85), transparent 70%),
     linear-gradient(135deg,#0B4A47 0%,#0F1716 70%)}
  .pattern{position:absolute;inset:0;opacity:.55;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='72' viewBox='0 0 56 72'%3E%3Cpath d='M8 72V38C8 24 17 14 28 7c11 7 20 17 20 31v34' fill='none' stroke='%23F2A93B' stroke-opacity='.18' stroke-width='1.5'/%3E%3C/svg%3E");background-size:56px 72px;
     -webkit-mask-image:linear-gradient(90deg,transparent 35%,#000 100%)}
  .wrap{position:absolute;inset:0;padding:80px 88px;display:flex;flex-direction:column;justify-content:space-between}
  .brand{display:flex;align-items:center;gap:20px}
  .brand svg{width:84px;height:84px}
  .name{font-size:64px;font-weight:800;letter-spacing:-2px}
  .name b{color:#79BEB8;font-weight:800}
  .ar{font-family:'Readex Pro',sans-serif;font-weight:600;font-size:40px;color:#F2A93B;padding-inline-start:22px;border-inline-start:2px solid rgba(251,248,243,.25)}
  h1{font-size:76px;line-height:1.02;margin:0;font-weight:800;letter-spacing:-2.5px;max-width:820px}
  h1 span{color:#F2A93B}
  p{margin:18px 0 0;font-size:28px;color:rgba(251,248,243,.78);font-weight:500}
  .chips{display:flex;gap:12px}
  .chip{border:1px solid rgba(251,248,243,.25);border-radius:999px;padding:10px 20px;font-size:22px;font-weight:600;color:rgba(251,248,243,.9)}
</style></head><body><div class="bg"></div><div class="pattern"></div>
<div class="wrap">
  <div class="brand">${mark('#1A7A73', '#3E968F')}<div class="name">Souq<b>ly</b></div><div class="ar">سوقلي</div></div>
  <div><h1>Every shop, <span>one souq.</span></h1><p>Independent sellers. Trusted delivery. Cash on delivery.</p></div>
  <div class="chips"><div class="chip">Fashion</div><div class="chip">Home</div><div class="chip">Electronics</div><div class="chip">Handmade</div></div>
</div></body></html>`;

const jobs = [
  { file: 'pwa-192.png', w: 192, h: 192, html: icon(192, { radius: 42 }), transparent: true },
  { file: 'pwa-512.png', w: 512, h: 512, html: icon(512, { radius: 112 }), transparent: true },
  { file: 'maskable-512.png', w: 512, h: 512, html: icon(512, { maskable: true }) },
  { file: 'apple-touch-icon.png', w: 180, h: 180, html: icon(180, { radius: 0 }) },
  { file: 'og-default.png', w: 1200, h: 630, html: og },
];

const browser = await chromium.launch();
try {
  for (const j of jobs) {
    const page = await browser.newPage({ viewport: { width: j.w, height: j.h }, deviceScaleFactor: 1 });
    await page.setContent(j.html, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: out(j.file), omitBackground: !!j.transparent });
    await page.close();
    console.log('wrote', j.file);
  }
} finally {
  await browser.close();
}

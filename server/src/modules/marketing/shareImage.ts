import { formatMoney } from '@souqly/shared';

/**
 * Branded 1200×630 social share image as SVG (Souq Dusk palette). PNG rendering would need native
 * libraries (sharp / canvas), which we avoid; the OG tags point at the `.svg` endpoints (D-073).
 * Every interpolated string is XML-escaped; no remote images are embedded (no SSRF / tracking).
 */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);

/** Greedy word wrap into at most `maxLines` lines of ~`width` characters (last line gets an ellipsis). */
export function wrap(text: string, width: number, maxLines: number): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > width && cur) {
      lines.push(cur);
      cur = w;
    } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1]!.slice(0, Math.max(0, width - 1))}…`;
    return kept;
  }
  return lines.map((l) => (l.length > width ? `${l.slice(0, width - 1)}…` : l));
}

export function shareSvg(o: { kicker: string; title: string; subtitle?: string; price?: number; compareAt?: number; badge?: string; themeColor?: string }): string {
  const theme = /^#[0-9a-f]{6}$/i.test(o.themeColor ?? '') ? o.themeColor! : '#0E5E5A';
  const titleLines = wrap(o.title, 28, 3);
  const titleSvg = titleLines.map((l, i) => `<text x="80" y="${250 + i * 72}" font-size="60" font-weight="700" fill="#FBF8F3">${esc(l)}</text>`).join('');
  const afterTitle = 250 + titleLines.length * 72;
  const sub = o.subtitle ? `<text x="80" y="${afterTitle + 10}" font-size="30" fill="#E8DFD2">${esc(wrap(o.subtitle, 60, 1)[0] ?? '')}</text>` : '';
  const price =
    o.price !== undefined
      ? `<text x="80" y="540" font-size="56" font-weight="800" fill="#F2A93B">${esc(formatMoney(o.price))}</text>` +
        (o.compareAt && o.compareAt > o.price ? `<text x="80" y="585" font-size="28" fill="#C9BFB2" text-decoration="line-through">${esc(formatMoney(o.compareAt))}</text>` : '')
      : '';
  const badge = o.badge
    ? `<rect x="900" y="70" rx="28" ry="28" width="230" height="56" fill="#D6453D"/><text x="1015" y="108" font-size="28" font-weight="700" fill="#FFFFFF" text-anchor="middle">${esc(o.badge.slice(0, 14))}</text>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" font-family="'Plus Jakarta Sans', 'Segoe UI', Arial, sans-serif">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${theme}"/><stop offset="1" stop-color="#0F1716"/></linearGradient></defs>
<rect width="1200" height="630" fill="url(#g)"/>
<circle cx="1080" cy="560" r="220" fill="#F2A93B" opacity="0.12"/><circle cx="1150" cy="80" r="120" fill="#F2A93B" opacity="0.08"/>
<text x="80" y="120" font-size="30" font-weight="600" fill="#F2A93B" letter-spacing="2">${esc(o.kicker.toUpperCase().slice(0, 40))}</text>
${badge}${titleSvg}${sub}${price}
<text x="1120" y="590" font-size="34" font-weight="800" fill="#FBF8F3" text-anchor="end">Souqly</text>
</svg>`;
}

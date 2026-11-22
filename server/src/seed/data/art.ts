import type { ArtKind } from './categories';

/**
 * Original SVG art for demo data (D-010): category-themed gradients, a simple geometric
 * illustration and the product name. No external assets, fonts are system fallbacks.
 */

export function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);
}

const FONT = "'Plus Jakarta Sans', 'Segoe UI', Arial, sans-serif";

/** Mixes a hex colour with white (t > 0) or black (t < 0). */
export function shade(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(t >= 0 ? c + (255 - c) * t : c * (1 + t)));
  return `#${ch.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

/** Illustration centred around (400, 370) in an 800×800 viewBox. `c` = main colour, `d` = dark detail colour. */
function illustration(kind: ArtKind, c: string, d: string): string {
  const light = shade(c, 0.35);
  switch (kind) {
    case 'kurta':
      return `<path d="M300 210 L362 180 Q400 212 438 180 L500 210 L572 300 L528 336 L494 300 L506 572 L294 572 L306 300 L272 336 L228 300 Z" fill="${c}"/>
<path d="M362 180 Q400 212 438 180 L420 196 Q400 214 380 196 Z" fill="${d}"/><path d="M400 206 V300" stroke="${d}" stroke-width="6"/>
<g fill="${light}">${[0, 1, 2, 3, 4, 5, 6].map((i) => `<circle cx="${318 + i * 27.3}" cy="540" r="7"/>`).join('')}</g>
<path d="M340 250 q60 40 120 0" stroke="${light}" stroke-width="5" fill="none" stroke-dasharray="4 10" stroke-linecap="round"/>`;
    case 'shirt':
      return `<path d="M290 222 L358 192 L400 236 L442 192 L510 222 L586 316 L534 352 L502 318 L502 556 L298 556 L298 318 L266 352 L214 316 Z" fill="${c}"/>
<path d="M358 192 L400 236 L372 262 L340 214 Z M442 192 L400 236 L428 262 L460 214 Z" fill="${d}"/>
<g fill="${light}">${[0, 1, 2, 3].map((i) => `<circle cx="400" cy="${290 + i * 62}" r="8"/>`).join('')}</g>
<rect x="428" y="300" width="46" height="40" rx="6" fill="none" stroke="${light}" stroke-width="5"/>`;
    case 'phone':
      return `<rect x="304" y="160" width="192" height="380" rx="34" fill="${d}"/>
<rect x="318" y="182" width="164" height="336" rx="22" fill="url(#screen)"/>
<circle cx="400" cy="200" r="7" fill="${d}"/><rect x="350" y="490" width="100" height="8" rx="4" fill="#ffffff" opacity=".7"/>
<g fill="#ffffff" opacity=".85">${[0, 1, 2].map((r) => [0, 1, 2].map((k) => `<rect x="${340 + k * 44}" y="${250 + r * 52}" width="32" height="32" rx="9"/>`).join('')).join('')}</g>`;
    case 'headphones':
      return `<path d="M268 420 V380 A132 132 0 0 1 532 380 V420" fill="none" stroke="${d}" stroke-width="26" stroke-linecap="round"/>
<rect x="232" y="380" width="76" height="140" rx="30" fill="${c}"/><rect x="492" y="380" width="76" height="140" rx="30" fill="${c}"/>
<rect x="250" y="402" width="40" height="96" rx="18" fill="${light}"/><rect x="510" y="402" width="40" height="96" rx="18" fill="${light}"/>`;
    case 'pot':
      return `<rect x="236" y="352" width="44" height="22" rx="11" fill="${d}"/><rect x="520" y="352" width="44" height="22" rx="11" fill="${d}"/>
<path d="M262 330 H538 V448 Q538 528 458 528 H342 Q262 528 262 448 Z" fill="${c}"/>
<ellipse cx="400" cy="322" rx="158" ry="26" fill="${d}"/><ellipse cx="400" cy="300" rx="120" ry="20" fill="${light}"/>
<rect x="382" y="262" width="36" height="30" rx="10" fill="${d}"/><path d="M300 420 H500" stroke="${light}" stroke-width="8" stroke-linecap="round" opacity=".7"/>`;
    case 'lamp':
      return `<path d="M318 200 H482 L540 360 H260 Z" fill="${c}"/><path d="M318 200 H482 L490 222 H310 Z" fill="${d}" opacity=".5"/>
<rect x="390" y="360" width="20" height="150" fill="${d}"/><ellipse cx="400" cy="520" rx="96" ry="22" fill="${d}"/>
<circle cx="400" cy="372" r="22" fill="#FFE7A8" opacity=".9"/><path d="M290 340 H510" stroke="${light}" stroke-width="6" stroke-dasharray="2 14" stroke-linecap="round"/>`;
    case 'bottle':
      return `<rect x="360" y="170" width="80" height="70" rx="12" fill="${d}"/><rect x="376" y="236" width="48" height="26" fill="${shade(d, 0.2)}"/>
<rect x="306" y="258" width="188" height="292" rx="40" fill="${c}"/><rect x="336" y="340" width="128" height="120" rx="14" fill="#ffffff" opacity=".85"/>
<path d="M360 380 H440 M360 410 H420" stroke="${d}" stroke-width="8" stroke-linecap="round"/><rect x="326" y="282" width="16" height="230" rx="8" fill="#ffffff" opacity=".35"/>`;
    case 'jar':
      return `<rect x="316" y="196" width="168" height="54" rx="14" fill="${d}"/>
<path d="M300 262 Q300 244 320 244 H480 Q500 244 500 262 V520 Q500 552 468 552 H332 Q300 552 300 520 Z" fill="${c}"/>
<rect x="300" y="340" width="200" height="110" fill="#ffffff" opacity=".88"/><circle cx="400" cy="395" r="34" fill="${light}"/>
<path d="M384 395 q16 -26 32 0 q-16 26 -32 0" fill="${d}"/>`;
    case 'teddy':
      return `<circle cx="318" cy="232" r="44" fill="${c}"/><circle cx="482" cy="232" r="44" fill="${c}"/>
<circle cx="318" cy="232" r="22" fill="${light}"/><circle cx="482" cy="232" r="22" fill="${light}"/>
<ellipse cx="400" cy="460" rx="128" ry="110" fill="${c}"/><circle cx="400" cy="300" r="104" fill="${c}"/>
<ellipse cx="400" cy="332" rx="46" ry="36" fill="${light}"/><ellipse cx="400" cy="318" rx="16" ry="11" fill="${d}"/>
<circle cx="362" cy="282" r="11" fill="${d}"/><circle cx="438" cy="282" r="11" fill="${d}"/><ellipse cx="400" cy="470" rx="64" ry="54" fill="${light}"/>`;
    case 'ball':
      return `<circle cx="400" cy="370" r="160" fill="${c}"/><path d="M290 254 Q400 370 290 486 M510 254 Q400 370 510 486" fill="none" stroke="#ffffff" stroke-width="8"/>
<path d="M302 268 Q412 370 302 472 M498 268 Q388 370 498 472" fill="none" stroke="#ffffff" stroke-width="3" stroke-dasharray="6 9" opacity=".9"/>
<circle cx="348" cy="300" r="34" fill="#ffffff" opacity=".18"/>`;
    case 'book':
      return `<path d="M400 238 Q330 200 230 214 V516 Q330 502 400 540 Z" fill="${c}"/><path d="M400 238 Q470 200 570 214 V516 Q470 502 400 540 Z" fill="${shade(c, 0.15)}"/>
<path d="M400 238 V540" stroke="${d}" stroke-width="6"/>
<g stroke="#ffffff" stroke-width="6" stroke-linecap="round" opacity=".75"><path d="M264 274 Q320 262 370 278"/><path d="M264 314 Q320 302 370 318"/><path d="M264 354 Q320 342 370 358"/><path d="M430 278 Q480 262 536 274"/><path d="M430 318 Q480 302 536 314"/></g>`;
    case 'watch':
      return `<rect x="352" y="160" width="96" height="140" rx="20" fill="${d}"/><rect x="352" y="440" width="96" height="140" rx="20" fill="${d}"/>
<circle cx="400" cy="370" r="118" fill="${c}"/><circle cx="400" cy="370" r="96" fill="#FFFDF7"/>
${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => {
  const a = (i * Math.PI) / 6;
  return `<circle cx="${(400 + Math.sin(a) * 80).toFixed(1)}" cy="${(370 - Math.cos(a) * 80).toFixed(1)}" r="${i % 3 === 0 ? 6 : 3}" fill="${d}"/>`;
}).join('')}
<path d="M400 370 L400 314 M400 370 L446 394" stroke="${d}" stroke-width="8" stroke-linecap="round"/><circle cx="400" cy="370" r="9" fill="${c}"/><rect x="516" y="356" width="20" height="28" rx="6" fill="${c}"/>`;
  }
}

/** Repeating background patterns (arches, dots, diamonds). */
function pattern(id: string, kind: number, color: string): string {
  if (kind === 0) {
    return `<pattern id="${id}" width="80" height="96" patternUnits="userSpaceOnUse"><path d="M10 96 V44 Q10 10 40 6 Q70 10 70 44 V96" fill="none" stroke="${color}" stroke-width="2" opacity=".35"/></pattern>`;
  }
  if (kind === 1) {
    return `<pattern id="${id}" width="36" height="36" patternUnits="userSpaceOnUse"><circle cx="18" cy="18" r="3" fill="${color}" opacity=".35"/></pattern>`;
  }
  return `<pattern id="${id}" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M30 4 L56 30 L30 56 L4 30 Z" fill="none" stroke="${color}" stroke-width="2" opacity=".3"/></pattern>`;
}

export type ProductArtInput = {
  kind: ArtKind;
  palette: [string, string];
  /** Main illustration colour (e.g. the variant colour). */
  accent?: string;
  label: string;
  brand?: string;
  /** 0, 1 or 2: hero shot, angled shot, detail shot. */
  variant: number;
};

export function productArt({ kind, palette, accent, label, brand, variant }: ProductArtInput): string {
  const [bgLight, bgDark] = palette;
  const main = accent ?? bgDark;
  const detail = shade(bgDark, -0.35);
  const dark = variant === 2;
  const bgA = dark ? shade(bgDark, -0.2) : bgLight;
  const bgB = dark ? shade(bgDark, -0.55) : shade(bgLight, -0.12);
  const transform =
    variant === 1 ? 'translate(400 370) rotate(-9) scale(.92) translate(-400 -370)' : variant === 2 ? 'translate(400 370) scale(1.12) translate(-400 -370)' : '';
  const textColor = dark ? '#FFF8EC' : shade(bgDark, -0.45);
  const grad =
    variant === 1
      ? `<radialGradient id="bg" cx="50%" cy="42%" r="70%"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="${bgA}"/></radialGradient>`
      : `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bgA}"/><stop offset="1" stop-color="${bgB}"/></linearGradient>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
<defs>${grad}${pattern('pt', variant, dark ? '#ffffff' : bgDark)}
<linearGradient id="screen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${shade(main, 0.25)}"/><stop offset="1" stop-color="${shade(main, -0.25)}"/></linearGradient></defs>
<rect width="800" height="800" fill="url(#bg)"/><rect width="800" height="800" fill="url(#pt)"/>
<ellipse cx="400" cy="600" rx="210" ry="26" fill="#000000" opacity="${dark ? 0.35 : 0.1}"/>
<g transform="${transform}">${illustration(kind, main, detail)}</g>
${brand ? `<text x="400" y="666" text-anchor="middle" font-family="${FONT}" font-size="22" font-weight="600" letter-spacing="6" fill="${textColor}" opacity=".7">${escapeXml(brand.toUpperCase())}</text>` : ''}
<text x="400" y="712" text-anchor="middle" font-family="${FONT}" font-size="38" font-weight="700" fill="${textColor}">${escapeXml(truncate(label, 28))}</text>
</svg>`;
}

/** Lantern-arch shape used across Souqly art. */
const ARCH = 'M120 360 V190 Q120 80 200 52 Q280 80 280 190 V360 Z';

export function storeLogo(name: string, color: string): string {
  const initials = name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${shade(color, 0.15)}"/><stop offset="1" stop-color="${shade(color, -0.3)}"/></linearGradient></defs>
<rect width="400" height="400" rx="96" fill="url(#g)"/>
<path d="${ARCH}" fill="none" stroke="#F2A93B" stroke-width="10" stroke-linejoin="round"/>
<circle cx="200" cy="40" r="10" fill="#F2A93B"/>
<text x="200" y="272" text-anchor="middle" font-family="${FONT}" font-size="${initials.length > 1 ? 104 : 140}" font-weight="800" fill="#FFF8EC">${escapeXml(initials)}</text>
</svg>`;
}

export function storeBanner(name: string, tagline: string, color: string, seed: number): string {
  const tiles: string[] = [];
  for (let x = 0; x < 1600; x += 100) {
    for (let y = 0; y < 400; y += 100) {
      const k = (x / 100 + y / 100 + seed) % 3;
      tiles.push(
        k === 0
          ? `<path d="M${x + 20} ${y + 100} V${y + 50} Q${x + 20} ${y + 18} ${x + 50} ${y + 12} Q${x + 80} ${y + 18} ${x + 80} ${y + 50} V${y + 100}" fill="none" stroke="#ffffff" stroke-width="2" opacity=".18"/>`
          : k === 1
            ? `<path d="M${x + 50} ${y + 20} L${x + 80} ${y + 50} L${x + 50} ${y + 80} L${x + 20} ${y + 50} Z" fill="#ffffff" opacity=".08"/>`
            : `<circle cx="${x + 50}" cy="${y + 50}" r="6" fill="#F2A93B" opacity=".35"/>`,
      );
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 400" width="1600" height="400">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${shade(color, -0.35)}"/><stop offset="1" stop-color="${shade(color, 0.1)}"/></linearGradient></defs>
<rect width="1600" height="400" fill="url(#g)"/>${tiles.join('')}
<rect x="0" y="0" width="900" height="400" fill="url(#g)" opacity=".55"/>
<text x="96" y="200" font-family="${FONT}" font-size="76" font-weight="800" fill="#FFF8EC">${escapeXml(name)}</text>
<text x="100" y="262" font-family="${FONT}" font-size="34" font-weight="500" fill="#FFF8EC" opacity=".85">${escapeXml(truncate(tagline, 60))}</text>
</svg>`;
}

/** Wide hero / campaign artwork. */
export function heroArt(title: string, subtitle: string, from: string, to: string, motif: 'lanterns' | 'crescent' | 'arches' | 'stall'): string {
  const lanterns = [0, 1, 2]
    .map(
      (i) =>
        `<g transform="translate(${1060 + i * 150} ${120 + (i % 2) * 70})"><path d="M0 -110 V0" stroke="#F2A93B" stroke-width="3"/><path d="M-40 0 H40 L52 40 V120 Q0 170 -52 120 V40 Z" fill="#F2A93B" opacity=".95"/><path d="M-26 50 H26 V110 Q0 136 -26 110 Z" fill="#FFE7A8"/></g>`,
    )
    .join('');
  const motifs: Record<typeof motif, string> = {
    lanterns,
    crescent: `<circle cx="1260" cy="290" r="170" fill="#FFE7A8"/><circle cx="1330" cy="250" r="160" fill="${to}"/>${lanterns}`,
    arches: [0, 1, 2, 3]
      .map((i) => `<path d="M${980 + i * 150} 600 V330 Q${980 + i * 150} 230 ${1045 + i * 150} 210 Q${1110 + i * 150} 230 ${1110 + i * 150} 330 V600" fill="#ffffff" opacity="${0.12 + i * 0.05}"/>`)
      .join(''),
    stall: `<path d="M980 260 L1460 260 L1500 340 H940 Z" fill="#F2A93B"/><path d="M940 340 H1500 V360 H940 Z" fill="#D6453D"/><rect x="980" y="360" width="20" height="240" fill="#ffffff" opacity=".6"/><rect x="1440" y="360" width="20" height="240" fill="#ffffff" opacity=".6"/><rect x="1040" y="440" width="360" height="140" rx="16" fill="#ffffff" opacity=".2"/>`,
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 600" width="1600" height="600">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient>
<pattern id="p" width="48" height="48" patternUnits="userSpaceOnUse"><circle cx="24" cy="24" r="2" fill="#ffffff" opacity=".18"/></pattern></defs>
<rect width="1600" height="600" fill="url(#g)"/><rect width="1600" height="600" fill="url(#p)"/>${motifs[motif]}
<text x="110" y="270" font-family="${FONT}" font-size="84" font-weight="800" fill="#FFF8EC">${escapeXml(title)}</text>
<text x="114" y="346" font-family="${FONT}" font-size="36" font-weight="500" fill="#FFF8EC" opacity=".88">${escapeXml(subtitle)}</text>
</svg>`;
}

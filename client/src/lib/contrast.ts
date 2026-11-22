/** WCAG helpers used to keep store theme colors readable (AA). */

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function luminance(rgb: [number, number, number]): number {
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

export function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const WHITE: [number, number, number] = [255, 255, 255];
const INK: [number, number, number] = [20, 32, 31];

/** Text color (white or ink) with the higher contrast against `bg`. */
export function readableOn(bgHex: string): '#FFFFFF' | '#14201F' {
  const bg = parseHex(bgHex);
  if (!bg) return '#FFFFFF';
  return contrastRatio(bg, WHITE) >= contrastRatio(bg, INK) ? '#FFFFFF' : '#14201F';
}

/** Mixes `hex` toward black (amount > 0) or white (amount < 0). */
export function shade(hex: string, amount: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const target = amount > 0 ? 0 : 255;
  const a = Math.min(1, Math.abs(amount));
  const out = rgb.map((c) => Math.round(c + (target - c) * a));
  return `#${out.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * A version of the brand color usable as text/accents on a surface (`surfaceHex`) with ≥ 4.5:1 contrast:
 * darkened on light surfaces, lightened on dark ones.
 */
export function accessibleAccent(hex: string, surfaceHex: string): string {
  const surface = parseHex(surfaceHex);
  if (!parseHex(hex) || !surface) return hex;
  const darkSurface = luminance(surface) < 0.2;
  let current = hex;
  for (let i = 0; i < 12; i++) {
    const rgb = parseHex(current)!;
    if (contrastRatio(rgb, surface) >= 4.5) return current;
    current = shade(hex, darkSurface ? -(i + 1) * 0.08 : (i + 1) * 0.08);
  }
  return current;
}

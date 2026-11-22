/** Display swatches for common color option values (seller free text falls back to a neutral chip). */
const SWATCHES: Record<string, string> = {
  black: '#111413',
  white: '#FFFFFF',
  'off white': '#F4EFE6',
  cream: '#F3E7C9',
  ivory: '#F6F1E1',
  beige: '#D9C7A7',
  brown: '#7A4E2D',
  tan: '#C19A6B',
  grey: '#8A8F8F',
  gray: '#8A8F8F',
  silver: '#C0C4C6',
  gold: '#C9A13B',
  red: '#C2362F',
  maroon: '#7A1F2B',
  pink: '#E88AA6',
  rose: '#D8798F',
  orange: '#E07A2E',
  mustard: '#D4A017',
  yellow: '#EFC93A',
  green: '#2E8B57',
  olive: '#6B7A3A',
  emerald: '#1F8A5B',
  mint: '#9ED9C1',
  teal: '#127C78',
  blue: '#2F6FB0',
  navy: '#1F2A44',
  'sky blue': '#7EC8E3',
  purple: '#6D4A9E',
  lavender: '#B9A7DB',
  multicolor: 'conic-gradient(#C2362F, #EFC93A, #2E8B57, #2F6FB0, #6D4A9E, #C2362F)',
};

export function swatchFor(value: string): string | undefined {
  return SWATCHES[value.trim().toLowerCase()];
}

/** Light swatches need a visible border on light surfaces. */
export function isLightSwatch(value: string): boolean {
  return ['white', 'off white', 'cream', 'ivory', 'beige', 'silver', 'mint', 'yellow'].includes(value.trim().toLowerCase());
}

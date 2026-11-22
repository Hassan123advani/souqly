import type { CSSProperties } from 'react';
import type { StoreLayout } from '@souqly/shared';
import { accessibleAccent, readableOn, shade } from '@/lib/contrast';

/** Light/dark surfaces from tokens.css, used to pick AA-safe accent colors. */
const SURFACE_LIGHT = '#FFFFFF';
const SURFACE_DARK = '#15201E';

/**
 * CSS variables scoped to a store page:
 *  --store       brand fill (backgrounds, bars)
 *  --store-deep  darker shade for gradients
 *  --store-fg    white or ink, whichever reads better on --store
 *  --store-accent text/icon color with ≥ 4.5:1 on the current surface (light/dark)
 */
export function storeThemeVars(themeColor: string | undefined): CSSProperties {
  const c = /^#[0-9a-f]{6}$/i.test(themeColor ?? '') ? themeColor! : '#0E5E5A';
  const fg = readableOn(c);
  return {
    '--store': c,
    // Gradient partner that keeps --store-fg readable: darker under white text, lighter under ink.
    '--store-deep': fg === '#FFFFFF' ? shade(c, 0.45) : shade(c, -0.35),
    '--store-fg': fg,
    '--store-accent-light': accessibleAccent(c, SURFACE_LIGHT),
    '--store-accent-dark': accessibleAccent(c, SURFACE_DARK),
  } as CSSProperties;
}

/** Per-template knobs shared by the header and the home sections. */
export const TEMPLATE: Record<StoreLayout, { density: 'default' | 'wide' | 'narrow'; rails: boolean; heading: string }> = {
  classic: { density: 'default', rails: true, heading: 'text-xl font-extrabold tracking-tight sm:text-2xl' },
  bold: { density: 'wide', rails: false, heading: 'text-2xl font-black uppercase tracking-tight sm:text-3xl' },
  boutique: { density: 'narrow', rails: false, heading: 'text-sm font-bold uppercase tracking-[0.25em]' },
  minimal: { density: 'wide', rails: false, heading: 'text-base font-semibold' },
};

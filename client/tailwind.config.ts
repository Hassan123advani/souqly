import type { Config } from 'tailwindcss';

const SCALE = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

/** Maps a palette name to CSS variables (`--primary-500` holds "r g b" channels) so opacity modifiers work. */
function scale(name: string) {
  const out: Record<string, string> = {};
  for (const step of SCALE) out[step] = `rgb(var(--${name}-${step}) / <alpha-value>)`;
  return out;
}
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: { DEFAULT: '1rem', sm: '1.5rem', lg: '2rem' }, screens: { '2xl': '1320px' } },
    extend: {
      colors: {
        primary: { ...scale('primary'), DEFAULT: v('primary'), fg: v('primary-fg'), soft: v('primary-soft') },
        accent: { ...scale('accent'), DEFAULT: v('accent'), fg: v('accent-fg') },
        sale: { ...scale('sale'), DEFAULT: v('sale'), fg: v('sale-fg') },
        ink: scale('ink'),
        bg: v('bg'),
        surface: { DEFAULT: v('surface'), 2: v('surface-2'), 3: v('surface-3') },
        border: { DEFAULT: v('border'), strong: v('border-strong') },
        fg: { DEFAULT: v('fg'), muted: v('fg-muted'), subtle: v('fg-subtle') },
        ring: v('ring'),
        success: { DEFAULT: v('success'), soft: v('success-soft') },
        warning: { DEFAULT: v('warning'), soft: v('warning-soft') },
        danger: { DEFAULT: v('danger'), soft: v('danger-soft') },
        info: { DEFAULT: v('info'), soft: v('info-soft') },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        arabic: ['"Readex Pro"', '"Plus Jakarta Sans"', 'Tahoma', 'sans-serif'],
        // Latin first: Plus Jakarta Sans has no Arabic-script glyphs, so Urdu falls through to Nastaliq
        // while names, emails and numbers keep the brand Latin face.
        urdu: ['"Plus Jakarta Sans"', '"Noto Nastaliq Urdu"', '"Readex Pro"', 'Tahoma', 'serif'],
      },
      borderRadius: { sm: '6px', md: '10px', lg: '16px', xl: '24px', pill: '999px' },
      boxShadow: {
        card: '0 1px 2px rgb(var(--shadow) / 0.06), 0 4px 12px -2px rgb(var(--shadow) / 0.08)',
        pop: '0 2px 6px rgb(var(--shadow) / 0.08), 0 18px 40px -8px rgb(var(--shadow) / 0.22)',
        glow: '0 0 0 1px rgb(var(--accent) / 0.4), 0 8px 30px -6px rgb(var(--accent) / 0.45)',
      },
      transitionTimingFunction: { souq: 'cubic-bezier(.2,.8,.2,1)' },
      transitionDuration: { 150: '150ms', 250: '250ms', 400: '400ms' },
      keyframes: {
        shimmer: { '0%': { backgroundPosition: '200% 0' }, '100%': { backgroundPosition: '-200% 0' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'fade-up': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'slide-in-right': { from: { transform: 'translateX(100%)' }, to: { transform: 'translateX(0)' } },
        'slide-in-left': { from: { transform: 'translateX(-100%)' }, to: { transform: 'translateX(0)' } },
        'slide-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        'zoom-in': { from: { opacity: '0', transform: 'scale(.96)' }, to: { opacity: '1', transform: 'scale(1)' } },
        glow: { '0%,100%': { opacity: '.55' }, '50%': { opacity: '1' } },
      },
      animation: {
        shimmer: 'shimmer 1.6s linear infinite',
        'fade-in': 'fade-in 250ms cubic-bezier(.2,.8,.2,1)',
        'fade-up': 'fade-up 400ms cubic-bezier(.2,.8,.2,1) both',
        'slide-in-right': 'slide-in-right 250ms cubic-bezier(.2,.8,.2,1)',
        'slide-in-left': 'slide-in-left 250ms cubic-bezier(.2,.8,.2,1)',
        'slide-up': 'slide-up 250ms cubic-bezier(.2,.8,.2,1)',
        'zoom-in': 'zoom-in 150ms cubic-bezier(.2,.8,.2,1)',
        glow: 'glow 3s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;

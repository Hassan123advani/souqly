import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import type { HeroSlide } from '@souqly/shared';
import { Skeleton } from '@/components/ui';
import { useReducedMotion } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/cn';
import { safeInternalLink } from '@/lib/catalog';

const AUTOPLAY_MS = 6000;

/** Fallback backgrounds for slides without artwork, keyed by the CMS `theme`. */
const THEMES: Record<string, string> = {
  teal: 'linear-gradient(120deg,#0B4A47,#0E5E5A)',
  saffron: 'linear-gradient(120deg,#8A4B0F,#D98A1E)',
  ink: 'linear-gradient(120deg,#1B2A29,#2F4A47)',
  pomegranate: 'linear-gradient(120deg,#7E1F1A,#D6453D)',
};

function Slide({ slide, active, index, total }: { slide: HeroSlide; active: boolean; index: number; total: number }) {
  const { t } = useTranslation();
  const to = safeInternalLink(slide.ctaLink);
  return (
    <div
      role="group"
      aria-roledescription={t('home.hero.slide')}
      aria-label={t('home.hero.slideOf', { n: index + 1, total })}
      aria-hidden={!active}
      className="relative h-full w-full shrink-0"
    >
      <Link to={to} tabIndex={active ? 0 : -1} className="group block h-full outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-accent">
        {slide.image ? (
          // Admin banners carry their own artwork and headline (D-045); the title stays available to screen readers.
          <img src={slide.image} alt={[slide.title, slide.subtitle].filter(Boolean).join(' — ')} className="size-full object-cover" loading={index === 0 ? 'eager' : 'lazy'} />
        ) : (
          <div className="flex size-full flex-col justify-center gap-2 p-6 text-white sm:p-12" style={{ background: THEMES[slide.theme ?? ''] ?? THEMES.teal }}>
            <p className="text-2xl font-extrabold sm:text-5xl">{slide.title}</p>
            {slide.subtitle && <p className="max-w-xl text-sm opacity-90 sm:text-lg">{slide.subtitle}</p>}
          </div>
        )}
        {slide.ctaText && (
          <span
            dir="ltr"
            className="absolute bottom-[14%] left-[7%] hidden items-center gap-2 rounded-pill bg-accent px-5 py-2.5 text-sm font-bold text-accent-fg shadow-pop transition group-hover:brightness-105 sm:inline-flex"
          >
            {slide.ctaText}
            <ArrowRight className="size-4" aria-hidden />
          </span>
        )}
      </Link>
    </div>
  );
}

/**
 * Admin-managed hero carousel: autoplay (paused on hover/focus, off for reduced motion, with a
 * pause button for WCAG 2.2.2), dots, arrows on desktop and touch swipe.
 */
export function HeroCarousel({ slides, loading }: { slides: HeroSlide[]; loading?: boolean }) {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [paused, setPaused] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const total = slides.length;
  const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';

  const go = useCallback((d: number) => setIndex((i) => (total ? (i + d + total) % total : 0)), [total]);

  useEffect(() => {
    if (reduced || paused || hovered || total < 2) return;
    const id = window.setInterval(() => go(1), AUTOPLAY_MS);
    return () => window.clearInterval(id);
  }, [reduced, paused, hovered, total, go]);

  if (loading) return <Skeleton className="aspect-[8/3] w-full rounded-xl" />;
  if (!total) return null;

  return (
    <section
      aria-roledescription={t('home.hero.carousel')}
      aria-label={t('home.hero.label')}
      className="group/hero relative overflow-hidden rounded-xl bg-[#0B2826] shadow-pop"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setHovered(true)}
      onBlurCapture={() => setHovered(false)}
      onTouchStart={(e) => {
        const p = e.touches[0];
        if (p) touch.current = { x: p.clientX, y: p.clientY };
      }}
      onTouchEnd={(e) => {
        const s = touch.current;
        const p = e.changedTouches[0];
        touch.current = null;
        if (!s || !p) return;
        const dx = p.clientX - s.x;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(p.clientY - s.y)) go((dx < 0 ? 1 : -1) * (rtl ? -1 : 1));
      }}
    >
      <div className="aspect-[8/3] w-full">
        <div
          className={cn('flex h-full', !reduced && 'transition-transform duration-400 ease-souq')}
          style={{ transform: `translateX(${(rtl ? 1 : -1) * index * 100}%)` }}
          aria-live={paused || reduced ? 'polite' : 'off'}
        >
          {slides.map((s, i) => (
            <Slide key={`${s.title}-${i}`} slide={s} active={i === index} index={i} total={total} />
          ))}
        </div>
      </div>

      {total > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(-1)}
            className="absolute start-3 top-1/2 hidden size-10 -translate-y-1/2 place-items-center rounded-full bg-black/30 text-white opacity-0 backdrop-blur transition hover:bg-black/50 focus-visible:opacity-100 group-hover/hero:opacity-100 md:grid"
            aria-label={t('home.hero.prev')}
          >
            <ChevronLeft className="flip-rtl size-5" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            className="absolute end-3 top-1/2 hidden size-10 -translate-y-1/2 place-items-center rounded-full bg-black/30 text-white opacity-0 backdrop-blur transition hover:bg-black/50 focus-visible:opacity-100 group-hover/hero:opacity-100 md:grid"
            aria-label={t('home.hero.next')}
          >
            <ChevronRight className="flip-rtl size-5" />
          </button>
          <div className="absolute inset-x-0 bottom-2.5 flex items-center justify-center gap-1.5 sm:bottom-4">
            {slides.map((s, i) => (
              <button
                key={`${s.title}-dot-${i}`}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={t('home.hero.goTo', { n: i + 1 })}
                aria-current={i === index}
                className="grid h-6 place-items-center px-0.5"
              >
                <span className={cn('block h-1.5 rounded-full bg-white shadow transition-all duration-250', i === index ? 'w-6' : 'w-1.5 opacity-60')} />
              </button>
            ))}
            {!reduced && (
              <button
                type="button"
                onClick={() => setPaused((p) => !p)}
                aria-label={paused ? t('home.hero.play') : t('home.hero.pause')}
                className="ms-1 grid size-6 place-items-center rounded-full bg-black/30 text-white backdrop-blur hover:bg-black/50"
              >
                {paused ? <Play className="size-3" /> : <Pause className="size-3" />}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

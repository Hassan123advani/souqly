import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import * as Dialog from '@radix-ui/react-dialog';
import { ChevronLeft, ChevronRight, Expand, Play, X, ZoomIn, ZoomOut } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ProductImage } from '@/components/product/ProductImage';

export type Media = { kind: 'image'; url: string; alt: string } | { kind: 'video'; url: string; alt: string };

function Lightbox({
  media,
  index,
  onIndex,
  open,
  onOpenChange,
}: {
  media: Media[];
  index: number;
  onIndex: (i: number) => void;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation();
  const [zoom, setZoom] = useState(false);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  const dragging = useRef(false);
  const start = useRef({ x: 0, y: 0, moved: false });
  const item = media[index];
  useEffect(() => setZoom(false), [index, open]);

  const go = (d: number) => onIndex((index + d + media.length) % media.length);
  const track = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!zoom) return;
    if (e.pointerType !== 'mouse' && !dragging.current) return;
    if (dragging.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 6) start.current.moved = true;
    const r = e.currentTarget.getBoundingClientRect();
    setOrigin({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/90 animate-fade-in" />
        <Dialog.Content
          className="fixed inset-0 z-[80] flex flex-col text-white focus:outline-none"
          onKeyDown={(e) => {
            const rtl = document.documentElement.dir === 'rtl';
            if (e.key === 'ArrowRight') go(rtl ? -1 : 1);
            else if (e.key === 'ArrowLeft') go(rtl ? 1 : -1);
            else if (e.key === '+' || e.key === '=') setZoom(true);
            else if (e.key === '-') setZoom(false);
          }}
        >
          <Dialog.Title className="sr-only">{item?.alt}</Dialog.Title>
          <Dialog.Description className="sr-only">{t('pdp.lightboxHint')}</Dialog.Description>
          <div className="flex items-center justify-between gap-2 p-3">
            <span className="latin rounded-pill bg-white/10 px-3 py-1 text-xs font-semibold tabular" dir="ltr">
              {index + 1} / {media.length}
            </span>
            <div className="flex items-center gap-1">
              {item?.kind === 'image' && (
                <button
                  type="button"
                  onClick={() => setZoom((z) => !z)}
                  className="grid size-11 place-items-center rounded-full hover:bg-white/10"
                  aria-label={zoom ? t('pdp.zoomOut') : t('pdp.zoomIn')}
                >
                  {zoom ? <ZoomOut className="size-5" /> : <ZoomIn className="size-5" />}
                </button>
              )}
              <Dialog.Close className="grid size-11 place-items-center rounded-full hover:bg-white/10" aria-label={t('common.close')}>
                <X className="size-6" />
              </Dialog.Close>
            </div>
          </div>
          <div className="relative min-h-0 flex-1">
            {item?.kind === 'video' ? (
              <video src={item.url} controls autoPlay className="mx-auto h-full max-w-full" />
            ) : item ? (
              <div
                className={cn('size-full touch-none overflow-hidden', zoom ? 'cursor-zoom-out' : 'cursor-zoom-in')}
                onClick={() => {
                  // A drag-to-pan on touch must not toggle the zoom.
                  if (!start.current.moved) setZoom((z) => !z);
                }}
                onPointerDown={(e) => {
                  dragging.current = true;
                  start.current = { x: e.clientX, y: e.clientY, moved: false };
                  track(e);
                }}
                onPointerUp={() => (dragging.current = false)}
                onPointerLeave={() => (dragging.current = false)}
                onPointerMove={track}
              >
                <img
                  src={item.url}
                  alt={item.alt}
                  draggable={false}
                  className="size-full select-none object-contain transition-transform duration-250 ease-souq"
                  style={{ transform: zoom ? 'scale(2.5)' : 'scale(1)', transformOrigin: `${origin.x}% ${origin.y}%` }}
                />
              </div>
            ) : null}
            {media.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => go(-1)}
                  className="absolute start-3 top-1/2 grid size-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 backdrop-blur hover:bg-white/20"
                  aria-label={t('listing.prev')}
                >
                  <ChevronLeft className="flip-rtl size-6" />
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  className="absolute end-3 top-1/2 grid size-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 backdrop-blur hover:bg-white/20"
                  aria-label={t('listing.next')}
                >
                  <ChevronRight className="flip-rtl size-6" />
                </button>
              </>
            )}
          </div>
          <div className="no-scrollbar flex justify-center gap-2 overflow-x-auto p-3">
            {media.map((m, i) => (
              <button
                key={m.url}
                type="button"
                onClick={() => onIndex(i)}
                aria-label={m.alt}
                aria-current={i === index}
                className={cn('relative size-14 shrink-0 overflow-hidden rounded-md ring-2 transition', i === index ? 'ring-accent' : 'ring-transparent opacity-60 hover:opacity-100')}
              >
                {m.kind === 'video' ? (
                  <span className="grid size-full place-items-center bg-white/10">
                    <Play className="size-5" />
                  </span>
                ) : (
                  <img src={m.url} alt="" className="size-full object-cover" />
                )}
              </button>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Product gallery: start-side thumbnails + main image on desktop, a swipeable snap strip with dots
 * on mobile. Clicking opens a zoomable, pannable lightbox. Video (if any) is the last item.
 */
export function Gallery({ media, badges }: { media: Media[]; badges?: ReactNode }) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);
  const key = media.map((m) => m.url).join('|');

  // Reset when the media set changes (e.g. another variant with its own images).
  useEffect(() => {
    setIndex(0);
    stripRef.current?.scrollTo({ left: 0 });
  }, [key]);

  const current = media[index] ?? media[0];

  const onStripScroll = () => {
    const el = stripRef.current;
    if (!el) return;
    const i = Math.round(Math.abs(el.scrollLeft) / el.clientWidth);
    if (i !== index) setIndex(i);
  };

  return (
    <div>
      {/* Mobile: swipe strip */}
      <div className="relative -mx-4 sm:mx-0 md:hidden">
        <div ref={stripRef} onScroll={onStripScroll} className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto sm:rounded-lg">
          {media.map((m, i) => (
            <button
              key={m.url}
              type="button"
              className="relative w-full shrink-0 snap-center"
              onClick={() => {
                setIndex(i);
                setOpen(true);
              }}
              aria-label={t('pdp.openImage', { n: i + 1 })}
            >
              {m.kind === 'video' ? (
                <span className="grid aspect-square w-full place-items-center bg-ink-900 text-white">
                  <Play className="size-12" />
                </span>
              ) : (
                <ProductImage src={m.url} alt={m.alt} eager={i === 0} className="aspect-square w-full" />
              )}
            </button>
          ))}
        </div>
        {badges}
        {media.length > 1 && (
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5" aria-hidden>
            {media.map((m, i) => (
              <span key={m.url} className={cn('h-1.5 rounded-full bg-white shadow transition-all', i === index ? 'w-5' : 'w-1.5 opacity-60')} />
            ))}
          </div>
        )}
      </div>

      {/* Desktop: thumbnails + main */}
      <div className="hidden gap-3 md:flex">
        {media.length > 1 && (
          <ul className="no-scrollbar flex max-h-[560px] w-[72px] shrink-0 flex-col gap-2 overflow-y-auto" aria-label={t('pdp.thumbnails')}>
            {media.map((m, i) => (
              <li key={m.url}>
                <button
                  type="button"
                  onClick={() => setIndex(i)}
                  onMouseEnter={() => setIndex(i)}
                  aria-label={t('pdp.showImage', { n: i + 1 })}
                  aria-current={i === index}
                  className={cn(
                    'relative block size-[72px] overflow-hidden rounded-md border-2 bg-surface-2 transition',
                    i === index ? 'border-primary-600' : 'border-transparent opacity-75 hover:opacity-100',
                  )}
                >
                  {m.kind === 'video' ? (
                    <span className="grid size-full place-items-center bg-ink-900 text-white">
                      <Play className="size-5" />
                    </span>
                  ) : (
                    <img src={m.url} alt="" className="size-full object-cover" loading="lazy" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="relative min-w-0 flex-1">
          {current?.kind === 'video' ? (
            <video src={current.url} controls className="aspect-square w-full rounded-lg bg-ink-900 object-contain" />
          ) : (
            <button type="button" onClick={() => setOpen(true)} className="group relative block w-full cursor-zoom-in overflow-hidden rounded-lg border border-border" aria-label={t('pdp.zoomIn')}>
              <ProductImage src={current?.url} alt={current?.alt ?? ''} eager className="aspect-square w-full" imgClassName="group-hover:scale-105" />
              <span className="absolute bottom-3 end-3 grid size-10 place-items-center rounded-full bg-surface/90 text-fg opacity-0 shadow-card transition group-hover:opacity-100" aria-hidden>
                <Expand className="size-4" />
              </span>
            </button>
          )}
          {badges}
        </div>
      </div>

      <Lightbox media={media} index={index} onIndex={setIndex} open={open} onOpenChange={setOpen} />
    </div>
  );
}

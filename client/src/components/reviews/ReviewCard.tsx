import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { BadgeCheck, ChevronLeft, ChevronRight, Flag, MoreHorizontal, Play, Store, ThumbsUp } from 'lucide-react';
import type { ReviewDTO, ReviewMediaDTO } from '@souqly/shared';
import { useHelpfulVote } from '@/api/social';
import { ReportDialog } from '@/components/social/ReportDialog';
import { socialError } from '@/components/social/errors';
import { useAuthGate } from '@/components/social/useAuthGate';
import {
  Avatar,
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  Modal,
  Rating,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { useLang } from '@/lib/catalog';
import { formatDate } from '@/lib/format';

/** Fullscreen-ish viewer for review photos and videos with prev/next. */
export function MediaLightbox({ media, index, onClose }: { media: ReviewMediaDTO[]; index: number; onClose: () => void }) {
  const { t } = useTranslation();
  const [i, setI] = useState(index);
  const m = media[i];
  if (!m) return null;
  const go = (d: number) => setI((x) => (x + d + media.length) % media.length);
  return (
    <Modal open onOpenChange={(v) => !v && onClose()} title={t('reviews.mediaN', { i: i + 1, n: media.length })} size="xl">
      <div
        className="relative grid min-h-[50dvh] place-items-center rounded-md bg-ink-950"
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') go(document.dir === 'rtl' ? -1 : 1);
          if (e.key === 'ArrowLeft') go(document.dir === 'rtl' ? 1 : -1);
        }}
      >
        {m.type === 'video' ? (
          <video src={m.url} controls autoPlay className="max-h-[70dvh] w-full" />
        ) : (
          <img src={m.url} alt="" className="max-h-[70dvh] w-auto object-contain" />
        )}
        {media.length > 1 && (
          <>
            <IconButton label={t('reviews.prev')} size="md" onClick={() => go(-1)} className="absolute start-2 top-1/2 -translate-y-1/2 bg-surface/90">
              <ChevronLeft className="size-5 rtl:rotate-180" />
            </IconButton>
            <IconButton label={t('reviews.next')} size="md" onClick={() => go(1)} className="absolute end-2 top-1/2 -translate-y-1/2 bg-surface/90">
              <ChevronRight className="size-5 rtl:rotate-180" />
            </IconButton>
          </>
        )}
      </div>
    </Modal>
  );
}

export function MediaStrip({ media, onOpen, size = 'md' }: { media: ReviewMediaDTO[]; onOpen: (i: number) => void; size?: 'sm' | 'md' }) {
  const { t } = useTranslation();
  if (!media.length) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {media.map((m, i) => (
        <li key={m.url}>
          <button
            type="button"
            onClick={() => onOpen(i)}
            className={cn('relative block overflow-hidden rounded-md border border-border bg-surface-2', size === 'sm' ? 'size-14' : 'size-20')}
            aria-label={t(m.type === 'video' ? 'reviews.openVideo' : 'reviews.openPhoto', { n: i + 1 })}
          >
            {m.type === 'video' ? (
              <>
                <video src={m.url} muted preload="metadata" className="size-full object-cover" />
                <span className="absolute inset-0 grid place-items-center bg-ink-950/35 text-white">
                  <Play className="size-6 fill-current" aria-hidden />
                </span>
              </>
            ) : (
              <img src={m.url} alt="" loading="lazy" className="size-full object-cover" />
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** One review: stars, verified badge, media, helpful vote, report and the seller's reply. */
export function ReviewCard({ r, slug, showProduct }: { r: ReviewDTO; slug?: string; showProduct?: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  const vote = useHelpfulVote(slug ?? '');
  const gate = useAuthGate();
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [report, setReport] = useState(false);
  const canInteract = !!slug;

  return (
    <article className="space-y-3 py-5">
      <header className="flex items-start gap-3">
        <Avatar src={r.author.avatar} name={r.author.name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">
            {r.author.name}
            {r.verified && (
              <Badge tone="success" size="sm">
                <BadgeCheck className="size-3" aria-hidden />
                {t('reviews.verified')}
              </Badge>
            )}
            {r.status === 'pending' && (
              <Badge tone="warning" size="sm">
                {t('reviews.pendingModeration')}
              </Badge>
            )}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
            <Rating value={r.rating} />
            <span>{formatDate(r.createdAt, lang, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            {r.variantLabel && <span className="text-fg-subtle">· {r.variantLabel}</span>}
          </p>
        </div>
        {canInteract && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton label={t('common.moreActions')} variant="ghost" size="sm">
                <MoreHorizontal className="size-4" />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem icon={<Flag className="size-4" />} onSelect={() => gate(() => setReport(true))}>
                {t('reviews.report')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      {showProduct && r.product && (
        <Link to={`/p/${r.product.slug}`} className="flex items-center gap-2 text-sm font-medium text-primary-700 hover:underline">
          {r.product.image && <img src={r.product.image} alt="" className="size-8 rounded-sm object-cover" />}
          <span className="line-clamp-1">{r.product.title}</span>
        </Link>
      )}
      {r.title && <h3 className="font-bold text-fg">{r.title}</h3>}
      {r.body && <p className="whitespace-pre-line text-sm leading-relaxed text-fg">{r.body}</p>}
      <MediaStrip media={r.media} onOpen={setLightbox} />

      {r.reply && (
        <div className="rounded-md border-s-4 border-primary bg-primary-50/50 p-3">
          <p className="flex items-center gap-1.5 text-xs font-bold text-primary-800">
            <Store className="size-3.5" aria-hidden />
            {t('reviews.sellerReply')}
            <span className="font-normal text-fg-subtle">· {formatDate(r.reply.at, lang, { day: 'numeric', month: 'short' })}</span>
          </p>
          <p className="mt-1 whitespace-pre-line text-sm text-fg">{r.reply.text}</p>
        </div>
      )}

      {canInteract && (
        <Button
          variant={r.myVote ? 'secondary' : 'ghost'}
          size="sm"
          aria-pressed={!!r.myVote}
          leftIcon={<ThumbsUp className={cn('size-4', r.myVote && 'fill-current')} />}
          onClick={() =>
            gate(() => {
              vote.mutate({ id: r.id, on: !r.myVote }, { onError: (e) => toast.error(socialError(e)) });
            })
          }
        >
          {t('reviews.helpful')} {r.helpfulCount > 0 && <span className="latin tabular">({r.helpfulCount})</span>}
        </Button>
      )}

      {lightbox !== null && <MediaLightbox media={r.media} index={lightbox} onClose={() => setLightbox(null)} />}
      {report && <ReportDialog open onOpenChange={setReport} targetType="review" targetId={r.id} />}
    </article>
  );
}

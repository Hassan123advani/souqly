import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MapPin, Star, Users } from 'lucide-react';
import type { StoreCard as StoreCardData } from '@souqly/shared';
import { Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { compactNumber } from '@/lib/catalog';
import { readableOn } from '@/lib/contrast';
import { MallBadge } from './ProductCard';

export function StoreLogo({ src, name, color, className }: { src?: string; name: string; color?: string; className?: string }) {
  const bg = color ?? '#0E5E5A';
  return (
    <span
      className={cn('grid shrink-0 place-items-center overflow-hidden rounded-full border-2 border-surface bg-surface font-extrabold shadow-card', className)}
      style={src ? undefined : { background: bg, color: readableOn(bg) }}
    >
      {src ? <img src={src} alt="" loading="lazy" className="size-full object-cover" /> : <span className="latin">{name.slice(0, 1).toUpperCase()}</span>}
    </span>
  );
}

export function StoreCard({ store: s, className }: { store: StoreCardData; className?: string }) {
  const { t } = useTranslation();
  return (
    <article
      className={cn(
        'group relative flex w-full flex-col overflow-hidden rounded-lg border border-border bg-surface transition-[box-shadow,transform] duration-250 ease-souq hover:-translate-y-0.5 hover:shadow-pop',
        className,
      )}
    >
      <div className="relative aspect-[4/1] overflow-hidden" style={{ background: s.themeColor }}>
        {s.banner && <img src={s.banner} alt="" loading="lazy" className="size-full object-cover transition-transform duration-400 group-hover:scale-105" />}
        {s.isMall && <MallBadge className="absolute end-2 top-2 shadow-sm" />}
      </div>
      <div className="flex flex-1 flex-col px-4 pb-4">
        <StoreLogo src={s.logo} name={s.name} color={s.themeColor} className="-mt-7 size-14 text-lg" />
        <h3 className="mt-2 truncate font-bold text-fg">
          <Link to={`/store/${s.slug}`} className="outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline">
            {s.name}
          </Link>
        </h3>
        {s.tagline && <p className="mt-0.5 line-clamp-2 text-xs text-fg-muted">{s.tagline}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-xs text-fg-muted">
          <span className="inline-flex items-center gap-1">
            <Star className="size-3.5 fill-accent text-accent" aria-hidden />
            <span className="latin font-semibold text-fg tabular">{s.ratingAvg.toFixed(1)}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Users className="size-3.5" aria-hidden />
            {t('store.followersN', { n: compactNumber(s.followerCount) })}
          </span>
          {s.city && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden />
              {s.city}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

export function StoreCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface" aria-hidden>
      <Skeleton className="aspect-[4/1] rounded-none" />
      <div className="px-4 pb-4">
        <Skeleton className="-mt-7 size-14 rounded-full border-2 border-surface" />
        <Skeleton className="mt-3 h-3.5 w-2/3" />
        <Skeleton className="mt-2 h-3 w-full" />
        <Skeleton className="mt-4 h-3 w-1/2" />
      </div>
    </div>
  );
}

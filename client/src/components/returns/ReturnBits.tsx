import { useTranslation } from 'react-i18next';
import type { ReturnRequestDTO, ReturnStatus } from '@souqly/shared';
import { Badge, type BadgeTone } from '@/components/ui';
import { ProductImage } from '@/components/product/ProductImage';
import { cn } from '@/lib/cn';
import { formatDateTime, money } from '@/lib/format';
import { useUi } from '@/stores/ui';

const TONES: Record<ReturnStatus, BadgeTone> = {
  requested: 'warning',
  approved: 'info',
  rejected: 'danger',
  received: 'primary',
  refunded: 'success',
  escalated: 'sale',
};

export function ReturnStatusBadge({ status, className }: { status: ReturnStatus; className?: string }) {
  const { t } = useTranslation();
  return (
    <Badge tone={TONES[status]} className={className}>
      {t(`returns.status.${status}`)}
    </Badge>
  );
}

/** Returned lines with thumbnail, options, price × qty and per-item reason. */
export function ReturnItems({ r }: { r: ReturnRequestDTO }) {
  const { t } = useTranslation();
  return (
    <ul className="divide-y divide-border">
      {r.items.map((i) => (
        <li key={i.variantId} className="flex items-center gap-3 py-3">
          <ProductImage src={i.image} alt={i.title} className="size-14 shrink-0 rounded-md" />
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-sm font-medium text-fg">{i.title}</p>
            <p className="truncate text-xs text-fg-subtle">
              {[...Object.values(i.options), `${money(i.price)} × ${i.qty}`, i.reason ? t(`returns.reasons.${i.reason}`) : ''].filter(Boolean).join(' · ')}
            </p>
          </div>
          <span className="latin shrink-0 text-sm font-semibold tabular text-fg" dir="ltr">
            {money(i.price * i.qty)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ReturnTimeline({ r }: { r: ReturnRequestDTO }) {
  const { t } = useTranslation();
  const lang = useUi((s) => s.language);
  const events = [...r.timeline].reverse();
  return (
    <ol className="grid gap-4">
      {events.map((e, i) => (
        <li key={`${e.status}-${e.at}`} className="flex gap-3">
          <span className={cn('mt-1 size-2.5 shrink-0 rounded-full', i === 0 ? 'bg-primary ring-4 ring-primary-100' : 'bg-border-strong')} aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-fg">{t(`returns.status.${e.status}`)}</p>
            <p className="text-xs text-fg-muted">
              {formatDateTime(e.at, lang)} · {t(`returns.actor.${e.actor}`, { defaultValue: e.actor })}
            </p>
            {e.note && <p className="mt-0.5 whitespace-pre-line text-xs text-fg">{e.note}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function ReturnPhotos({ photos }: { photos: string[] }) {
  const { t } = useTranslation();
  if (!photos.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {photos.map((src, i) => (
        <a key={src} href={src} target="_blank" rel="noreferrer" className="block size-20 overflow-hidden rounded-md border border-border bg-surface-2">
          <img src={src} alt={t('returns.photoAlt', { n: i + 1 })} className="size-full object-cover" loading="lazy" />
        </a>
      ))}
    </div>
  );
}

/** Refund summary line. */
export function RefundLine({ r }: { r: ReturnRequestDTO }) {
  const { t } = useTranslation();
  const lang = useUi((s) => s.language);
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-surface-2 px-3 py-2.5 text-sm">
      <span className="text-fg-muted">
        {t('returns.refund')} · {t(`returns.refundMethod.${r.refund.method}`)}
        {r.refund.at && <span className="block text-xs text-fg-subtle">{formatDateTime(r.refund.at, lang)}</span>}
      </span>
      <span className="latin font-bold tabular text-fg" dir="ltr">
        {money(r.refund.amount)}
      </span>
    </div>
  );
}

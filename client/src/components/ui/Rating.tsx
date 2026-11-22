import { Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';

export function Rating({
  value,
  count,
  size = 'sm',
  className,
}: {
  value: number;
  count?: number;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const { t } = useTranslation();
  const v = Math.max(0, Math.min(5, value));
  const icon = size === 'sm' ? 'size-3.5' : 'size-5';
  return (
    <span
      className={cn('inline-flex items-center gap-1.5', className)}
      role="img"
      aria-label={t('rating.label', { value: v.toFixed(1) })}
    >
      <span className="relative inline-flex" aria-hidden>
        <span className="flex text-ink-300">
          {[0, 1, 2, 3, 4].map((i) => (
            <Star key={i} className={cn(icon, 'fill-current')} />
          ))}
        </span>
        <span className="absolute inset-y-0 start-0 flex overflow-hidden text-accent" style={{ width: `${(v / 5) * 100}%` }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Star key={i} className={cn(icon, 'shrink-0 fill-current')} />
          ))}
        </span>
      </span>
      {count !== undefined && <span className="latin text-xs text-fg-muted tabular">({count})</span>}
    </span>
  );
}

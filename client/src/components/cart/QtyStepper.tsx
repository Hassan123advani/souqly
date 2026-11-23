import { Minus, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';

/** Compact − qty + control. Bounds are enforced here; the server enforces them again. */
export function QtyStepper({
  value,
  max,
  onChange,
  disabled,
  className,
}: {
  value: number;
  max: number;
  onChange: (qty: number) => void;
  disabled?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const btn =
    'grid size-8 place-items-center text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:pointer-events-none disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring';
  return (
    <div
      className={cn('inline-flex items-center overflow-hidden rounded-md border border-border-strong bg-surface', className)}
      role="group"
      aria-label={t('cart.qty')}
    >
      <button type="button" className={btn} disabled={disabled || value <= 1} onClick={() => onChange(value - 1)} aria-label={t('cart.decrease')}>
        <Minus className="size-3.5" />
      </button>
      <span className="latin min-w-8 text-center text-sm font-bold tabular" aria-live="polite">
        {value}
      </span>
      <button type="button" className={btn} disabled={disabled || value >= max} onClick={() => onChange(value + 1)} aria-label={t('cart.increase')}>
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}

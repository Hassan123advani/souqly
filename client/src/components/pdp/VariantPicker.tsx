import { useTranslation } from 'react-i18next';
import { Check, Minus, Plus } from 'lucide-react';
import type { ProductDetail } from '@souqly/shared';
import { cn } from '@/lib/cn';
import { isLightSwatch, swatchFor } from '@/lib/colors';
import { valueState, type Selection } from '@/lib/variants';

/** Option buttons per product option; color options render as swatches. Out-of-stock values are disabled. */
export function VariantPicker({
  product,
  selection,
  onChoose,
  onSizeGuide,
}: {
  product: ProductDetail;
  selection: Selection;
  onChoose: (key: string, value: string) => void;
  onSizeGuide?: () => void;
}) {
  const { t } = useTranslation();
  if (!product.options.length) return null;
  return (
    <div className="space-y-4">
      {product.options.map((o) => {
        const isColor = o.key === 'color' || o.values.every((v) => swatchFor(v));
        const isSize = o.key === 'size';
        return (
          <fieldset key={o.key}>
            <legend className="mb-2 flex w-full items-center justify-between gap-2 text-sm">
              <span>
                <span className="font-semibold text-fg">{o.name}:</span> <span className="text-fg-muted">{selection[o.key] ?? '—'}</span>
              </span>
              {isSize && onSizeGuide && (
                <button type="button" onClick={onSizeGuide} className="text-xs font-semibold text-primary-700 underline-offset-4 hover:underline">
                  {t('pdp.sizeGuide')}
                </button>
              )}
            </legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={o.name}>
              {o.values.map((v) => {
                const state = valueState(product, selection, o.key, v);
                const on = selection[o.key] === v;
                const disabled = state === 'oos';
                const label = disabled ? t('pdp.valueOos', { value: v }) : v;
                if (isColor) {
                  const sw = swatchFor(v);
                  return (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      aria-label={label}
                      title={label}
                      disabled={disabled}
                      onClick={() => onChoose(o.key, v)}
                      className={cn(
                        'relative grid size-10 place-items-center rounded-full ring-offset-2 ring-offset-surface transition',
                        on ? 'ring-2 ring-primary-600' : 'hover:ring-2 hover:ring-border-strong',
                        (!sw || isLightSwatch(v)) && 'border border-border-strong',
                        disabled && 'cursor-not-allowed opacity-40',
                      )}
                      style={{ background: sw ?? 'rgb(var(--surface-2))' }}
                    >
                      {!sw && <span className="text-[10px] font-semibold text-fg">{v.slice(0, 2)}</span>}
                      {on && <Check className={cn('size-4', sw && !isLightSwatch(v) ? 'text-white' : 'text-ink-900')} aria-hidden />}
                      {disabled && <span className="absolute h-px w-10 rotate-45 bg-fg-muted" aria-hidden />}
                    </button>
                  );
                }
                return (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={label}
                    disabled={disabled}
                    onClick={() => onChoose(o.key, v)}
                    className={cn(
                      'min-w-12 rounded-md border px-3.5 py-2 text-sm font-semibold transition',
                      on ? 'border-primary-600 bg-primary-50 text-primary-800 ring-1 ring-primary-600' : 'border-border-strong bg-surface text-fg hover:border-primary-500',
                      state === 'alt' && !on && 'border-dashed',
                      disabled && 'cursor-not-allowed border-border text-fg-subtle line-through opacity-60 hover:border-border',
                    )}
                  >
                    {v}
                  </button>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}

export function QtyStepper({ value, max, onChange, disabled }: { value: number; max: number; onChange: (n: number) => void; disabled?: boolean }) {
  const { t } = useTranslation();
  const cap = Math.max(1, Math.min(max, 99));
  const btn = 'grid size-10 place-items-center text-fg transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40';
  return (
    <div className="inline-flex items-center overflow-hidden rounded-md border border-border-strong bg-surface" role="group" aria-label={t('pdp.quantity')}>
      <button type="button" className={btn} onClick={() => onChange(value - 1)} disabled={disabled || value <= 1} aria-label={t('pdp.decrease')}>
        <Minus className="size-4" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={cap}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(Math.max(1, Math.min(cap, Math.floor(n))));
        }}
        aria-label={t('pdp.quantity')}
        className="latin h-10 w-12 border-x border-border bg-transparent text-center text-sm font-bold text-fg tabular [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none"
        dir="ltr"
      />
      <button type="button" className={btn} onClick={() => onChange(value + 1)} disabled={disabled || value >= cap} aria-label={t('pdp.increase')}>
        <Plus className="size-4" />
      </button>
    </div>
  );
}

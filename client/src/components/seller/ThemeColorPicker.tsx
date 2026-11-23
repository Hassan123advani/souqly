import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { Badge, Input } from '@/components/ui';
import { cn } from '@/lib/cn';
import { contrastRatio, parseHex, readableOn } from '@/lib/contrast';

export const THEME_PRESETS = ['#0E5E5A', '#1F4E8C', '#6B2D8C', '#B3261E', '#C2571A', '#2E7D32', '#8C5A2B', '#1F2937'];

/** Brand color picker: presets, native picker + hex input, and a live contrast preview. */
export function ThemeColorPicker({ value, onChange, storeName }: { value: string; onChange: (hex: string) => void; storeName: string }) {
  const { t } = useTranslation();
  const rgb = parseHex(value);
  const fg = rgb ? readableOn(value) : '#FFFFFF';
  const ratio = rgb ? contrastRatio(rgb, parseHex(fg)!) : 0;
  const onWhite = rgb ? contrastRatio(rgb, [255, 255, 255]) : 0;
  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
      <div className="grid content-start gap-3">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('seller.theme.presets')}>
          {THEME_PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={value.toUpperCase() === c}
              aria-label={c}
              onClick={() => onChange(c)}
              className="grid size-9 place-items-center rounded-full ring-offset-2 ring-offset-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              style={{ backgroundColor: c }}
            >
              {value.toUpperCase() === c && <Check className="size-4" style={{ color: readableOn(c) }} />}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={rgb ? value : '#0E5E5A'}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            aria-label={t('seller.theme.custom')}
            className="h-11 w-14 cursor-pointer rounded-md border border-border bg-surface p-1"
          />
          <Input dir="ltr" value={value} onChange={(e) => onChange(e.target.value.trim())} maxLength={7} className="w-32 font-mono uppercase" aria-label={t('seller.theme.hex')} />
        </div>
      </div>
      <div className="w-full overflow-hidden rounded-lg border border-border sm:w-56" aria-label={t('seller.theme.preview')}>
        <div className="flex h-16 items-end p-3" style={{ backgroundColor: rgb ? value : undefined, color: fg }}>
          <p className="truncate text-sm font-bold">{storeName || t('seller.theme.sampleName')}</p>
        </div>
        <div className="flex items-center justify-between gap-2 bg-surface p-3">
          <span className="rounded-md px-3 py-1.5 text-xs font-bold" style={{ backgroundColor: rgb ? value : undefined, color: fg }}>
            {t('seller.theme.sampleButton')}
          </span>
          <Badge tone={ratio >= 4.5 && onWhite >= 3 ? 'success' : 'warning'} size="sm">
            {ratio >= 4.5 && onWhite >= 3 ? t('seller.theme.aa') : t('seller.theme.lowContrast')}
          </Badge>
        </div>
        <p className={cn('bg-surface px-3 pb-3 text-[11px] text-fg-muted')}>{t('seller.theme.ratio', { ratio: ratio.toFixed(1) })}</p>
      </div>
    </div>
  );
}

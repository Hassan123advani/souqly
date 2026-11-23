import { useTranslation } from 'react-i18next';
import type { AttributeDef } from '@souqly/shared';
import { useCategory } from '@/api/catalog';
import { FormField, Input, Select, Skeleton } from '@/components/ui';
import { useLocalized } from '@/lib/catalog';
import { cn } from '@/lib/cn';

type Value = Record<string, string | string[]>;

/** Attributes defined on the chosen category (own + inherited). Variant-defining ones are handled as options. */
export function AttributesFields({ categorySlug, value, onChange }: { categorySlug?: string; value: Value; onChange: (v: Value) => void }) {
  const { t } = useTranslation();
  const loc = useLocalized();
  const { data, isLoading } = useCategory(categorySlug);
  if (!categorySlug) return <p className="text-sm text-fg-muted">{t('seller.editor.attributesPickCategory')}</p>;
  if (isLoading) return <Skeleton className="h-24 w-full" />;
  const defs = (data?.filters.attributes ?? []).filter((a) => !a.variantDefining);
  if (!defs.length) return <p className="text-sm text-fg-muted">{t('seller.editor.attributesNone')}</p>;

  const set = (k: string, v: string | string[]) => onChange({ ...value, [k]: v });
  const field = (a: AttributeDef) => {
    const cur = value[a.key];
    if ((a.type === 'select' || a.type === 'size' || a.type === 'color') && a.options?.length) {
      return (
        <Select
          value={typeof cur === 'string' ? cur : ''}
          onValueChange={(v) => set(a.key, v)}
          placeholder={t('seller.common.choose')}
          options={a.options.map((o) => ({ value: o, label: o }))}
          aria-label={loc(a.label)}
        />
      );
    }
    if (a.type === 'multiselect' && a.options?.length) {
      const arr = Array.isArray(cur) ? cur : [];
      return (
        <div className="flex flex-wrap gap-1.5">
          {a.options.map((o) => (
            <button
              key={o}
              type="button"
              aria-pressed={arr.includes(o)}
              onClick={() => set(a.key, arr.includes(o) ? arr.filter((x) => x !== o) : [...arr, o])}
              className={cn(
                'h-8 rounded-pill border px-3 text-xs font-semibold',
                arr.includes(o) ? 'border-primary bg-primary text-white' : 'border-border text-fg hover:border-primary-400',
              )}
            >
              {o}
            </button>
          ))}
        </div>
      );
    }
    return <Input value={typeof cur === 'string' ? cur : ''} inputMode={a.type === 'number' ? 'decimal' : 'text'} onChange={(e) => set(a.key, e.target.value)} />;
  };
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {defs.map((a) => (
        <FormField key={a.key} label={a.unit ? `${loc(a.label)} (${a.unit})` : loc(a.label)}>
          {field(a)}
        </FormField>
      ))}
    </div>
  );
}

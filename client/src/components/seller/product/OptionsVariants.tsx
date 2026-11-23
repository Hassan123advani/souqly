import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, X } from 'lucide-react';
import { Button, IconButton, Input } from '@/components/ui';
import { buildVariants, optionKey, type OptionRow, type VariantRow } from './model';

type Props = {
  options: OptionRow[];
  variants: VariantRow[];
  onChange: (next: { options: OptionRow[]; variants: VariantRow[] }) => void;
  errors?: Record<number, string>;
};

const COLS = ['price', 'compareAtPrice', 'stock', 'sku', 'barcode'] as const;
type Col = (typeof COLS)[number];

function ValueAdder({ onAdd }: { onAdd: (v: string) => void }) {
  const { t } = useTranslation();
  const [v, setV] = useState('');
  const add = () => {
    for (const part of v.split(',')) if (part.trim()) onAdd(part.trim().slice(0, 40));
    setV('');
  };
  return (
    <Input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault();
          add();
        }
      }}
      onBlur={add}
      placeholder={t('seller.editor.addValue')}
      aria-label={t('seller.editor.addValue')}
      className="h-9 w-40 text-sm"
    />
  );
}

/** Options (e.g. Color / Size, max 3) → auto-generated variants matrix with "apply to all". */
export function OptionsVariants({ options, variants, onChange, errors }: Props) {
  const { t } = useTranslation();
  const [bulk, setBulk] = useState<Record<Col, string>>({ price: '', compareAtPrice: '', stock: '', sku: '', barcode: '' });

  const setOptions = (next: OptionRow[]) => onChange({ options: next, variants: buildVariants(next, variants) });
  const setCell = (i: number, col: Col, v: string) => onChange({ options, variants: variants.map((r, j) => (j === i ? { ...r, [col]: v } : r)) });
  const applyAll = (col: Col) => {
    if (!bulk[col]) return;
    onChange({
      options,
      variants: variants.map((r, i) => ({ ...r, [col]: col === 'sku' ? `${bulk.sku}-${i + 1}` : bulk[col] })),
    });
  };
  const label = (r: VariantRow) => Object.values(r.options).join(' / ') || t('seller.editor.defaultVariant');

  return (
    <div className="grid gap-5">
      <div className="grid gap-3">
        {options.map((o, i) => (
          <div key={i} className="rounded-md border border-border p-3">
            <div className="flex items-center gap-2">
              <Input
                value={o.name}
                maxLength={30}
                onChange={(e) => {
                  const name = e.target.value;
                  setOptions(options.map((x, j) => (j === i ? { ...x, name } : x)));
                }}
                onBlur={() => {
                  // Re-key on blur so variant option maps follow the name (only safe before values exist).
                  if (!o.values.length && o.name.trim()) setOptions(options.map((x, j) => (j === i ? { ...x, key: optionKey(x.name) } : x)));
                }}
                placeholder={t('seller.editor.optionName')}
                aria-label={t('seller.editor.optionName')}
                className="h-9 max-w-56"
              />
              <IconButton label={t('seller.editor.removeOption')} variant="ghost" size="sm" className="ms-auto" onClick={() => setOptions(options.filter((_, j) => j !== i))}>
                <Trash2 className="size-4" />
              </IconButton>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {o.values.map((v) => (
                <span key={v} className="inline-flex h-8 items-center gap-1 rounded-pill bg-surface-2 ps-3 pe-1 text-sm font-medium text-fg">
                  {v}
                  <button
                    type="button"
                    aria-label={t('seller.editor.removeValue', { value: v })}
                    onClick={() => setOptions(options.map((x, j) => (j === i ? { ...x, values: x.values.filter((y) => y !== v) } : x)))}
                    className="grid size-6 place-items-center rounded-full hover:bg-surface"
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              ))}
              <ValueAdder
                onAdd={(v) =>
                  setOptions(
                    options.map((x, j) =>
                      j === i && !x.values.includes(v) && x.values.length < 30 ? { ...x, key: x.values.length ? x.key : optionKey(x.name), values: [...x.values, v] } : x,
                    ),
                  )
                }
              />
            </div>
          </div>
        ))}
        {options.length < 3 && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-fit"
            leftIcon={<Plus className="size-4" />}
            onClick={() => {
              const name = options.length === 0 ? t('seller.editor.optionColor') : options.length === 1 ? t('seller.editor.optionSize') : '';
              onChange({ options: [...options, { key: optionKey(name || `option${options.length + 1}`), name, values: [] }], variants });
            }}
          >
            {t('seller.editor.addOption')}
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-surface-2 text-xs text-fg-muted">
            <tr>
              <th className="px-3 py-2 text-start font-semibold">{t('seller.editor.variant')}</th>
              {COLS.map((c) => (
                <th key={c} className="px-2 py-2 text-start font-semibold">
                  {t(`seller.editor.cols.${c}`)}
                </th>
              ))}
            </tr>
            {variants.length > 1 && (
              <tr className="border-t border-border bg-surface">
                <td className="px-3 py-1.5 text-xs font-semibold text-fg-muted">{t('seller.editor.applyAll')}</td>
                {COLS.map((c) => (
                  <td key={c} className="px-2 py-1.5">
                    <div className="flex gap-1">
                      <Input
                        value={bulk[c]}
                        onChange={(e) => setBulk({ ...bulk, [c]: e.target.value })}
                        inputMode={c === 'sku' || c === 'barcode' ? 'text' : 'decimal'}
                        aria-label={`${t('seller.editor.applyAll')} ${t(`seller.editor.cols.${c}`)}`}
                        className="h-8 text-xs"
                      />
                      <Button type="button" size="sm" variant="ghost" className="h-8 px-2" onClick={() => applyAll(c)}>
                        {t('seller.editor.apply')}
                      </Button>
                    </div>
                  </td>
                ))}
              </tr>
            )}
          </thead>
          <tbody className="divide-y divide-border">
            {variants.map((r, i) => (
              <tr key={JSON.stringify(r.options)} className={errors?.[i] ? 'bg-danger-soft' : undefined}>
                <td className="px-3 py-2 font-medium text-fg">
                  {label(r)}
                  {errors?.[i] && <p className="text-xs font-normal text-danger">{errors[i]}</p>}
                </td>
                {COLS.map((c) => (
                  <td key={c} className="px-2 py-1.5">
                    <Input
                      value={r[c]}
                      onChange={(e) => setCell(i, c, e.target.value)}
                      inputMode={c === 'sku' || c === 'barcode' ? 'text' : c === 'stock' ? 'numeric' : 'decimal'}
                      dir="ltr"
                      aria-label={`${label(r)} ${t(`seller.editor.cols.${c}`)}`}
                      className="h-9 text-sm"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-fg-muted">{t('seller.editor.variantsHint', { count: variants.length })}</p>
    </div>
  );
}

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { Button, IconButton, Input } from '@/components/ui';

type Col<T> = { key: keyof T & string; label: string; inputMode?: 'text' | 'decimal' | 'numeric'; className?: string };

/** Generic editable list of small records (specs, wholesale tiers...). */
export function Repeater<T extends Record<string, string>>({
  rows,
  onChange,
  cols,
  blank,
  max,
  addLabel,
  empty,
}: {
  rows: T[];
  onChange: (rows: T[]) => void;
  cols: Col<T>[];
  blank: T;
  max: number;
  addLabel: string;
  empty?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-2">
      {rows.length === 0 && empty}
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          {cols.map((c) => (
            <Input
              key={c.key}
              value={r[c.key]}
              inputMode={c.inputMode}
              placeholder={c.label}
              aria-label={`${c.label} ${i + 1}`}
              className={c.className ?? 'h-10 flex-1'}
              onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, [c.key]: e.target.value } : x)))}
            />
          ))}
          <IconButton label={t('seller.common.remove')} variant="ghost" size="sm" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      ))}
      {rows.length < max && (
        <Button type="button" size="sm" variant="outline" className="w-fit" leftIcon={<Plus className="size-4" />} onClick={() => onChange([...rows, { ...blank }])}>
          {addLabel}
        </Button>
      )}
    </div>
  );
}

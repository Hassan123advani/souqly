import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type RadioOption = { value: string; label: ReactNode; description?: ReactNode; icon?: ReactNode; disabled?: boolean };

type RadioGroupProps = {
  value: string;
  onChange: (v: string) => void;
  options: RadioOption[];
  name?: string;
  legend?: ReactNode;
  /** "cards" renders selectable tiles (good for theme / language pickers). */
  variant?: 'list' | 'cards';
  columns?: 2 | 3 | 4;
  className?: string;
};

export function RadioGroup({ value, onChange, options, name, legend, variant = 'list', columns = 3, className }: RadioGroupProps) {
  const auto = useId();
  const groupName = name ?? `rg-${auto}`;
  const grid = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4' }[columns];
  return (
    <fieldset className={className}>
      {legend && <legend className="mb-2 text-sm font-semibold text-fg">{legend}</legend>}
      <div className={cn(variant === 'cards' ? cn('grid grid-cols-1 gap-2', grid) : 'flex flex-col gap-2')}>
        {options.map((o) => {
          const checked = o.value === value;
          return (
            <label
              key={o.value}
              className={cn(
                'group relative flex cursor-pointer items-center gap-3 text-sm',
                variant === 'cards' &&
                  cn(
                    'rounded-lg border bg-surface p-3.5 transition-colors duration-150',
                    checked ? 'border-primary bg-primary-50 ring-1 ring-primary' : 'border-border hover:border-border-strong',
                  ),
                o.disabled && 'cursor-not-allowed opacity-50',
              )}
            >
              <input
                type="radio"
                name={groupName}
                value={o.value}
                checked={checked}
                disabled={o.disabled}
                onChange={() => onChange(o.value)}
                className={cn(
                  'size-[18px] shrink-0 cursor-pointer appearance-none rounded-full border-2 border-border-strong bg-surface',
                  'checked:border-[6px] checked:border-primary',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                )}
              />
              {o.icon && <span className="text-fg-muted">{o.icon}</span>}
              <span>
                <span className="font-medium text-fg">{o.label}</span>
                {o.description && <span className="block text-xs text-fg-muted">{o.description}</span>}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

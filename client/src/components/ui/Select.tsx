import * as RSelect from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { fieldBase } from './Input';
import { useFormField } from './FormField';

export type SelectOption = { value: string; label: ReactNode; disabled?: boolean };

type SelectProps = {
  value?: string;
  defaultValue?: string;
  onValueChange?: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  name?: string;
  'aria-label'?: string;
};

export function Select({ options, placeholder, className, ...rest }: SelectProps) {
  const field = useFormField();
  return (
    <RSelect.Root {...rest}>
      <RSelect.Trigger
        id={field?.id}
        aria-label={rest['aria-label']}
        aria-describedby={field?.describedBy}
        aria-invalid={field?.invalid || undefined}
        className={cn(fieldBase, 'flex h-11 items-center justify-between gap-2 px-3.5 text-start text-sm data-[placeholder]:text-fg-subtle', className)}
      >
        <RSelect.Value placeholder={placeholder} />
        <RSelect.Icon>
          <ChevronDown className="size-4 text-fg-muted" />
        </RSelect.Icon>
      </RSelect.Trigger>
      <RSelect.Portal>
        <RSelect.Content
          position="popper"
          sideOffset={6}
          className="z-[70] max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-border bg-surface shadow-pop animate-zoom-in"
        >
          <RSelect.Viewport className="p-1">
            {options.map((o) => (
              <RSelect.Item
                key={o.value}
                value={o.value}
                disabled={o.disabled}
                className="relative flex h-10 cursor-pointer select-none items-center rounded-md pe-8 ps-3 text-sm outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-surface-2 data-[state=checked]:font-semibold data-[disabled]:opacity-50"
              >
                <RSelect.ItemText>{o.label}</RSelect.ItemText>
                <RSelect.ItemIndicator className="absolute end-2.5 text-primary-700">
                  <Check className="size-4" />
                </RSelect.ItemIndicator>
              </RSelect.Item>
            ))}
          </RSelect.Viewport>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  );
}

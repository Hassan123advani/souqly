import * as RSwitch from '@radix-ui/react-switch';
import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type SwitchProps = {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (v: boolean) => void;
  disabled?: boolean;
  label?: ReactNode;
  description?: ReactNode;
  className?: string;
  id?: string;
};

export function Switch({ label, description, className, id, ...rest }: SwitchProps) {
  const auto = useId();
  const sid = id ?? `sw-${auto}`;
  const descId = description ? `${sid}-desc` : undefined;
  const control = (
    <RSwitch.Root
      id={sid}
      aria-describedby={descId}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-pill border-2 border-transparent bg-ink-300 transition-colors duration-150',
        'data-[state=checked]:bg-primary disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
      )}
      {...rest}
    >
      <RSwitch.Thumb
        className={cn(
          'block size-5 rounded-pill bg-white shadow transition-transform duration-150 ease-souq',
          'translate-x-0 data-[state=checked]:translate-x-5 rtl:data-[state=checked]:-translate-x-5',
        )}
      />
    </RSwitch.Root>
  );
  if (!label) return <span className={className}>{control}</span>;
  return (
    <div className={cn('flex items-center justify-between gap-4', className)}>
      <label htmlFor={sid} className="cursor-pointer text-sm">
        <span className="font-medium text-fg">{label}</span>
        {description && (
          <span id={descId} className="mt-0.5 block text-fg-muted">
            {description}
          </span>
        )}
      </label>
      {control}
    </div>
  );
}

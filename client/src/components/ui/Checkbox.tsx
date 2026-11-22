import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label?: ReactNode;
  description?: ReactNode;
  invalid?: boolean;
};

/** Native checkbox (keeps react-hook-form `register` working) with Souq Dusk styling. */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, description, className, id, invalid, ...rest },
  ref,
) {
  const auto = useId();
  const cid = id ?? `cb-${auto}`;
  return (
    <div className={cn('flex items-start gap-3', className)}>
      <span className="relative mt-0.5 grid size-5 shrink-0 place-items-center">
        <input
          ref={ref}
          id={cid}
          type="checkbox"
          aria-invalid={invalid || undefined}
          className={cn(
            'peer size-5 cursor-pointer appearance-none rounded-[6px] border-2 border-border-strong bg-surface transition-colors',
            'checked:border-primary checked:bg-primary hover:border-primary-500',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
            'disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger',
          )}
          {...rest}
        />
        <svg
          className="pointer-events-none absolute size-3.5 text-primary-fg opacity-0 peer-checked:opacity-100"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden
        >
          <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {(label || description) && (
        <label htmlFor={cid} className="cursor-pointer text-sm">
          {label && <span className="font-medium text-fg">{label}</span>}
          {description && <span className="mt-0.5 block text-fg-muted">{description}</span>}
        </label>
      )}
    </div>
  );
});

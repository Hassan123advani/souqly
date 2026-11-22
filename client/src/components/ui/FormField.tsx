import { createContext, useContext, useId, type LabelHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type FieldCtx = { id: string; describedBy?: string; invalid: boolean };
const FieldContext = createContext<FieldCtx | null>(null);

/** Inputs call this to pick up id / aria-describedby / aria-invalid from the surrounding FormField. */
export function useFormField() {
  return useContext(FieldContext);
}

export function Label({ className, children, required, ...rest }: LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return (
    <label className={cn('text-sm font-semibold text-fg', className)} {...rest}>
      {children}
      {required && (
        <span className="ms-0.5 text-danger" aria-hidden>
          *
        </span>
      )}
    </label>
  );
}

type FormFieldProps = {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  id?: string;
  className?: string;
  /** Extra element aligned to the end of the label row (e.g. "Forgot password?"). */
  labelAside?: ReactNode;
  children: ReactNode;
};

export function FormField({ label, hint, error, required, id, className, labelAside, children }: FormFieldProps) {
  const auto = useId();
  const fieldId = id ?? `f-${auto}`;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <FieldContext.Provider value={{ id: fieldId, describedBy, invalid: !!error }}>
      <div className={cn('flex flex-col gap-1.5', className)}>
        {(label || labelAside) && (
          <div className="flex items-center justify-between gap-2">
            {label && (
              <Label htmlFor={fieldId} required={required}>
                {label}
              </Label>
            )}
            {labelAside}
          </div>
        )}
        {children}
        {hint && !error && (
          <p id={hintId} className="text-xs text-fg-muted">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} role="alert" className="text-xs font-medium text-danger">
            {error}
          </p>
        )}
      </div>
    </FieldContext.Provider>
  );
}

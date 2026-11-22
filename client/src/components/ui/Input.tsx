import { forwardRef, useState, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { useFormField } from './FormField';

export const fieldBase =
  'w-full rounded-md border border-border-strong bg-surface text-fg placeholder:text-fg-subtle ' +
  'transition-[border-color,box-shadow] duration-150 ease-souq ' +
  'hover:border-ink-400 focus:border-primary-600 focus:outline-none focus:ring-4 focus:ring-primary/15 ' +
  'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:opacity-70 ' +
  'aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/15';

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  startIcon?: ReactNode;
  endAdornment?: ReactNode;
  inputSize?: 'md' | 'lg';
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, startIcon, endAdornment, inputSize = 'md', id, ...rest },
  ref,
) {
  const field = useFormField();
  const input = (
    <input
      ref={ref}
      id={id ?? field?.id}
      aria-describedby={rest['aria-describedby'] ?? field?.describedBy}
      aria-invalid={rest['aria-invalid'] ?? (field?.invalid || undefined)}
      className={cn(
        fieldBase,
        inputSize === 'lg' ? 'h-12 px-4 text-base' : 'h-11 px-3.5 text-sm',
        startIcon && 'ps-10',
        endAdornment && 'pe-11',
        className,
      )}
      {...rest}
    />
  );
  if (!startIcon && !endAdornment) return input;
  return (
    <div className="relative">
      {startIcon && (
        <span className="pointer-events-none absolute inset-y-0 start-0 flex w-10 items-center justify-center text-fg-subtle">
          {startIcon}
        </span>
      )}
      {input}
      {endAdornment && <span className="absolute inset-y-0 end-0 flex items-center pe-1">{endAdornment}</span>}
    </div>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, id, rows = 4, ...rest },
  ref,
) {
  const field = useFormField();
  return (
    <textarea
      ref={ref}
      id={id ?? field?.id}
      rows={rows}
      aria-describedby={rest['aria-describedby'] ?? field?.describedBy}
      aria-invalid={rest['aria-invalid'] ?? (field?.invalid || undefined)}
      className={cn(fieldBase, 'min-h-24 px-3.5 py-2.5 text-sm', className)}
      {...rest}
    />
  );
});

export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputProps, 'type' | 'endAdornment'>>(function PasswordInput(
  props,
  ref,
) {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  return (
    <Input
      ref={ref}
      type={show ? 'text' : 'password'}
      autoComplete={props.autoComplete ?? 'current-password'}
      {...props}
      endAdornment={
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="grid size-9 place-items-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg"
          aria-label={show ? t('form.hidePassword') : t('form.showPassword')}
          aria-pressed={show}
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      }
    />
  );
});

import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';

type OtpInputProps = {
  value: string;
  onChange: (v: string) => void;
  length?: number;
  onComplete?: (v: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
};

/** N separate digit boxes; supports paste, arrows, backspace and SMS autofill (one-time-code). */
export function OtpInput({ value, onChange, length = 6, onComplete, invalid, disabled, autoFocus, className }: OtpInputProps) {
  const { t } = useTranslation();
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');

  function setAt(i: number, d: string) {
    const arr = digits.slice();
    arr[i] = d;
    const next = arr.join('').slice(0, length);
    onChange(next);
    if (next.length === length && !next.includes('')) onComplete?.(next);
  }

  function handleInput(i: number, raw: string) {
    const clean = raw.replace(/\D/g, '');
    if (!clean) return;
    if (clean.length > 1) {
      // Autofill or fast typing delivered several digits at once.
      const merged = (value.slice(0, i) + clean).slice(0, length);
      onChange(merged);
      refs.current[Math.min(merged.length, length - 1)]?.focus();
      if (merged.length === length) onComplete?.(merged);
      return;
    }
    setAt(i, clean);
    if (i < length - 1) refs.current[i + 1]?.focus();
  }

  function handleKey(i: number, e: KeyboardEvent<HTMLInputElement>) {
    const rtl = document.documentElement.dir === 'rtl';
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (digits[i]) setAt(i, '');
      else if (i > 0) {
        refs.current[i - 1]?.focus();
        setAt(i - 1, '');
      }
    } else if (e.key === (rtl ? 'ArrowRight' : 'ArrowLeft') && i > 0) refs.current[i - 1]?.focus();
    else if (e.key === (rtl ? 'ArrowLeft' : 'ArrowRight') && i < length - 1) refs.current[i + 1]?.focus();
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!text) return;
    e.preventDefault();
    onChange(text);
    refs.current[Math.min(text.length, length - 1)]?.focus();
    if (text.length === length) onComplete?.(text);
  }

  return (
    // Codes are always read left-to-right, even in Urdu/Arabic.
    <div className={cn('flex justify-center gap-2 sm:gap-2.5', className)} dir="ltr" role="group" aria-label={t('auth.otp.codeLabel')}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={length}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          aria-label={t('auth.otp.digit', { n: i + 1 })}
          aria-invalid={invalid || undefined}
          onChange={(e) => handleInput(i, e.target.value)}
          onKeyDown={(e) => handleKey(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          className={cn(
            'latin size-11 rounded-md border border-border-strong bg-surface text-center text-xl font-bold text-fg tabular sm:size-12',
            'transition-[border-color,box-shadow] focus:border-primary-600 focus:outline-none focus:ring-4 focus:ring-primary/15',
            d && 'border-primary-400 bg-primary-50/40',
            invalid && 'border-danger',
          )}
        />
      ))}
    </div>
  );
}

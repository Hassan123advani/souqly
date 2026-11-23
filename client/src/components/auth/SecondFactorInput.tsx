import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound, Smartphone } from 'lucide-react';
import { Input, OtpInput } from '@/components/ui';
import { cn } from '@/lib/cn';

const TOTP_RE = /^\d{6}$/;
const RECOVERY_RE = /^[A-Za-z0-9]{5}-?[A-Za-z0-9]{5}$/;

/** True for a 6-digit authenticator code or a recovery code (`XXXXX-XXXXX`, dash optional). */
export function isSecondFactorComplete(v: string) {
  return TOTP_RE.test(v) || RECOVERY_RE.test(v.trim());
}

type Props = {
  value: string;
  onChange: (v: string) => void;
  /** Called when a full authenticator code has been typed (not for recovery codes). */
  onComplete?: (v: string) => void;
  invalid?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
  className?: string;
};

/** Authenticator code boxes with a "Use a recovery code" toggle. */
export function SecondFactorInput({ value, onChange, onComplete, invalid, autoFocus, disabled, className }: Props) {
  const { t } = useTranslation();
  const [recovery, setRecovery] = useState(false);

  return (
    <div className={cn('space-y-3', className)}>
      {recovery ? (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 11))}
          aria-label={t('auth.recovery.label')}
          placeholder="XXXXX-XXXXX"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          autoFocus
          disabled={disabled}
          aria-invalid={invalid || undefined}
          dir="ltr"
          className="latin text-center font-mono tracking-widest"
          startIcon={<KeyRound className="size-4" />}
        />
      ) : (
        <OtpInput value={value} onChange={onChange} onComplete={onComplete} invalid={invalid} autoFocus={autoFocus} disabled={disabled} />
      )}
      <button
        type="button"
        onClick={() => {
          setRecovery((r) => !r);
          onChange('');
        }}
        className="mx-auto flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:underline"
      >
        {recovery ? <Smartphone className="size-4" /> : <KeyRound className="size-4" />}
        {recovery ? t('auth.recovery.useApp') : t('auth.recovery.use')}
      </button>
    </div>
  );
}

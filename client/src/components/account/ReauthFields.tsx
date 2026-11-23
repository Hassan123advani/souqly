import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { MessageSquareText } from 'lucide-react';
import { useMe } from '@/api/auth';
import { useReauthOtp, type ReauthPayload } from '@/api/account';
import { getErrorCode, getErrorDetails, getErrorMessage } from '@/api/client';
import { DevCodeHint } from '@/components/auth/AuthBits';
import { Button, FormField, OtpInput, PasswordInput } from '@/components/ui';

export type ReauthMethod = 'password' | 'otp';

/**
 * State for re-authenticating a sensitive action. Defaults to a password; switches to a phone code
 * when the server answers `REAUTH_REQUIRED` with `details.method: 'otp'` (passwordless accounts).
 * Google-only accounts have nothing to re-auth with, so an empty password is sent and accepted.
 */
export function useReauth() {
  const { t } = useTranslation();
  const [method, setMethod] = useState<ReauthMethod>('password');
  const [forced, setForced] = useState(false);
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [error, setError] = useState<string>();

  const payload = (): ReauthPayload =>
    method === 'password' ? (password ? { password } : {}) : otpCode ? { otpCode } : {};

  /** Shows re-auth related errors inline. Returns true when the error was handled. */
  const handleError = (err: unknown): boolean => {
    const code = getErrorCode(err);
    if (code === 'REAUTH_REQUIRED') {
      const m = getErrorDetails(err)?.method;
      if (m === 'password' || m === 'otp') {
        setMethod(m);
        setForced(true);
      }
      setError(m === 'otp' ? t('reauth.requiredOtp') : t('reauth.requiredPassword'));
      return true;
    }
    if (code === 'INVALID_PASSWORD' || code === 'INVALID_CREDENTIALS') {
      setError(t('security.password.wrongCurrent'));
      return true;
    }
    if (code === 'OTP_INVALID' || code === 'OTP_EXPIRED' || code === 'INVALID_OTP') {
      setOtpCode('');
      setError(getErrorMessage(err));
      return true;
    }
    return false;
  };

  const reset = () => {
    setMethod('password');
    setForced(false);
    setPassword('');
    setOtpCode('');
    setError(undefined);
  };

  /** Whether the current input looks complete enough to submit. */
  const ready = method === 'password' || otpCode.length === 6;

  return { method, setMethod, forced, setForced, password, setPassword, otpCode, setOtpCode, error, setError, payload, handleError, reset, ready };
}

export type ReauthState = ReturnType<typeof useReauth>;

/** Password field, or "send code to your phone" + OTP boxes for passwordless accounts. */
export function ReauthFields({ reauth, autoFocus }: { reauth: ReauthState; autoFocus?: boolean }) {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const send = useReauthOtp();
  const [sent, setSent] = useState(false);
  const [devCode, setDevCode] = useState<string>();
  const [cooldown, setCooldown] = useState(0);
  const canUseOtp = !!me?.phone && me.phoneVerified;

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  function sendCode() {
    reauth.setError(undefined);
    send.mutate(undefined, {
      onSuccess: (d) => {
        setSent(true);
        setDevCode(d?.devCode);
        setCooldown(60);
        reauth.setOtpCode('');
        toast.success(t('auth.otp.sent'));
      },
      onError: (err) => {
        const code = getErrorCode(err);
        if (code === 'USE_PASSWORD') {
          reauth.setMethod('password');
          reauth.setForced(true);
        }
        reauth.setError(getErrorMessage(err));
      },
    });
  }

  const switchTo = (m: ReauthMethod) => {
    reauth.setMethod(m);
    reauth.setError(undefined);
  };

  if (reauth.method === 'password') {
    return (
      <div className="space-y-2">
        <FormField label={t('form.currentPassword')} hint={t('reauth.passwordHint')} error={reauth.error}>
          <PasswordInput
            autoComplete="current-password"
            autoFocus={autoFocus}
            value={reauth.password}
            onChange={(e) => reauth.setPassword(e.target.value)}
          />
        </FormField>
        {canUseOtp && !reauth.forced && (
          <button type="button" onClick={() => switchTo('otp')} className="text-sm font-semibold text-primary-700 hover:underline">
            {t('reauth.usePhone')}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface-2/60 p-4">
      <div className="flex items-start gap-3">
        <MessageSquareText className="mt-0.5 size-5 shrink-0 text-primary-700" />
        <p className="text-sm text-fg-muted">
          {t('reauth.otpBody')}{' '}
          {me?.phone && (
            <span className="latin font-semibold text-fg" dir="ltr">
              {me.phone}
            </span>
          )}
        </p>
      </div>
      <Button type="button" size="sm" variant="outline" loading={send.isPending} disabled={cooldown > 0} onClick={sendCode}>
        {cooldown > 0 ? t('auth.otp.resendIn', { s: cooldown }) : sent ? t('auth.otp.resend') : t('reauth.sendCode')}
      </Button>
      <DevCodeHint code={devCode} />
      {sent && <OtpInput value={reauth.otpCode} onChange={reauth.setOtpCode} autoFocus invalid={!!reauth.error} className="justify-start" />}
      {reauth.error && (
        <p className="text-sm font-medium text-danger" role="alert">
          {reauth.error}
        </p>
      )}
      {!reauth.forced && (
        <button type="button" onClick={() => switchTo('password')} className="block text-sm font-semibold text-primary-700 hover:underline">
          {t('reauth.usePassword')}
        </button>
      )}
    </div>
  );
}

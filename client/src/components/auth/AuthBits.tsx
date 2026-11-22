import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Terminal } from 'lucide-react';
import { usePublicConfig } from '@/api/config';
import { Divider } from '@/components/ui';

export function AuthHeading({ title, subtitle }: { title: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="mb-7">
      <h1 className="text-2xl font-extrabold tracking-tight text-fg sm:text-[1.75rem]">{title}</h1>
      {subtitle && <p className="mt-1.5 text-sm text-fg-muted">{subtitle}</p>}
    </div>
  );
}

/** Development-only hint: the server returns the OTP when no SMS provider is configured. */
export function DevCodeHint({ code }: { code?: string }) {
  const { t } = useTranslation();
  if (!code) return null;
  return (
    <div className="flex items-center gap-2.5 rounded-md border border-dashed border-accent-300 bg-accent-50 px-3 py-2 text-xs text-accent-900">
      <Terminal className="size-4 shrink-0" />
      <span>
        {t('auth.otp.devHint')}{' '}
        <code className="latin rounded bg-surface px-1.5 py-0.5 font-bold tracking-[0.2em] text-fg">{code}</code>
      </span>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7Z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z" />
    </svg>
  );
}

/** Google sign-in, rendered only when the server reports the integration as enabled. */
export function GoogleLogin({ next }: { next?: string }) {
  const { t } = useTranslation();
  const { data } = usePublicConfig();
  if (!data?.integrations.googleLogin) return null;
  const href = `/api/v1/auth/google${next ? `?next=${encodeURIComponent(next)}` : ''}`;
  return (
    <>
      <Divider label={t('auth.or')} className="my-5" />
      <a
        href={href}
        className="flex h-11 w-full items-center justify-center gap-2.5 rounded-md border border-border-strong bg-surface text-sm font-semibold text-fg transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
      >
        <GoogleGlyph />
        {t('auth.google')}
      </a>
    </>
  );
}

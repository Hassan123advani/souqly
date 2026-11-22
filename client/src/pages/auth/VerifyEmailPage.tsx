import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MailCheck, MailWarning } from 'lucide-react';
import { useMe, useVerifyEmail } from '@/api/auth';
import { getErrorMessage } from '@/api/client';
import { Seo } from '@/components/layout/Seo';
import { Button, EmptyState, Spinner } from '@/components/ui';

export default function VerifyEmailPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const verify = useVerifyEmail();
  const { data: me } = useMe();
  const started = useRef(false);

  useEffect(() => {
    // Guard against StrictMode double-invocation: tokens are single-use.
    if (!token || started.current) return;
    started.current = true;
    verify.mutate({ token });
  }, [token]);

  const continueTo = me ? '/account/profile' : '/login';

  let body;
  if (!token) {
    body = (
      <EmptyState
        icon={<MailWarning />}
        title={t('auth.verify.missingTitle')}
        description={t('auth.verify.missingBody')}
        action={<Button to={continueTo}>{t('auth.verify.continue')}</Button>}
      />
    );
  } else if (verify.isSuccess) {
    body = (
      <EmptyState
        icon={<MailCheck />}
        title={t('auth.verify.doneTitle')}
        description={t('auth.verify.doneBody')}
        action={<Button to={me ? '/' : '/login'}>{me ? t('auth.verify.startShopping') : t('auth.login.submit')}</Button>}
      />
    );
  } else if (verify.isError) {
    body = (
      <EmptyState
        icon={<MailWarning />}
        title={t('auth.verify.failedTitle')}
        description={`${getErrorMessage(verify.error)} ${t('auth.verify.failedHint')}`}
        action={<Button to={continueTo}>{t('auth.verify.continue')}</Button>}
      />
    );
  } else {
    body = (
      <div className="flex flex-col items-center gap-4 py-14 text-center">
        <Spinner className="size-8 text-primary-700" />
        <p className="text-sm text-fg-muted">{t('auth.verify.checking')}</p>
      </div>
    );
  }

  return (
    <>
      <Seo title={t('auth.verify.title')} noindex />
      {body}
    </>
  );
}

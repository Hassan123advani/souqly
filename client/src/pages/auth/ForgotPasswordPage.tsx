import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowLeft, Mail, MailCheck } from 'lucide-react';
import { forgotPasswordSchema } from '@souqly/shared';
import { useForgotPassword } from '@/api/auth';
import { getErrorMessage } from '@/api/client';
import { AuthHeading } from '@/components/auth/AuthBits';
import { Seo } from '@/components/layout/Seo';
import { Button, FormField, Input } from '@/components/ui';
import { translateError } from '@/lib/validation';

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const forgot = useForgotPassword();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useForm<{ email: string }>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: '' } });

  const submit = form.handleSubmit((v) =>
    forgot.mutate(v, {
      onSuccess: () => setSentTo(v.email),
      onError: (err) => toast.error(getErrorMessage(err)),
    }),
  );

  return (
    <>
      <Seo title={t('auth.forgot.title')} noindex />
      {sentTo ? (
        <div className="text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-t-[2rem] rounded-b-xl bg-success-soft text-success">
            <MailCheck className="size-7" />
          </div>
          <h1 className="mt-5 text-2xl font-extrabold text-fg">{t('auth.forgot.sentTitle')}</h1>
          <p className="mt-2 text-sm text-fg-muted">
            {t('auth.forgot.sentBody')} <span className="latin font-semibold text-fg">{sentTo}</span>
          </p>
          <p className="mt-4 text-xs text-fg-subtle">{t('auth.forgot.sentHint')}</p>
          <Button to="/login" variant="outline" className="mt-6" leftIcon={<ArrowLeft className="flip-rtl size-4" />}>
            {t('auth.backToLogin')}
          </Button>
        </div>
      ) : (
        <>
          <AuthHeading title={t('auth.forgot.title')} subtitle={t('auth.forgot.subtitle')} />
          <form onSubmit={submit} className="space-y-4" noValidate>
            <FormField label={t('form.email')} error={translateError(form.formState.errors.email?.message)} required>
              <Input type="email" autoComplete="email" startIcon={<Mail className="size-4" />} autoFocus {...form.register('email')} />
            </FormField>
            <Button type="submit" block size="lg" loading={forgot.isPending}>
              {t('auth.forgot.submit')}
            </Button>
          </form>
          <Link to="/login" className="mt-8 flex items-center justify-center gap-1.5 text-sm font-medium text-fg-muted hover:text-fg">
            <ArrowLeft className="flip-rtl size-4" />
            {t('auth.backToLogin')}
          </Link>
        </>
      )}
    </>
  );
}

import { Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { CheckCircle2, KeyRound, Lock } from 'lucide-react';
import { passwordSchema } from '@souqly/shared';
import { useResetPassword } from '@/api/auth';
import { getErrorCode, getErrorMessage } from '@/api/client';
import { AuthHeading } from '@/components/auth/AuthBits';
import { Seo } from '@/components/layout/Seo';
import { Alert, Button, EmptyState, FormField, PasswordInput, PasswordStrength } from '@/components/ui';
import { translateError } from '@/lib/validation';

const schema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((d) => d.password === d.confirm, { message: 'Passwords do not match', path: ['confirm'] });

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const reset = useResetPassword();
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { password: '', confirm: '' } });
  const { errors } = form.formState;
  const password = form.watch('password');

  if (!token || token.length < 20) {
    return (
      <EmptyState
        icon={<KeyRound />}
        title={t('auth.reset.invalidTitle')}
        description={t('auth.reset.invalidBody')}
        action={<Button to="/forgot-password">{t('auth.reset.requestNew')}</Button>}
      />
    );
  }

  if (reset.isSuccess) {
    return (
      <EmptyState
        icon={<CheckCircle2 />}
        title={t('auth.reset.doneTitle')}
        description={t('auth.reset.doneBody')}
        action={<Button to="/login">{t('auth.login.submit')}</Button>}
      />
    );
  }

  const code = getErrorCode(reset.error);
  const tokenBad = code === 'INVALID_TOKEN' || code === 'TOKEN_EXPIRED' || code === 'TOKEN_INVALID';

  return (
    <>
      <Seo title={t('auth.reset.title')} noindex />
      <AuthHeading title={t('auth.reset.title')} subtitle={t('auth.reset.subtitle')} />
      <form onSubmit={form.handleSubmit((v) => reset.mutate({ token, password: v.password }))} className="space-y-4" noValidate>
        {reset.isError && (
          <Alert tone="danger" action={tokenBad ? <Link to="/forgot-password" className="link shrink-0 text-sm">{t('auth.reset.requestNew')}</Link> : undefined}>
            {tokenBad ? t('auth.reset.invalidBody') : getErrorMessage(reset.error)}
          </Alert>
        )}
        <FormField label={t('form.newPassword')} error={translateError(errors.password?.message)} required>
          <PasswordInput autoComplete="new-password" startIcon={<Lock className="size-4" />} autoFocus {...form.register('password')} />
        </FormField>
        <PasswordStrength password={password} />
        <FormField label={t('form.confirmPassword')} error={translateError(errors.confirm?.message)} required>
          <PasswordInput autoComplete="new-password" startIcon={<Lock className="size-4" />} {...form.register('confirm')} />
        </FormField>
        <Button type="submit" block size="lg" loading={reset.isPending}>
          {t('auth.reset.submit')}
        </Button>
      </form>
    </>
  );
}

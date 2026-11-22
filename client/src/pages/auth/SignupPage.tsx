import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { Gift, Lock, Mail, User } from 'lucide-react';
import { signupSchema } from '@souqly/shared';
import { useSignup } from '@/api/auth';
import { getErrorCode, getErrorMessage } from '@/api/client';
import { AuthHeading, GoogleLogin } from '@/components/auth/AuthBits';
import { Seo } from '@/components/layout/Seo';
import { Alert, Button, Checkbox, FormField, Input, PasswordInput, PasswordStrength } from '@/components/ui';
import { translateError } from '@/lib/validation';
import { safeNext } from '@/routes/guards';

const formSchema = signupSchema.extend({
  terms: z.boolean().refine((v) => v, { message: 'validation.terms' }),
});
type FormValues = z.input<typeof formSchema>;

export default function SignupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') ?? undefined;
  const signup = useSignup();
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', email: '', password: '', referralCode: params.get('ref') ?? '', terms: false },
  });
  const { errors } = form.formState;
  const password = form.watch('password') ?? '';
  const emailTaken = getErrorCode(signup.error) === 'EMAIL_TAKEN';

  const submit = form.handleSubmit(({ terms: _terms, referralCode, ...rest }) => {
    const body = { ...rest, referralCode: referralCode?.trim() ? referralCode.trim() : undefined };
    signup.mutate(body, {
      onSuccess: () => {
        toast.success(t('auth.signup.success'));
        navigate(safeNext(next), { replace: true });
      },
      onError: (err) => {
        if (getErrorCode(err) !== 'EMAIL_TAKEN') toast.error(getErrorMessage(err));
      },
    });
  });

  return (
    <>
      <Seo title={t('auth.signup.title')} />
      <AuthHeading title={t('auth.signup.title')} subtitle={t('auth.signup.subtitle')} />
      <form onSubmit={submit} className="space-y-4" noValidate>
        {emailTaken && (
          <Alert tone="warning" action={<Link to="/login" className="link shrink-0 text-sm">{t('auth.login.submit')}</Link>}>
            {t('errors.EMAIL_TAKEN')}
          </Alert>
        )}
        <FormField label={t('form.fullName')} error={translateError(errors.name?.message)} required>
          <Input autoComplete="name" startIcon={<User className="size-4" />} {...form.register('name')} />
        </FormField>
        <FormField label={t('form.email')} error={translateError(errors.email?.message)} required>
          <Input type="email" autoComplete="email" inputMode="email" startIcon={<Mail className="size-4" />} {...form.register('email')} />
        </FormField>
        <FormField label={t('form.password')} error={translateError(errors.password?.message)} required>
          <PasswordInput autoComplete="new-password" startIcon={<Lock className="size-4" />} {...form.register('password')} />
        </FormField>
        <PasswordStrength password={password} />
        <FormField label={t('form.referralCode')} hint={t('auth.signup.referralHint')} error={translateError(errors.referralCode?.message)}>
          <Input className="latin uppercase" autoComplete="off" startIcon={<Gift className="size-4" />} {...form.register('referralCode')} />
        </FormField>
        <div>
          <Checkbox
            invalid={!!errors.terms}
            label={
              <span className="font-normal text-fg-muted">
                {t('auth.signup.termsPrefix')}{' '}
                <Link to="/terms" className="link" target="_blank">
                  {t('footer.terms')}
                </Link>{' '}
                {t('auth.signup.and')}{' '}
                <Link to="/privacy" className="link" target="_blank">
                  {t('footer.privacy')}
                </Link>
              </span>
            }
            {...form.register('terms')}
          />
          {errors.terms && (
            <p className="mt-1.5 ps-8 text-xs font-medium text-danger" role="alert">
              {translateError(errors.terms.message)}
            </p>
          )}
        </div>
        <Button type="submit" block size="lg" loading={signup.isPending}>
          {t('auth.signup.submit')}
        </Button>
      </form>
      <GoogleLogin next={next} />
      <p className="mt-8 text-center text-sm text-fg-muted">
        {t('auth.signup.haveAccount')}{' '}
        <Link to={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="link">
          {t('auth.login.submit')}
        </Link>
      </p>
    </>
  );
}

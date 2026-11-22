import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowLeft, Lock, Mail, Phone, ShieldCheck, Smartphone } from 'lucide-react';
import { loginSchema, otpRequestSchema, type LoginInput } from '@souqly/shared';
import { useLogin, useOtpRequest, useOtpVerify } from '@/api/auth';
import { getErrorCode, getErrorMessage } from '@/api/client';
import type { MeUser } from '@/api/types';
import { AuthHeading, DevCodeHint, GoogleLogin } from '@/components/auth/AuthBits';
import { Seo } from '@/components/layout/Seo';
import { Alert, Button, FormField, Input, OtpInput, PasswordInput, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import { translateError } from '@/lib/validation';
import { safeNext } from '@/routes/guards';

function useAfterLogin() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  return (user: MeUser, isNew?: boolean) => {
    toast.success(isNew ? t('auth.welcomeNew') : t('auth.welcomeBack', { name: user.name.split(' ')[0] }));
    const fallback = user.platformRole ? '/admin' : '/';
    navigate(safeNext(params.get('next'), fallback), { replace: true });
  };
}

function EmailLogin() {
  const { t } = useTranslation();
  const login = useLogin();
  const afterLogin = useAfterLogin();
  const [needsTotp, setNeedsTotp] = useState(false);
  const [totp, setTotp] = useState('');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });
  const { errors } = form.formState;

  const submit = form.handleSubmit((values) => {
    setErrorCode(null);
    const body = needsTotp ? { ...values, totp } : values;
    login.mutate(body, {
      onSuccess: (d) => afterLogin(d.user),
      onError: (err) => {
        const code = getErrorCode(err);
        if (code === 'TOTP_REQUIRED') {
          setNeedsTotp(true);
          return;
        }
        setErrorCode(code ?? 'GENERIC');
        if (!code || !['INVALID_CREDENTIALS', 'ACCOUNT_LOCKED', 'ACCOUNT_BLOCKED', 'INVALID_TOTP'].includes(code)) {
          toast.error(getErrorMessage(err));
        }
      },
    });
  });

  if (needsTotp) {
    return (
      <form onSubmit={submit} className="space-y-5" noValidate>
        <div className="flex items-start gap-3 rounded-lg border border-primary-100 bg-primary-50 p-4">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary-700" />
          <div>
            <p className="text-sm font-bold text-fg">{t('auth.totp.title')}</p>
            <p className="mt-0.5 text-sm text-fg-muted">{t('auth.totp.body')}</p>
          </div>
        </div>
        <OtpInput
          value={totp}
          onChange={setTotp}
          autoFocus
          invalid={errorCode === 'INVALID_TOTP' || errorCode === 'INVALID_CREDENTIALS'}
          onComplete={() => void submit()}
        />
        {(errorCode === 'INVALID_TOTP' || errorCode === 'INVALID_CREDENTIALS') && (
          <p className="text-center text-sm font-medium text-danger" role="alert">
            {t('errors.INVALID_TOTP')}
          </p>
        )}
        <Button type="submit" block size="lg" loading={login.isPending} disabled={totp.length !== 6}>
          {t('auth.totp.verify')}
        </Button>
        <button
          type="button"
          onClick={() => {
            setNeedsTotp(false);
            setTotp('');
            setErrorCode(null);
          }}
          className="mx-auto flex items-center gap-1.5 text-sm font-medium text-fg-muted hover:text-fg"
        >
          <ArrowLeft className="flip-rtl size-4" />
          {t('auth.back')}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {errorCode === 'ACCOUNT_LOCKED' && (
        <Alert tone="warning" title={t('auth.lockedTitle')}>
          {t('errors.ACCOUNT_LOCKED')}
        </Alert>
      )}
      {errorCode === 'ACCOUNT_BLOCKED' && (
        <Alert tone="danger" title={t('auth.blockedTitle')}>
          {t('errors.ACCOUNT_BLOCKED')}
        </Alert>
      )}
      {errorCode === 'INVALID_CREDENTIALS' && <Alert tone="danger">{t('errors.INVALID_CREDENTIALS')}</Alert>}
      <FormField label={t('form.email')} error={translateError(errors.email?.message)} required>
        <Input type="email" autoComplete="email" inputMode="email" startIcon={<Mail className="size-4" />} {...form.register('email')} />
      </FormField>
      <FormField
        label={t('form.password')}
        error={translateError(errors.password?.message)}
        required
        labelAside={
          <Link to="/forgot-password" className="link text-xs">
            {t('auth.forgotLink')}
          </Link>
        }
      >
        <PasswordInput startIcon={<Lock className="size-4" />} {...form.register('password')} />
      </FormField>
      <Button type="submit" block size="lg" loading={login.isPending}>
        {t('auth.login.submit')}
      </Button>
    </form>
  );
}

function PhoneLogin() {
  const { t } = useTranslation();
  const request = useOtpRequest();
  const verify = useOtpVerify();
  const afterLogin = useAfterLogin();
  const [phone, setPhone] = useState('+92');
  const [phoneError, setPhoneError] = useState<string>();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string>();
  const [cooldown, setCooldown] = useState(0);
  const [codeError, setCodeError] = useState<string>();

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  function send(target = phone) {
    const parsed = otpRequestSchema.safeParse({ phone: target.replace(/[\s-]/g, '') });
    if (!parsed.success) {
      setPhoneError(translateError(parsed.error.issues[0]?.message));
      return;
    }
    setPhoneError(undefined);
    request.mutate(parsed.data, {
      onSuccess: (d) => {
        setSentTo(parsed.data.phone);
        setDevCode(d?.devCode);
        setCode('');
        setCodeError(undefined);
        setCooldown(60);
        toast.success(t('auth.otp.sent'));
      },
      onError: (err) => toast.error(getErrorMessage(err)),
    });
  }

  function submitCode(value = code) {
    if (!sentTo || value.length !== 6) return;
    setCodeError(undefined);
    verify.mutate(
      { phone: sentTo, code: value },
      {
        onSuccess: (d) => afterLogin(d.user, d.isNew),
        onError: (err) => setCodeError(getErrorMessage(err)),
      },
    );
  }

  if (!sentTo) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="space-y-4"
        noValidate
      >
        <FormField label={t('form.phone')} hint={t('auth.otp.phoneHint')} error={phoneError} required>
          <Input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            dir="ltr"
            className="latin"
            startIcon={<Phone className="size-4" />}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </FormField>
        <Button type="submit" block size="lg" loading={request.isPending}>
          {t('auth.otp.send')}
        </Button>
      </form>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submitCode();
      }}
      className="space-y-5"
      noValidate
    >
      <div className="flex items-start gap-3 rounded-lg border border-border bg-surface-2/60 p-4">
        <Smartphone className="mt-0.5 size-5 shrink-0 text-primary-700" />
        <p className="text-sm text-fg-muted">
          {t('auth.otp.enterCode')}{' '}
          <span className="latin font-semibold text-fg" dir="ltr">
            {sentTo}
          </span>
        </p>
      </div>
      <DevCodeHint code={devCode} />
      <OtpInput value={code} onChange={setCode} autoFocus invalid={!!codeError} onComplete={submitCode} />
      {codeError && (
        <p className="text-center text-sm font-medium text-danger" role="alert">
          {codeError}
        </p>
      )}
      <Button type="submit" block size="lg" loading={verify.isPending} disabled={code.length !== 6}>
        {t('auth.otp.verify')}
      </Button>
      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={() => setSentTo(null)}
          className="inline-flex items-center gap-1.5 font-medium text-fg-muted hover:text-fg"
        >
          <ArrowLeft className="flip-rtl size-4" />
          {t('auth.otp.changeNumber')}
        </button>
        <button
          type="button"
          disabled={cooldown > 0 || request.isPending}
          onClick={() => send(sentTo)}
          className="font-semibold text-primary-700 hover:underline disabled:cursor-not-allowed disabled:text-fg-subtle disabled:no-underline"
        >
          {cooldown > 0 ? t('auth.otp.resendIn', { s: cooldown }) : t('auth.otp.resend')}
        </button>
      </div>
    </form>
  );
}

export default function LoginPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const next = params.get('next') ?? undefined;
  return (
    <>
      <Seo title={t('auth.login.title')} />
      <AuthHeading title={t('auth.login.title')} subtitle={t('auth.login.subtitle')} />
      <Tabs defaultValue="email">
        <TabsList>
          <TabsTrigger value="email" icon={<Mail className="size-4" />}>
            {t('auth.login.tabEmail')}
          </TabsTrigger>
          <TabsTrigger value="phone" icon={<Smartphone className="size-4" />}>
            {t('auth.login.tabPhone')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="email">
          <EmailLogin />
        </TabsContent>
        <TabsContent value="phone">
          <PhoneLogin />
        </TabsContent>
      </Tabs>
      <GoogleLogin next={next} />
      <p className="mt-8 text-center text-sm text-fg-muted">
        {t('auth.login.noAccount')}{' '}
        <Link to={`/signup${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="link">
          {t('auth.login.createOne')}
        </Link>
      </p>
    </>
  );
}

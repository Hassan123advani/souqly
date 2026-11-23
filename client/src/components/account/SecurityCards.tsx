import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import { CheckCircle2, Copy, KeyRound, Laptop, LogOut, Mail, ShieldCheck, ShieldOff, Smartphone } from 'lucide-react';
import { changeEmailSchema, changePasswordSchema, type ChangePasswordInput } from '@souqly/shared';
import { useMe } from '@/api/auth';
import {
  useChangeEmail,
  useChangePassword,
  useRevokeAllSessions,
  useRevokeSession,
  useSessions,
  useTwoFactorDisable,
  useTwoFactorEnable,
  useTwoFactorSetup,
} from '@/api/account';
import { getErrorCode, getErrorMessage } from '@/api/client';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  EmptyState,
  ErrorState,
  FormField,
  IconButton,
  Input,
  Modal,
  OtpInput,
  PasswordInput,
  PasswordStrength,
  Skeleton,
} from '@/components/ui';
import { isSecondFactorComplete, SecondFactorInput } from '@/components/auth/SecondFactorInput';
import { ReauthFields, useReauth } from '@/components/account/ReauthFields';
import { RecoveryCodesModal } from '@/components/account/RecoveryCodesModal';
import { describeUserAgent, formatRelative } from '@/lib/format';
import { translateError } from '@/lib/validation';
import { useUi } from '@/stores/ui';

export function ChangePasswordCard() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const change = useChangePassword();
  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });
  const { errors } = form.formState;
  const pw = form.watch('newPassword');

  const submit = form.handleSubmit((v) =>
    change.mutate(v, {
      onSuccess: () => {
        toast.success(t('security.password.changed'));
        form.reset();
      },
      onError: (e) => {
        if (getErrorCode(e) === 'INVALID_CREDENTIALS' || getErrorCode(e) === 'INVALID_PASSWORD') {
          form.setError('currentPassword', { message: t('security.password.wrongCurrent') });
        } else toast.error(getErrorMessage(e));
      },
    }),
  );

  return (
    <Card id="password" className={me?.passwordChangeRecommended ? 'ring-2 ring-sale/50' : undefined}>
      <CardHeader title={t('security.password.title')} description={t('security.password.subtitle')} />
      <form onSubmit={submit} noValidate>
        <CardBody className="space-y-4">
          {me?.passwordChangeRecommended && (
            <Alert tone="danger" title={t('security.bannerTitle')}>
              {t('security.bannerBody')}
            </Alert>
          )}
          <FormField label={t('form.currentPassword')} error={translateError(errors.currentPassword?.message)} required>
            <PasswordInput autoComplete="current-password" {...form.register('currentPassword')} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('form.newPassword')} error={translateError(errors.newPassword?.message)} required>
              <PasswordInput autoComplete="new-password" {...form.register('newPassword')} />
            </FormField>
            <FormField label={t('form.confirmPassword')} error={translateError(errors.confirmPassword?.message)} required>
              <PasswordInput autoComplete="new-password" {...form.register('confirmPassword')} />
            </FormField>
          </div>
          <PasswordStrength password={pw} />
          <p className="text-xs text-fg-subtle">{t('security.password.othersSignedOut')}</p>
        </CardBody>
        <CardFooter>
          <Button type="submit" loading={change.isPending} leftIcon={<KeyRound className="size-4" />}>
            {t('security.password.submit')}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export function ChangeEmailCard() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const change = useChangeEmail();
  const form = useForm<{ newEmail: string; password: string }>({
    resolver: zodResolver(changeEmailSchema),
    defaultValues: { newEmail: '', password: '' },
  });
  const { errors } = form.formState;

  const submit = form.handleSubmit((v) =>
    change.mutate(v, {
      onSuccess: (d) => {
        toast.success(t('security.email.sent', { email: v.newEmail }));
        const n = d?.revokedSessions ?? 0;
        if (n > 0) toast.info(n === 1 ? t('security.email.revokedOne') : t('security.email.revokedMany', { n }));
        form.reset();
      },
      onError: (e) => {
        const code = getErrorCode(e);
        if (code === 'INVALID_CREDENTIALS' || code === 'INVALID_PASSWORD') form.setError('password', { message: t('security.password.wrongCurrent') });
        else if (code === 'EMAIL_TAKEN') form.setError('newEmail', { message: t('errors.EMAIL_TAKEN') });
        else toast.error(getErrorMessage(e));
      },
    }),
  );

  return (
    <Card>
      <CardHeader
        title={t('security.email.title')}
        description={
          <>
            {t('security.email.current')} <span className="latin font-semibold text-fg">{me?.email}</span>
          </>
        }
      />
      <form onSubmit={submit} noValidate>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('form.newEmail')} error={translateError(errors.newEmail?.message)} required>
            <Input type="email" autoComplete="email" startIcon={<Mail className="size-4" />} {...form.register('newEmail')} />
          </FormField>
          <FormField label={t('form.currentPassword')} error={translateError(errors.password?.message)} required>
            <PasswordInput autoComplete="current-password" {...form.register('password')} />
          </FormField>
          <p className="text-xs text-fg-subtle sm:col-span-2">{t('security.email.hint')}</p>
        </CardBody>
        <CardFooter>
          <Button type="submit" variant="outline" loading={change.isPending}>
            {t('security.email.submit')}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export function TwoFactorCard() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const setup = useTwoFactorSetup();
  const enable = useTwoFactorEnable();
  const disable = useTwoFactorDisable();
  const setupReauth = useReauth();
  const disableReauth = useReauth();
  const [code, setCode] = useState('');
  const [needsReauth, setNeedsReauth] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [disableOpen, setDisableOpen] = useState(false);
  const [disableCode, setDisableCode] = useState('');
  const enabled = !!me?.twoFactorEnabled;

  // Try without re-auth first: the server says which method (if any) this account needs.
  function startSetup() {
    setupReauth.setError(undefined);
    setup.mutate(setupReauth.payload(), {
      onSuccess: () => setNeedsReauth(false),
      onError: (e) => {
        if (setupReauth.handleError(e)) setNeedsReauth(true);
        else toast.error(getErrorMessage(e));
      },
    });
  }

  function cancelSetup() {
    setup.reset();
    setupReauth.reset();
    setNeedsReauth(false);
    setCode('');
  }

  function confirmEnable(value = code) {
    if (value.length !== 6) return;
    enable.mutate(
      { code: value, ...setupReauth.payload() },
      {
        onSuccess: (d) => {
          toast.success(t('security.twofa.enabled'));
          setRecoveryCodes(d?.recoveryCodes?.length ? d.recoveryCodes : null);
          cancelSetup();
        },
        onError: (e) => {
          setCode('');
          if (setupReauth.handleError(e)) {
            // The re-auth expired between setup and enable: confirm identity again.
            setup.reset();
            setNeedsReauth(true);
          } else toast.error(getErrorMessage(e));
        },
      },
    );
  }

  function closeDisable(o: boolean) {
    setDisableOpen(o);
    if (!o) {
      setDisableCode('');
      disableReauth.reset();
    }
  }

  function confirmDisable() {
    disableReauth.setError(undefined);
    disable.mutate(
      { code: disableCode.trim(), ...disableReauth.payload() },
      {
        onSuccess: () => {
          toast.success(t('security.twofa.disabled'));
          closeDisable(false);
        },
        onError: (e) => {
          if (!disableReauth.handleError(e)) toast.error(getErrorMessage(e));
        },
      },
    );
  }

  const copySecret = async () => {
    if (!setup.data) return;
    try {
      await navigator.clipboard.writeText(setup.data.secret);
      toast.success(t('common.copied'));
    } catch {
      toast.error(t('errors.GENERIC'));
    }
  };

  return (
    <Card>
      <CardHeader
        title={t('security.twofa.title')}
        description={t('security.twofa.subtitle')}
        action={
          enabled ? (
            <Badge tone="success">
              <ShieldCheck className="size-3.5" />
              {t('security.twofa.on')}
            </Badge>
          ) : (
            <Badge tone="neutral">{t('security.twofa.off')}</Badge>
          )
        }
      />
      <CardBody>
        {enabled ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="max-w-md text-sm text-fg-muted">{t('security.twofa.onBody')}</p>
            <Button variant="outline" leftIcon={<ShieldOff className="size-4" />} onClick={() => setDisableOpen(true)}>
              {t('security.twofa.disable')}
            </Button>
          </div>
        ) : setup.data ? (
          <div className="grid gap-6 md:grid-cols-[auto_1fr]">
            <div className="mx-auto rounded-lg border border-border bg-white p-3">
              {setup.data.qrDataUrl ? (
                <img src={setup.data.qrDataUrl} alt={t('security.twofa.qrAlt')} className="size-44" />
              ) : (
                <QRCodeSVG value={setup.data.otpauthUrl} size={176} aria-label={t('security.twofa.qrAlt')} />
              )}
            </div>
            <div className="space-y-4">
              <ol className="list-inside list-decimal space-y-1.5 text-sm text-fg-muted">
                <li>{t('security.twofa.step1')}</li>
                <li>{t('security.twofa.step2')}</li>
                <li>{t('security.twofa.step3')}</li>
              </ol>
              <div className="flex items-center gap-2 rounded-md border border-dashed border-border-strong bg-surface-2/60 px-3 py-2">
                <code className="latin flex-1 break-all text-xs font-semibold tracking-wider text-fg">{setup.data.secret}</code>
                <IconButton size="sm" label={t('common.copy')} onClick={copySecret}>
                  <Copy className="size-4" />
                </IconButton>
              </div>
              <OtpInput value={code} onChange={setCode} onComplete={confirmEnable} className="justify-start" />
              <div className="flex flex-wrap gap-2">
                <Button loading={enable.isPending} disabled={code.length !== 6} onClick={() => confirmEnable()}>
                  {t('security.twofa.confirm')}
                </Button>
                <Button variant="ghost" onClick={cancelSetup}>
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          </div>
        ) : needsReauth ? (
          <form
            className="max-w-md space-y-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              startSetup();
            }}
          >
            <p className="text-sm text-fg-muted">{t('reauth.intro')}</p>
            <ReauthFields reauth={setupReauth} autoFocus />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={setup.isPending} disabled={!setupReauth.ready}>
                {t('reauth.continue')}
              </Button>
              <Button type="button" variant="ghost" onClick={cancelSetup}>
                {t('common.cancel')}
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex max-w-md items-start gap-3">
              <Smartphone className="mt-0.5 size-5 shrink-0 text-primary-700" />
              <p className="text-sm text-fg-muted">{t('security.twofa.offBody')}</p>
            </div>
            <Button loading={setup.isPending} leftIcon={<ShieldCheck className="size-4" />} onClick={startSetup}>
              {t('security.twofa.setup')}
            </Button>
          </div>
        )}
      </CardBody>

      <Modal
        open={disableOpen}
        onOpenChange={closeDisable}
        size="sm"
        title={t('security.twofa.disableTitle')}
        description={t('security.twofa.disableBody')}
        footer={
          <>
            <Button variant="ghost" onClick={() => closeDisable(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={disable.isPending}
              disabled={!isSecondFactorComplete(disableCode) || !disableReauth.ready}
              onClick={confirmDisable}
            >
              {t('security.twofa.disable')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <SecondFactorInput value={disableCode} onChange={setDisableCode} />
          <ReauthFields reauth={disableReauth} />
        </div>
      </Modal>

      <RecoveryCodesModal codes={recoveryCodes} onClose={() => setRecoveryCodes(null)} />
    </Card>
  );
}

export function SessionsCard() {
  const { t } = useTranslation();
  const lang = useUi((s) => s.language);
  const navigate = useNavigate();
  const q = useSessions();
  const revoke = useRevokeSession();
  const revokeAll = useRevokeAllSessions();
  const [confirmAll, setConfirmAll] = useState(false);

  return (
    <Card>
      <CardHeader
        title={t('security.sessions.title')}
        description={t('security.sessions.subtitle')}
        action={
          q.data && q.data.length > 1 ? (
            <Button
              size="sm"
              variant="outline"
              loading={revokeAll.isPending && !confirmAll}
              onClick={() =>
                revokeAll.mutate(false, {
                  onSuccess: () => toast.success(t('security.sessions.othersRevoked')),
                  onError: (e) => toast.error(getErrorMessage(e)),
                })
              }
            >
              {t('security.sessions.revokeOthers')}
            </Button>
          ) : undefined
        }
      />
      <div className="divide-y divide-border">
        {q.isPending ? (
          [0, 1].map((i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4 sm:px-6">
              <Skeleton className="size-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} compact />
        ) : q.data.length === 0 ? (
          <EmptyState compact icon={<Laptop />} title={t('security.sessions.empty')} />
        ) : (
          q.data.map((s) => {
            const ua = describeUserAgent(s.userAgent ?? '');
            const Icon = ua.mobile ? Smartphone : Laptop;
            return (
              <div key={s.id} className="flex items-center gap-4 px-5 py-4 sm:px-6">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-fg-muted">
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-fg">
                      {ua.browser} · {ua.os}
                    </p>
                    {s.current && (
                      <Badge tone="success" size="sm">
                        <CheckCircle2 className="size-3" />
                        {t('security.sessions.thisDevice')}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-fg-muted">
                    <span className="latin" dir="ltr">
                      {s.ip}
                    </span>{' '}
                    · {t('security.sessions.lastActive', { when: formatRelative(s.lastUsedAt, lang) })}
                  </p>
                </div>
                {!s.current && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger hover:bg-danger-soft"
                    loading={revoke.isPending && revoke.variables === s.id}
                    onClick={() =>
                      revoke.mutate(s.id, {
                        onSuccess: () => toast.success(t('security.sessions.revoked')),
                        onError: (e) => toast.error(getErrorMessage(e)),
                      })
                    }
                  >
                    {t('security.sessions.revoke')}
                  </Button>
                )}
              </div>
            );
          })
        )}
      </div>
      <CardFooter className="justify-between">
        <p className="text-xs text-fg-subtle">{t('security.sessions.allHint')}</p>
        <Button size="sm" variant="danger" leftIcon={<LogOut className="size-4" />} onClick={() => setConfirmAll(true)}>
          {t('security.sessions.logoutAll')}
        </Button>
      </CardFooter>

      <Modal
        open={confirmAll}
        onOpenChange={setConfirmAll}
        size="sm"
        title={t('security.sessions.logoutAllTitle')}
        description={t('security.sessions.logoutAllBody')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmAll(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={revokeAll.isPending}
              onClick={() =>
                revokeAll.mutate(true, {
                  onSuccess: () => {
                    toast.success(t('security.sessions.allRevoked'));
                    navigate('/login', { replace: true });
                  },
                  onError: (e) => toast.error(getErrorMessage(e)),
                })
              }
            >
              {t('security.sessions.logoutAll')}
            </Button>
          </>
        }
      />
    </Card>
  );
}

/** Full security panel, shared by /account/security and /admin/security. */
export function SecurityPanel() {
  return (
    <div className="space-y-6">
      <ChangePasswordCard />
      <TwoFactorCard />
      <SessionsCard />
      <ChangeEmailCard />
    </div>
  );
}

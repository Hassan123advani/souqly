import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { Camera, Phone, User } from 'lucide-react';
import { phoneSchema } from '@souqly/shared';
import { useMe } from '@/api/auth';
import { useUpdateProfile, useUploadAvatar, useVerifyPhone, type ProfilePatch } from '@/api/account';
import { getErrorCode, getErrorMessage } from '@/api/client';
import { DevCodeHint } from '@/components/auth/AuthBits';
import { ReauthFields, useReauth } from '@/components/account/ReauthFields';
import { Avatar, Badge, Button, Card, CardBody, CardFooter, CardHeader, FormField, Input, Modal, OtpInput } from '@/components/ui';
import { translateError } from '@/lib/validation';

const schema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(80),
  phone: z.union([z.literal(''), phoneSchema]),
});
type Values = z.infer<typeof schema>;

const MAX_AVATAR = 2 * 1024 * 1024;
const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function AvatarPicker() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const upload = useUploadAvatar();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  function onFile(file?: File) {
    if (!file) return;
    if (!AVATAR_TYPES.includes(file.type)) return toast.error(t('account.profile.avatarType'));
    if (file.size > MAX_AVATAR) return toast.error(t('account.profile.avatarSize'));
    const url = URL.createObjectURL(file);
    setPreview(url);
    upload.mutate(file, {
      onSuccess: () => toast.success(t('account.profile.avatarSaved')),
      onError: (e) => {
        setPreview(null);
        toast.error(getErrorMessage(e));
      },
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative">
        <Avatar src={preview ?? me?.avatarUrl} name={me?.name} size="xl" className={upload.isPending ? 'opacity-60' : ''} />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="absolute -bottom-1 -end-1 grid size-9 place-items-center rounded-full border-2 border-surface bg-primary text-primary-fg shadow-card hover:brightness-110"
          aria-label={t('account.profile.changePhoto')}
        >
          <Camera className="size-4" />
        </button>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-semibold text-fg">{t('account.profile.photo')}</p>
        <p className="text-xs text-fg-muted">{t('account.profile.photoHint')}</p>
        <Button size="sm" variant="outline" loading={upload.isPending} onClick={() => inputRef.current?.click()}>
          {t('account.profile.upload')}
        </Button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={AVATAR_TYPES.join(',')}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}

/** Pending phone change: shows the new number with a verify-code step, resend and cancel. */
function PendingPhonePanel({
  pendingPhone,
  devCode,
  justSent,
  onResend,
  onCancel,
  busy,
}: {
  pendingPhone: string;
  devCode?: string;
  justSent: boolean;
  onResend: () => void;
  onCancel?: () => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const verify = useVerifyPhone();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [cooldown, setCooldown] = useState(justSent ? 60 : 0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  function submit(value = code) {
    if (value.length !== 6) return;
    setError(undefined);
    verify.mutate(value, {
      onSuccess: () => toast.success(t('account.phone.verified')),
      onError: (e) => {
        setCode('');
        setError(getErrorMessage(e));
      },
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-accent-300 bg-accent-50/60 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Phone className="size-4 text-fg-muted" />
        <span className="latin text-sm font-semibold text-fg" dir="ltr">
          {pendingPhone}
        </span>
        <Badge size="sm" tone="warning">
          {t('account.phone.pending')}
        </Badge>
      </div>
      <p className="text-sm text-fg-muted">{t('account.phone.enterCode')}</p>
      <DevCodeHint code={devCode} />
      <OtpInput value={code} onChange={setCode} onComplete={submit} invalid={!!error} className="justify-start" />
      {error && (
        <p className="text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" loading={verify.isPending} disabled={code.length !== 6} onClick={() => submit()}>
          {t('account.phone.verify')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={cooldown > 0 || busy}
          onClick={() => {
            setCooldown(60);
            onResend();
          }}
        >
          {cooldown > 0 ? t('auth.otp.resendIn', { s: cooldown }) : t('auth.otp.resend')}
        </Button>
        {onCancel && (
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
            {t('account.phone.cancelChange')}
          </Button>
        )}
      </div>
    </div>
  );
}

export function ProfileCard() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const update = useUpdateProfile();
  const reauth = useReauth();
  const [awaitingReauth, setAwaitingReauth] = useState<ProfilePatch | null>(null);
  const [devCode, setDevCode] = useState<string>();
  const [justSent, setJustSent] = useState(false);
  const form = useForm<Values>({ resolver: zodResolver(schema), values: { name: me?.name ?? '', phone: me?.phone ?? '' } });
  const { errors, isDirty } = form.formState;

  function save(body: ProfilePatch) {
    update.mutate(
      { ...body, ...reauth.payload() },
      {
        onSuccess: (d) => {
          setAwaitingReauth(null);
          reauth.reset();
          form.reset({ name: d.user.name, phone: d.user.phone ?? '' });
          if (d.phoneVerification?.sent) {
            setDevCode(d.phoneVerification.devCode);
            setJustSent(true);
            toast.success(t('account.phone.codeSent'));
          } else toast.success(t('common.saved'));
        },
        onError: (e) => {
          if (reauth.handleError(e)) {
            setAwaitingReauth(body);
            return;
          }
          if (getErrorCode(e) === 'PHONE_TAKEN') {
            setAwaitingReauth(null);
            form.setError('phone', { message: t('errors.PHONE_TAKEN') });
          } else toast.error(getErrorMessage(e));
        },
      },
    );
  }

  const submit = form.handleSubmit((v) =>
    save({ name: v.name, phone: v.phone && v.phone !== me?.phone ? v.phone : undefined }),
  );

  const closeReauth = () => {
    setAwaitingReauth(null);
    reauth.reset();
  };

  return (
    <Card>
      <CardHeader title={t('account.profile.title')} description={t('account.profile.subtitle')} />
      <form onSubmit={submit} noValidate>
        <CardBody className="space-y-6">
          <AvatarPicker />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('form.fullName')} error={translateError(errors.name?.message)} required>
              <Input autoComplete="name" startIcon={<User className="size-4" />} {...form.register('name')} />
            </FormField>
            <FormField
              label={t('form.phone')}
              hint={t('account.profile.phoneHint')}
              error={translateError(errors.phone?.message)}
              labelAside={
                me?.phone ? (
                  <Badge size="sm" tone={me.phoneVerified ? 'success' : 'neutral'}>
                    {me.phoneVerified ? t('account.verified') : t('account.unverified')}
                  </Badge>
                ) : undefined
              }
            >
              <Input type="tel" dir="ltr" className="latin" autoComplete="tel" placeholder="+923001234567" startIcon={<Phone className="size-4" />} {...form.register('phone')} />
            </FormField>
          </div>
          {me?.pendingPhone && (
            <PendingPhonePanel
              key={me.pendingPhone}
              pendingPhone={me.pendingPhone}
              devCode={devCode}
              justSent={justSent}
              busy={update.isPending}
              onResend={() => save({ phone: me.pendingPhone })}
              onCancel={me.phone ? () => save({ phone: me.phone }) : undefined}
            />
          )}
          <FormField label={t('form.email')} hint={t('account.profile.emailHint')}>
            <Input value={me?.email ?? ''} readOnly disabled className="latin" />
          </FormField>
        </CardBody>
        <CardFooter>
          <Button type="button" variant="ghost" disabled={!isDirty} onClick={() => form.reset()}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={update.isPending && !awaitingReauth} disabled={!isDirty}>
            {t('common.saveChanges')}
          </Button>
        </CardFooter>
      </form>

      <Modal
        open={!!awaitingReauth}
        onOpenChange={(o) => !o && closeReauth()}
        size="sm"
        title={t('reauth.title')}
        description={t('reauth.phoneBody')}
        footer={
          <>
            <Button variant="ghost" onClick={closeReauth}>
              {t('common.cancel')}
            </Button>
            <Button
              loading={update.isPending}
              disabled={!reauth.ready}
              onClick={() => awaitingReauth && save(awaitingReauth)}
            >
              {t('reauth.continue')}
            </Button>
          </>
        }
      >
        <ReauthFields reauth={reauth} autoFocus />
      </Modal>
    </Card>
  );
}

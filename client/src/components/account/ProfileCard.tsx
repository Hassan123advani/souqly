import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { Camera, Phone, User } from 'lucide-react';
import { phoneSchema } from '@souqly/shared';
import { useMe } from '@/api/auth';
import { useUpdateProfile, useUploadAvatar } from '@/api/account';
import { getErrorMessage } from '@/api/client';
import { Avatar, Badge, Button, Card, CardBody, CardFooter, CardHeader, FormField, Input } from '@/components/ui';
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

export function ProfileCard() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const update = useUpdateProfile();
  const form = useForm<Values>({ resolver: zodResolver(schema), values: { name: me?.name ?? '', phone: me?.phone ?? '' } });
  const { errors, isDirty } = form.formState;

  const submit = form.handleSubmit((v) =>
    update.mutate(
      { name: v.name, phone: v.phone || undefined },
      {
        onSuccess: () => {
          toast.success(t('common.saved'));
          form.reset(v);
        },
        onError: (e) => toast.error(getErrorMessage(e)),
      },
    ),
  );

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
          <FormField label={t('form.email')} hint={t('account.profile.emailHint')}>
            <Input value={me?.email ?? ''} readOnly disabled className="latin" />
          </FormField>
        </CardBody>
        <CardFooter>
          <Button type="button" variant="ghost" disabled={!isDirty} onClick={() => form.reset()}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={update.isPending} disabled={!isDirty}>
            {t('common.saveChanges')}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

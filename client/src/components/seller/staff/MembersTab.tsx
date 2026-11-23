import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { MailPlus, Trash2, Users } from 'lucide-react';
import { INVITABLE_STORE_ROLES, staffInviteSchema, type StaffMemberDTO } from '@souqly/shared';
import { getErrorMessage } from '@/api/client';
import { useInviteStaff, useRemoveStaff, useRoles, useStaff, useUpdateStaff } from '@/api/seller';
import { Avatar, Badge, Button, EmptyState, ErrorState, FormField, IconButton, Input, Modal, Select, Skeleton, Switch } from '@/components/ui';
import { translateError } from '@/lib/validation';

/** Role select value: built-in role name, or `custom:<id>`. */
function useRoleOptions() {
  const { t } = useTranslation();
  const roles = useRoles();
  return [
    ...INVITABLE_STORE_ROLES.map((r) => ({ value: r, label: t(`seller.roles.${r}`) })),
    ...(roles.data ?? []).map((r) => ({ value: `custom:${r.id}`, label: `${r.name} (${t('seller.staff.custom')})` })),
  ];
}
const toBody = (v: string) => (v.startsWith('custom:') ? { customRoleId: v.slice(7) } : { role: v });
const roleValue = (m: StaffMemberDTO) => (m.customRole ? `custom:${m.customRole.id}` : m.role);

function InviteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const invite = useInviteStaff();
  const options = useRoleOptions();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<string>('MANAGER');
  const [error, setError] = useState<string>();
  const submit = () => {
    const parsed = staffInviteSchema.safeParse({ email, ...toBody(role) });
    if (!parsed.success) return setError(translateError(parsed.error.issues[0]?.message));
    setError(undefined);
    invite.mutate(parsed.data, {
      onSuccess: (r) => {
        toast.success(r.status === 'invited' ? t('seller.staff.invited') : t('seller.staff.emailSent'));
        setEmail('');
        onClose();
      },
      onError: (e) => toast.error(getErrorMessage(e)),
    });
  };
  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t('seller.staff.inviteTitle')}
      description={t('seller.staff.inviteBody')}
      footer={
        <Button loading={invite.isPending} onClick={submit}>
          {t('seller.staff.sendInvite')}
        </Button>
      }
    >
      <div className="grid gap-4">
        <FormField label={t('seller.contact.email')} required error={error}>
          <Input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </FormField>
        <FormField label={t('seller.staff.role')}>
          <Select value={role} onValueChange={setRole} options={options} />
        </FormField>
        <p className="text-xs text-fg-muted">{t(`seller.roles.hints.${role.startsWith('custom:') ? 'CUSTOM' : role}`)}</p>
      </div>
    </Modal>
  );
}

export function MembersTab() {
  const { t } = useTranslation();
  const q = useStaff();
  const update = useUpdateStaff();
  const remove = useRemoveStaff();
  const options = useRoleOptions();
  const [inviting, setInviting] = useState(false);
  const onErr = (e: unknown) => toast.error(getErrorMessage(e));
  const members = q.data ?? [];
  const pending = members.filter((m) => m.status === 'invited');
  const active = members.filter((m) => m.status !== 'invited');

  const row = (m: StaffMemberDTO) => (
    <li key={m.id} className="flex flex-wrap items-center gap-3 px-1 py-3">
      <Avatar name={m.user.name} src={m.user.avatar} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-fg">{m.user.name}</p>
        <p className="truncate text-xs text-fg-muted" dir="ltr">
          {m.user.email}
        </p>
      </div>
      {m.role === 'OWNER' ? (
        <Badge tone="accent">{t('seller.roles.OWNER')}</Badge>
      ) : (
        <>
          {m.status !== 'invited' && (
            <Switch
              checked={m.status === 'active'}
              onCheckedChange={(on) => update.mutate({ id: m.id, status: on ? 'active' : 'disabled' }, { onError: onErr })}
              label={<span className="sr-only">{t('seller.staff.active')}</span>}
            />
          )}
          <Select
            value={roleValue(m)}
            onValueChange={(v) => update.mutate({ id: m.id, ...toBody(v) }, { onSuccess: () => toast.success(t('seller.common.saved')), onError: onErr })}
            options={options}
            aria-label={t('seller.staff.role')}
            className="w-44"
          />
          <IconButton
            label={m.status === 'invited' ? t('seller.staff.revoke') : t('seller.staff.remove')}
            variant="ghost"
            size="sm"
            onClick={() => window.confirm(t('seller.staff.confirmRemove', { name: m.user.name })) && remove.mutate(m.id, { onError: onErr })}
          >
            <Trash2 className="size-4" />
          </IconButton>
        </>
      )}
    </li>
  );

  return (
    <div className="grid gap-5">
      <div className="flex justify-end">
        <Button leftIcon={<MailPlus className="size-4" />} onClick={() => setInviting(true)}>
          {t('seller.staff.invite')}
        </Button>
      </div>
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.isLoading ? (
        <Skeleton className="h-40" />
      ) : active.length <= 1 && !pending.length ? (
        <>
          <ul className="divide-y divide-border">{active.map(row)}</ul>
          <EmptyState compact icon={<Users />} title={t('seller.staff.emptyTitle')} description={t('seller.staff.emptyBody')} />
        </>
      ) : (
        <>
          <ul className="divide-y divide-border">{active.map(row)}</ul>
          {pending.length > 0 && (
            <div>
              <h3 className="mb-1 text-sm font-bold text-fg">{t('seller.staff.pending')}</h3>
              <ul className="divide-y divide-border">{pending.map(row)}</ul>
            </div>
          )}
        </>
      )}
      <InviteModal open={inviting} onClose={() => setInviting(false)} />
    </div>
  );
}

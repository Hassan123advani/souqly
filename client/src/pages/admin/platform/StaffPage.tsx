import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ShieldCheck, ShieldOff, UserPlus, UsersRound } from 'lucide-react';
import { PLATFORM_ROLE_PERMISSIONS, PLATFORM_ROLES, adminStaffInviteSchema, type PlatformRole } from '@souqly/shared';
import { useMe } from '@/api/auth';
import { useAdminGet, useAdminMutation, type StaffRow } from '@/api/admin';
import { getErrorMessage } from '@/api/client';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { DataTable, type Column } from '@/components/admin/DataTable';
import { PageHeader } from '@/components/admin/PageHeader';
import { StatusPill } from '@/components/admin/StatusPill';
import { Avatar, Badge, Button, Card, FormField, Input, Modal, Select } from '@/components/ui';
import { useLang } from '@/lib/catalog';
import { formatRelative } from '@/lib/format';

export default function StaffPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const { data: me } = useMe();
  const q = useAdminGet<StaffRow[]>('staff');
  const del = useAdminMutation('delete', ['staff', 'users']);
  const [invite, setInvite] = useState(false);
  const [remove, setRemove] = useState<StaffRow | null>(null);

  const columns: Column<StaffRow>[] = [
    {
      key: 'who',
      header: t('admin.users.user'),
      cell: (s) => (
        <Link to={`/admin/users/${s.id}`} className="flex items-center gap-3">
          <Avatar name={s.name} size="sm" />
          <div>
            <p className="font-semibold text-fg">
              {s.name} {s.id === me?.id && <span className="text-xs font-normal text-fg-muted">({t('admin.staff.you')})</span>}
            </p>
            <p className="text-xs text-fg-muted" dir="ltr">
              {s.email}
            </p>
          </div>
        </Link>
      ),
    },
    { key: 'role', header: t('admin.users.role'), cell: (s) => <Badge tone="primary" size="sm">{t(`admin.roles.${s.platformRole}`)}</Badge> },
    { key: 'status', header: t('admin.common.status'), cell: (s) => <StatusPill status={s.status} /> },
    {
      key: '2fa',
      header: t('admin.users.twoFactor'),
      cell: (s) => (s.twoFactorEnabled ? <ShieldCheck className="size-4 text-success" aria-label={t('admin.common.on')} /> : <ShieldOff className="size-4 text-danger" aria-label={t('admin.common.off')} />),
    },
    { key: 'last', header: t('admin.users.lastLogin'), cell: (s) => <span className="text-fg-muted">{s.lastLoginAt ? formatRelative(s.lastLoginAt, lang) : '—'}</span> },
    {
      key: 'a',
      header: '',
      align: 'end',
      cell: (s) =>
        s.id !== me?.id && (
          <Button size="sm" variant="ghost" onClick={() => setRemove(s)}>
            {t('admin.staff.remove')}
          </Button>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t('admin.nav.staff')}
        description={t('admin.staff.subtitle')}
        crumbs={[{ label: t('admin.nav.platform') }]}
        actions={
          <Button size="sm" leftIcon={<UserPlus className="size-4" />} onClick={() => setInvite(true)}>
            {t('admin.staff.add')}
          </Button>
        }
      />
      <DataTable rows={q.data ?? []} columns={columns} rowKey={(s) => s.id} isLoading={q.isLoading} error={q.error} onRetry={() => void q.refetch()} empty={{ title: t('admin.staff.empty'), icon: <UsersRound /> }} />
      <h2 className="mb-3 mt-8 text-base font-bold text-fg">{t('admin.staff.roles')}</h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {PLATFORM_ROLES.map((r) => (
          <Card key={r} className="p-4">
            <div className="flex items-center justify-between">
              <p className="font-bold text-fg">{t(`admin.roles.${r}`)}</p>
              <Badge size="sm">{t('admin.staff.permCount', { count: PLATFORM_ROLE_PERMISSIONS[r].length })}</Badge>
            </div>
            <p className="mt-1 text-sm text-fg-muted">{t(`admin.staff.roleDesc.${r}`)}</p>
            <div className="mt-3 flex flex-wrap gap-1">
              {PLATFORM_ROLE_PERMISSIONS[r].map((p) => (
                <code key={p} className="latin rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-fg-muted">
                  {p.replace('admin.', '')}
                </code>
              ))}
            </div>
          </Card>
        ))}
      </div>
      {invite && <InviteStaff onClose={() => setInvite(false)} />}
      {remove && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setRemove(null)}
          title={t('admin.staff.removeTitle', { name: remove.name })}
          description={t('admin.staff.removeDesc')}
          confirmLabel={t('admin.staff.remove')}
          tone="danger"
          loading={del.isPending}
          onConfirm={() => del.mutate({ path: `staff/${remove.id}` }, { onSuccess: () => (toast.success(t('admin.staff.removed')), setRemove(null)), onError: (e) => toast.error(getErrorMessage(e)) })}
        />
      )}
    </>
  );
}

function InviteStaff({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const add = useAdminMutation('post', ['staff', 'users']);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<PlatformRole>('SUPPORT');
  function save() {
    const parsed = adminStaffInviteSchema.safeParse({ email, platformRole: role });
    if (!parsed.success) return void toast.error(t('admin.staff.invalidEmail'));
    add.mutate({ path: 'staff', body: parsed.data }, { onSuccess: () => (toast.success(t('admin.staff.added')), onClose()), onError: (e) => toast.error(getErrorMessage(e)) });
  }
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('admin.staff.add')}
      description={t('admin.staff.addDesc')}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={add.isPending} onClick={save}>
            {t('admin.staff.add')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <FormField label={t('admin.users.email')} required>
          <Input dir="ltr" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </FormField>
        <FormField label={t('admin.users.role')}>
          <Select value={role} onValueChange={(v) => setRole(v as PlatformRole)} options={PLATFORM_ROLES.map((r) => ({ value: r, label: t(`admin.roles.${r}`) }))} />
        </FormField>
      </div>
    </Modal>
  );
}

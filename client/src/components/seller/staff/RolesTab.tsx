import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { STORE_PERMISSIONS, customRoleSchema, type CustomRoleDTO } from '@souqly/shared';
import { getErrorMessage } from '@/api/client';
import { useDeleteRole, useRoles, useSaveRole, useSellerStore } from '@/api/seller';
import { Badge, Button, Checkbox, EmptyState, ErrorState, FormField, IconButton, Input, Modal, Skeleton } from '@/components/ui';
import { translateError } from '@/lib/validation';

/** `store.orders.manage` → group `orders`. */
const groupOf = (p: string) => p.split('.')[1] ?? 'other';
const GROUPS = [...new Set(STORE_PERMISSIONS.map(groupOf))];

function RoleModal({ role, onClose }: { role: CustomRoleDTO | 'new' | null; onClose: () => void }) {
  const { t } = useTranslation();
  const save = useSaveRole();
  const { data: store } = useSellerStore();
  const r = role && role !== 'new' ? role : null;
  const [name, setName] = useState(r?.name ?? '');
  const [perms, setPerms] = useState<string[]>(r?.permissions ?? []);
  const [error, setError] = useState<string>();
  const mine = store?.myPermissions ?? [];
  const toggle = (p: string) => setPerms((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]));
  const submit = () => {
    const parsed = customRoleSchema.safeParse({ name, permissions: perms });
    if (!parsed.success) return setError(translateError(parsed.error.issues[0]?.message));
    save.mutate(
      { id: r?.id, body: parsed.data },
      {
        onSuccess: () => {
          toast.success(t('seller.common.saved'));
          onClose();
        },
        onError: (e) => toast.error(getErrorMessage(e)),
      },
    );
  };
  return (
    <Modal
      open={!!role}
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={r ? t('seller.rolesEditor.edit') : t('seller.rolesEditor.create')}
      footer={
        <Button loading={save.isPending} onClick={submit}>
          {t('seller.common.save')}
        </Button>
      }
    >
      <div className="grid gap-4">
        <FormField label={t('seller.rolesEditor.name')} required error={error}>
          <Input maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          {GROUPS.map((g) => (
            <fieldset key={g} className="rounded-md border border-border p-3">
              <legend className="px-1 text-xs font-bold uppercase tracking-wide text-fg-muted">{t(`seller.permGroups.${g}`, g)}</legend>
              <div className="grid gap-2">
                {STORE_PERMISSIONS.filter((p) => groupOf(p) === g).map((p) => (
                  <Checkbox
                    key={p}
                    checked={perms.includes(p)}
                    onChange={() => toggle(p)}
                    disabled={!mine.includes(p)}
                    label={t(`seller.perms.${p.replace(/\./g, '_')}`, p)}
                  />
                ))}
              </div>
            </fieldset>
          ))}
        </div>
        <p className="text-xs text-fg-muted">{t('seller.rolesEditor.grantHint')}</p>
      </div>
    </Modal>
  );
}

export function RolesTab() {
  const { t } = useTranslation();
  const q = useRoles();
  const del = useDeleteRole();
  const [editing, setEditing] = useState<CustomRoleDTO | 'new' | null>(null);
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-fg-muted">{t('seller.rolesEditor.hint')}</p>
        <Button leftIcon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
          {t('seller.rolesEditor.create')}
        </Button>
      </div>
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.isLoading ? (
        <Skeleton className="h-32" />
      ) : !q.data?.length ? (
        <EmptyState compact icon={<ShieldCheck />} title={t('seller.rolesEditor.empty')} />
      ) : (
        <ul className="divide-y divide-border">
          {q.data.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-fg">{r.name}</p>
                <p className="text-xs text-fg-muted">{t('seller.rolesEditor.summary', { perms: r.permissions.length, members: r.memberCount })}</p>
              </div>
              {r.memberCount > 0 && <Badge size="sm">{t('seller.rolesEditor.inUse')}</Badge>}
              <IconButton label={t('seller.common.edit')} size="sm" variant="ghost" onClick={() => setEditing(r)}>
                <Pencil className="size-4" />
              </IconButton>
              <IconButton
                label={t('seller.common.delete')}
                size="sm"
                variant="ghost"
                disabled={r.memberCount > 0}
                onClick={() => window.confirm(t('seller.rolesEditor.confirmDelete', { name: r.name })) && del.mutate(r.id, { onError: (e) => toast.error(getErrorMessage(e)) })}
              >
                <Trash2 className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      {editing && <RoleModal key={editing === 'new' ? 'new' : editing.id} role={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

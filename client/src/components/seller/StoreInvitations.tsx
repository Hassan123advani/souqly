import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Store } from 'lucide-react';
import { getErrorMessage } from '@/api/client';
import { useMyInvitations, useRespondInvitation } from '@/api/seller';
import { Avatar, Button, Card } from '@/components/ui';

/** Buyer side: pending invitations to join a store's team. Renders nothing when there are none. */
export function StoreInvitations() {
  const { t } = useTranslation();
  const q = useMyInvitations();
  const respond = useRespondInvitation();
  if (!q.data?.length) return null;
  return (
    <Card className="mb-5 border-accent-200 bg-accent-50/40 p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-bold text-fg">
        <Store className="size-4 text-accent-700" /> {t('seller.invitations.title')}
      </p>
      <ul className="grid gap-2">
        {q.data.map((inv) => (
          <li key={inv.id} className="flex flex-wrap items-center gap-3 rounded-md bg-surface p-3">
            <Avatar name={inv.store.name} src={inv.store.logo} size="sm" />
            <p className="min-w-0 flex-1 text-sm text-fg">
              {t('seller.invitations.body', { store: inv.store.name, role: inv.customRole?.name ?? t(`seller.roles.${inv.role}`) })}
            </p>
            <Button
              size="sm"
              loading={respond.isPending && respond.variables?.id === inv.id && respond.variables.accept}
              onClick={() =>
                respond.mutate({ id: inv.id, accept: true }, { onSuccess: () => toast.success(t('seller.invitations.accepted', { store: inv.store.name })), onError: (e) => toast.error(getErrorMessage(e)) })
              }
            >
              {t('seller.invitations.accept')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => respond.mutate({ id: inv.id, accept: false }, { onError: (e) => toast.error(getErrorMessage(e)) })}>
              {t('seller.invitations.decline')}
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

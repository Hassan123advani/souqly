import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Briefcase, Home, MapPin, MapPinned, MoreVertical, Pencil, Phone, Plus, Star, Trash2 } from 'lucide-react';
import { useAddresses, useDeleteAddress, useSetDefaultAddress } from '@/api/account';
import { getErrorMessage } from '@/api/client';
import type { Address } from '@/api/types';
import { AddressFormModal } from '@/components/account/AddressFormModal';
import { Seo } from '@/components/layout/Seo';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  ErrorState,
  IconButton,
  Modal,
  Skeleton,
} from '@/components/ui';
import { cn } from '@/lib/cn';

const LABEL_ICON: Record<string, typeof Home> = { Home, Work: Briefcase };

function AddressCard({ a, onEdit, onDelete }: { a: Address; onEdit: () => void; onDelete: () => void }) {
  const { t } = useTranslation();
  const setDefault = useSetDefaultAddress();
  const Icon = LABEL_ICON[a.label ?? ''] ?? MapPin;
  const knownLabel = ['Home', 'Work', 'Other'].includes(a.label ?? '');
  return (
    <Card className={cn('relative flex flex-col p-5', a.isDefault && 'ring-2 ring-primary/60')}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-t-[1.25rem] rounded-b-md bg-primary-50 text-primary-700">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold text-fg">{knownLabel ? t(`account.addresses.labels.${a.label}`) : a.label}</p>
            {a.isDefault && (
              <Badge tone="primary" size="sm">
                {t('account.addresses.default')}
              </Badge>
            )}
            {a.location && (
              <Badge tone="neutral" size="sm">
                <MapPinned className="size-3" />
                {t('account.addresses.pinned')}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm font-medium text-fg">{a.fullName}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton label={t('common.moreActions')} size="sm" className="-me-2 -mt-1">
              <MoreVertical className="size-4" />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-48">
            <DropdownMenuItem icon={<Pencil />} onSelect={onEdit}>
              {t('common.edit')}
            </DropdownMenuItem>
            {!a.isDefault && (
              <DropdownMenuItem
                icon={<Star />}
                onSelect={() =>
                  setDefault.mutate(a.id, {
                    onSuccess: () => toast.success(t('account.addresses.defaultSet')),
                    onError: (e) => toast.error(getErrorMessage(e)),
                  })
                }
              >
                {t('account.addresses.setDefault')}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem icon={<Trash2 />} danger onSelect={onDelete}>
              {t('common.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-fg-muted">
        {[a.line1, a.line2, a.area, a.city, a.postalCode].filter(Boolean).join(', ')}
        <br />
        {t(`countries.${a.country ?? 'PK'}`)}
      </p>
      <p className="latin mt-3 flex items-center gap-2 text-sm text-fg-muted" dir="ltr">
        <Phone className="size-3.5" />
        {a.phone}
      </p>
    </Card>
  );
}

export default function AddressesPage() {
  const { t } = useTranslation();
  const q = useAddresses();
  const del = useDeleteAddress();
  const [editing, setEditing] = useState<Address | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Address | null>(null);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  return (
    <>
      <Seo title={t('account.nav.addresses')} noindex />
      <Card>
        <CardHeader
          title={t('account.addresses.title')}
          description={t('account.addresses.subtitle')}
          action={
            q.data && q.data.length > 0 ? (
              <Button size="sm" leftIcon={<Plus className="size-4" />} onClick={openNew}>
                {t('account.addresses.add')}
              </Button>
            ) : undefined
          }
        />
        <div className="p-5 sm:p-6">
          {q.isPending ? (
            <div className="grid gap-4 md:grid-cols-2">
              {[0, 1].map((i) => (
                <div key={i} className="rounded-lg border border-border p-5">
                  <div className="flex gap-3">
                    <Skeleton className="size-10 rounded-md" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3.5 w-1/3" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                  <Skeleton className="mt-4 h-3 w-full" />
                  <Skeleton className="mt-2 h-3 w-2/3" />
                </div>
              ))}
            </div>
          ) : q.isError ? (
            <ErrorState error={q.error} onRetry={() => q.refetch()} compact />
          ) : q.data.length === 0 ? (
            <EmptyState
              icon={<MapPin />}
              title={t('account.addresses.emptyTitle')}
              description={t('account.addresses.emptyBody')}
              action={
                <Button leftIcon={<Plus className="size-4" />} onClick={openNew}>
                  {t('account.addresses.add')}
                </Button>
              }
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {[...q.data]
                .sort((a, b) => Number(b.isDefault) - Number(a.isDefault))
                .map((a) => (
                  <AddressCard
                    key={a.id}
                    a={a}
                    onEdit={() => {
                      setEditing(a);
                      setFormOpen(true);
                    }}
                    onDelete={() => setToDelete(a)}
                  />
                ))}
            </div>
          )}
        </div>
      </Card>

      <AddressFormModal open={formOpen} onOpenChange={setFormOpen} address={editing} isFirst={q.data?.length === 0} />

      <Modal
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        size="sm"
        title={t('account.addresses.deleteTitle')}
        description={t('account.addresses.deleteBody')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setToDelete(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={del.isPending}
              onClick={() =>
                toDelete &&
                del.mutate(toDelete.id, {
                  onSuccess: () => {
                    toast.success(t('account.addresses.deleted'));
                    setToDelete(null);
                  },
                  onError: (e) => toast.error(getErrorMessage(e)),
                })
              }
            >
              {t('common.delete')}
            </Button>
          </>
        }
      />
    </>
  );
}

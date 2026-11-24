import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { getErrorMessage } from '@/api/client';
import { useDeleteMarketing, type MarketingKind } from '@/api/growth';
import { Badge, Button, Card, EmptyState, ErrorState, IconButton, Modal, Skeleton } from '@/components/ui';
import { useLang } from '@/lib/catalog';
import { formatDateTime } from '@/lib/format';
import { WINDOW_TONE, windowState } from '../growth/utils';

/** Loading / error / empty wrapper for a marketing list. */
export function ListState<T>({
  query,
  empty,
  children,
}: {
  query: { data?: T[]; isLoading: boolean; error: unknown; refetch: () => unknown };
  empty: { icon: ReactNode; title: string; description?: string; action?: ReactNode };
  children: (rows: T[]) => ReactNode;
}) {
  if (query.error) {
    return (
      <Card>
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </Card>
    );
  }
  if (query.isLoading || !query.data) {
    return (
      <div className="grid gap-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }
  if (!query.data.length) {
    return (
      <Card>
        <EmptyState {...empty} />
      </Card>
    );
  }
  return <>{children(query.data)}</>;
}

/** Active / scheduled / ended / paused badge for a time-boxed promotion. */
export function WindowBadge({ startsAt, endsAt, isActive }: { startsAt?: string | null; endsAt?: string | null; isActive: boolean }) {
  const { t } = useTranslation();
  const s = windowState({ startsAt, endsAt, isActive });
  return (
    <Badge tone={WINDOW_TONE[s]} size="sm">
      {t(`growth.state.${s}`)}
    </Badge>
  );
}

export function WindowText({ startsAt, endsAt }: { startsAt?: string | null; endsAt?: string | null }) {
  const { t } = useTranslation();
  const lang = useLang();
  if (!startsAt && !endsAt) return <span>{t('growth.common.always')}</span>;
  return (
    <span>
      {startsAt ? formatDateTime(startsAt, lang) : '…'} → {endsAt ? formatDateTime(endsAt, lang) : '…'}
    </span>
  );
}

/** Trash button with a confirm modal; deletes `/seller/marketing/<kind>/<id>`. */
export function DeleteMarketing({ kind, id, name }: { kind: MarketingKind; id: string; name: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const del = useDeleteMarketing(kind);
  return (
    <>
      <IconButton label={t('seller.common.delete')} size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <Trash2 className="size-4" />
      </IconButton>
      <Modal
        open={open}
        onOpenChange={setOpen}
        size="sm"
        title={t('growth.common.deleteTitle')}
        description={t('growth.common.deleteBody', { name })}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t('seller.common.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={del.isPending}
              onClick={() =>
                del.mutate(id, {
                  onSuccess: () => {
                    toast.success(t('seller.common.deleted'));
                    setOpen(false);
                  },
                  onError: (e) => toast.error(getErrorMessage(e)),
                })
              }
            >
              {t('seller.common.delete')}
            </Button>
          </>
        }
      />
    </>
  );
}

/** Server `details.items[]` errors (flash deals) → "Item 2: message" lines. */
export function itemErrors(details: Record<string, unknown> | undefined): string[] {
  const items = details?.items;
  if (!Array.isArray(items)) return [];
  return items.map((i: { index?: number; message?: string }) => `#${(i.index ?? 0) + 1}: ${i.message ?? ''}`);
}

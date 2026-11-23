import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, Plus } from 'lucide-react';
import { useAddresses } from '@/api/account';
import { AddressFormModal } from '@/components/account/AddressFormModal';
import { Badge, Button, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { Step } from './Step';

/** Saved-address picker. Preselects the default; a newly added address becomes the selection. */
export function AddressStep({ value, onChange }: { value?: string; onChange: (id: string) => void }) {
  const { t } = useTranslation();
  const q = useAddresses();
  const [adding, setAdding] = useState(false);
  const known = useRef<Set<string> | null>(null);
  const list = q.data;

  useEffect(() => {
    if (!list) return;
    const ids = new Set(list.map((a) => a.id));
    const added = known.current ? list.find((a) => !known.current!.has(a.id)) : undefined;
    known.current = ids;
    if (added) onChange(added.id);
    else if (!value || !ids.has(value)) {
      const pick = list.find((a) => a.isDefault) ?? list[0];
      if (pick) onChange(pick.id);
    }
  }, [list, value, onChange]);

  return (
    <Step
      n={1}
      title={t('checkout.address')}
      action={
        list?.length ? (
          <Button size="sm" variant="ghost" leftIcon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
            {t('checkout.addAddress')}
          </Button>
        ) : null
      }
    >
      {q.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : q.isError ? (
        <ErrorState compact error={q.error} onRetry={() => void q.refetch()} />
      ) : !list?.length ? (
        <EmptyState
          compact
          icon={<MapPin />}
          title={t('checkout.noAddress')}
          description={t('checkout.noAddressBody')}
          action={<Button onClick={() => setAdding(true)}>{t('checkout.addAddress')}</Button>}
        />
      ) : (
        <div role="radiogroup" aria-label={t('checkout.address')} className="grid gap-3 sm:grid-cols-2">
          {list.map((a) => {
            const on = a.id === value;
            return (
              <button
                key={a.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onChange(a.id)}
                className={cn(
                  'rounded-md border p-3.5 text-start transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring',
                  on ? 'border-primary bg-primary-50/60 ring-1 ring-primary' : 'border-border hover:border-border-strong',
                )}
              >
                <span className="flex items-center gap-2">
                  <span className={cn('grid size-4 place-items-center rounded-full border-2', on ? 'border-primary' : 'border-border-strong')}>
                    {on && <span className="size-2 rounded-full bg-primary" />}
                  </span>
                  <span className="text-sm font-bold text-fg">{a.fullName}</span>
                  <Badge size="sm">{a.label}</Badge>
                  {a.isDefault && (
                    <Badge size="sm" tone="primary">
                      {t('checkout.default')}
                    </Badge>
                  )}
                </span>
                <span className="mt-1.5 block text-sm text-fg-muted">
                  {[a.line1, a.line2, a.area, a.city].filter(Boolean).join(', ')}
                </span>
                <span className="latin mt-1 inline-block text-xs text-fg-subtle" dir="ltr">
                  {a.phone}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <AddressFormModal open={adding} onOpenChange={setAdding} isFirst={!list?.length} />
    </Step>
  );
}

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Check, ChevronDown, Heart, ListPlus, Plus } from 'lucide-react';
import { useInWishlist, useWishlistMutations, useWishlists } from '@/api/social';
import { socialError } from '@/components/social/errors';
import { useAuthGate } from '@/components/social/useAuthGate';
import { Button, EmptyState, ErrorState, Input, Modal, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';

/** Pick which list(s) a product goes into, or create a new list. */
export function ListChooser({ open, onOpenChange, productId, variantId }: { open: boolean; onOpenChange: (v: boolean) => void; productId: string; variantId?: string }) {
  const { t } = useTranslation();
  const lists = useWishlists(open);
  const m = useWishlistMutations();
  const [name, setName] = useState('');
  const [added, setAdded] = useState<string[]>([]);
  const add = (listId: string) =>
    m.addTo.mutate(
      { listId, productId, ...(variantId ? { variantId } : {}) },
      {
        onSuccess: () => {
          setAdded((a) => [...a, listId]);
          toast.success(t('wishlist.addedTo'));
        },
        onError: (e) => toast.error(socialError(e)),
      },
    );
  const create = () =>
    m.create.mutate(name.trim(), {
      onSuccess: (l) => {
        setName('');
        add(l.id);
      },
      onError: (e) => toast.error(socialError(e)),
    });

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={t('wishlist.chooseList')} size="sm">
      {lists.isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : lists.isError ? (
        <ErrorState error={lists.error} onRetry={() => void lists.refetch()} compact />
      ) : !lists.data.length ? (
        <EmptyState compact title={t('wishlist.noLists')} />
      ) : (
        <ul className="space-y-1">
          {lists.data.map((l) => {
            const done = added.includes(l.id);
            return (
              <li key={l.id}>
                <button
                  type="button"
                  disabled={done || m.addTo.isPending}
                  onClick={() => add(l.id)}
                  className="flex w-full items-center gap-3 rounded-md p-2.5 text-start hover:bg-surface-2 disabled:opacity-70"
                >
                  <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-md bg-surface-2">
                    {l.cover ? <img src={l.cover} alt="" className="size-full object-cover" /> : <Heart className="size-4 text-fg-subtle" aria-hidden />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-fg">{l.isDefault ? t('wishlist.defaultName') : l.name}</span>
                    <span className="text-xs text-fg-muted">{t('wishlist.itemsN', { n: l.itemCount })}</span>
                  </span>
                  {done ? <Check className="size-4 text-success" aria-label={t('wishlist.added')} /> : <Plus className="size-4 text-fg-muted" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <form
        className="mt-4 flex gap-2 border-t border-border pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create();
        }}
      >
        <Input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={t('wishlist.newListPh')} aria-label={t('wishlist.newList')} />
        <Button type="submit" variant="outline" disabled={!name.trim()} loading={m.create.isPending} leftIcon={<ListPlus className="size-4" />}>
          {t('wishlist.create')}
        </Button>
      </form>
    </Modal>
  );
}

function useHeart(productId: string, variantId?: string) {
  const { t } = useTranslation();
  const has = useInWishlist(productId);
  const m = useWishlistMutations();
  const gate = useAuthGate();
  const [chooser, setChooser] = useState(false);
  const on = !!has.data;
  const toggle = () =>
    gate(() => {
      if (on) {
        m.removeEverywhere.mutate(productId, {
          onSuccess: () => toast.success(t('wishlist.removed')),
          onError: (e) => toast.error(socialError(e)),
        });
      } else {
        m.addDefault.mutate(
          { productId, ...(variantId ? { variantId } : {}) },
          {
            onSuccess: () => toast.success(t('wishlist.saved'), { action: { label: t('wishlist.changeList'), onClick: () => setChooser(true) } }),
            onError: (e) => toast.error(socialError(e)),
          },
        );
      }
    });
  return { on, toggle, chooser, setChooser, gate, busy: m.addDefault.isPending || m.removeEverywhere.isPending };
}

/** Round heart for product cards (sits above the card's stretched link). */
export function CardHeart({ productId, className }: { productId: string; className?: string }) {
  const { t } = useTranslation();
  const h = useHeart(productId);
  return (
    <>
      <button
        type="button"
        onClick={h.toggle}
        disabled={h.busy}
        aria-pressed={h.on}
        aria-label={h.on ? t('wishlist.remove') : t('wishlist.add')}
        className={cn(
          'relative z-10 grid size-8 shrink-0 place-items-center rounded-full transition-colors hover:bg-sale-50 focus-visible:ring-2 focus-visible:ring-primary',
          h.on ? 'text-sale' : 'text-fg-subtle hover:text-sale',
          className,
        )}
      >
        <Heart className={cn('size-[18px] transition-transform', h.on && 'scale-110 fill-current')} />
      </button>
      {h.chooser && <ListChooser open onOpenChange={h.setChooser} productId={productId} />}
    </>
  );
}

/** PDP wishlist button + "save to list" chooser. */
export function PdpWishlistButton({ productId, variantId }: { productId: string; variantId?: string }) {
  const { t } = useTranslation();
  const h = useHeart(productId, variantId);
  return (
    <span className="inline-flex">
      <Button
        variant="outline"
        size="sm"
        aria-pressed={h.on}
        onClick={h.toggle}
        loading={h.busy}
        className="rounded-e-none"
        leftIcon={<Heart className={cn('size-4', h.on && 'fill-sale text-sale')} />}
      >
        {h.on ? t('wishlist.savedShort') : t('wishlist.save')}
      </Button>
      <Button variant="outline" size="sm" className="rounded-s-none border-s-0 px-2" aria-label={t('wishlist.chooseList')} onClick={() => h.gate(() => h.setChooser(true))}>
        <ChevronDown className="size-4" />
      </Button>
      {h.chooser && <ListChooser open onOpenChange={h.setChooser} productId={productId} variantId={variantId} />}
    </span>
  );
}

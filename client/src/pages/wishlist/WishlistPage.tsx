import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FolderInput, Heart, ListPlus, MoreHorizontal, Pencil, ShoppingCart, Trash2 } from 'lucide-react';
import type { ProductDetail, WishlistDTO, WishlistItemDTO } from '@souqly/shared';
import { catalogKeys } from '@/api/catalog';
import { get } from '@/api/client';
import { useWishlist, useWishlistMutations, useWishlists } from '@/api/social';
import { Seo } from '@/components/layout/Seo';
import { ProductImage } from '@/components/product/ProductImage';
import { socialError } from '@/components/social/errors';
import {
  Badge,
  Button,
  Container,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  Modal,
  Price,
  Rating,
  SectionHeader,
  Skeleton,
} from '@/components/ui';
import { useAddToCart } from '@/hooks/useAddToCart';
import { cn } from '@/lib/cn';

function NameDialog({ initial, title, onSave, onClose, loading }: { initial: string; title: string; onSave: (n: string) => void; onClose: () => void; loading: boolean }) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial);
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button disabled={!name.trim()} loading={loading} onClick={() => onSave(name.trim())}>
            {t('wishlist.saveName')}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSave(name.trim());
        }}
      >
        <Input autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-label={t('wishlist.listName')} />
      </form>
    </Modal>
  );
}

function ItemRow({ item, list, lists }: { item: WishlistItemDTO; list: WishlistDTO; lists: WishlistDTO[] }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const addToCart = useAddToCart();
  const m = useWishlistMutations();
  const [adding, setAdding] = useState(false);
  const p = item.product;
  const others = lists.filter((l) => l.id !== list.id);
  const key = { listId: list.id, productId: item.productId, ...(item.variantId ? { variantId: item.variantId } : {}) };

  const onCart = async () => {
    if (!p) return;
    setAdding(true);
    try {
      const d = await qc.fetchQuery({ queryKey: catalogKeys.product(p.slug), queryFn: () => get<ProductDetail>(`/products/${encodeURIComponent(p.slug)}`), staleTime: 30_000 });
      const active = d.variants.filter((v) => v.isActive);
      const v = item.variantId ? active.find((x) => x.id === item.variantId) : active.length === 1 ? active[0] : undefined;
      if (!v) navigate(`/p/${p.slug}`);
      else if (v.stock <= 0) toast.error(t('wishlist.outOfStock'));
      else addToCart(d, v, 1);
    } catch (e) {
      toast.error(socialError(e));
    } finally {
      setAdding(false);
    }
  };

  const move = (to: string) =>
    m.addTo.mutate(
      { listId: to, productId: item.productId, ...(item.variantId ? { variantId: item.variantId } : {}) },
      {
        onSuccess: () => m.removeFrom.mutate(key, { onSuccess: () => toast.success(t('wishlist.moved')) }),
        onError: (e) => toast.error(socialError(e)),
      },
    );

  return (
    <li className="flex gap-3 py-4 sm:gap-4">
      {p ? (
        <Link to={`/p/${p.slug}`} className="shrink-0">
          <ProductImage src={p.image ?? ''} alt="" className="size-24 rounded-md sm:size-28" />
        </Link>
      ) : (
        <div className="grid size-24 shrink-0 place-items-center rounded-md bg-surface-2 text-fg-subtle sm:size-28">
          <Heart className="size-6" aria-hidden />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {p ? (
          <>
            <Link to={`/p/${p.slug}`} className="line-clamp-2 text-sm font-medium text-fg hover:underline sm:text-base">
              {p.title}
            </Link>
            <Price amount={p.price} compareAt={p.compareAtPrice} size="md" />
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {p.ratingAvg > 0 && <Rating value={p.ratingAvg} />}
              {p.inStock ? <Badge tone="success" size="sm">{t('wishlist.inStock')}</Badge> : <Badge tone="danger" size="sm">{t('wishlist.outOfStock')}</Badge>}
            </div>
          </>
        ) : (
          <p className="text-sm text-fg-muted">{t('wishlist.unavailable')}</p>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          {p && (
            <Button size="sm" variant="accent" disabled={!p.inStock} loading={adding} onClick={() => void onCart()} leftIcon={<ShoppingCart className="size-4" />}>
              {t('wishlist.addToCart')}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton label={t('common.moreActions')} variant="ghost" size="sm">
                <MoreHorizontal className="size-4" />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {others.length > 0 && (
                <>
                  <DropdownMenuLabel>{t('wishlist.moveTo')}</DropdownMenuLabel>
                  {others.map((l) => (
                    <DropdownMenuItem key={l.id} icon={<FolderInput className="size-4" />} onSelect={() => move(l.id)}>
                      {l.isDefault ? t('wishlist.defaultName') : l.name}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem
                danger
                icon={<Trash2 className="size-4" />}
                onSelect={() => m.removeFrom.mutate(key, { onSuccess: () => toast.success(t('wishlist.removed')), onError: (e) => toast.error(socialError(e)) })}
              >
                {t('wishlist.removeItem')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </li>
  );
}

/** `/wishlist`: lists as tabs, items with add-to-cart / move / remove, list create/rename/delete. */
export default function WishlistPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const lists = useWishlists();
  const m = useWishlistMutations();
  const all = lists.data ?? [];
  const activeId = all.find((l) => l.id === params.get('list'))?.id ?? all.find((l) => l.isDefault)?.id ?? all[0]?.id;
  const active = all.find((l) => l.id === activeId);
  const detail = useWishlist(activeId);
  const [dialog, setDialog] = useState<'create' | 'rename' | 'delete' | null>(null);
  const name = (l: WishlistDTO) => (l.isDefault ? t('wishlist.defaultName') : l.name);

  return (
    <Container className="py-6 sm:py-10">
      <Seo title={t('wishlist.title')} noindex />
      <SectionHeader
        as="h1"
        title={t('wishlist.title')}
        action={
          <Button variant="outline" size="sm" leftIcon={<ListPlus className="size-4" />} onClick={() => setDialog('create')}>
            {t('wishlist.newList')}
          </Button>
        }
      />

      {lists.isPending ? (
        <div className="mt-6 space-y-4">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : lists.isError ? (
        <ErrorState className="mt-6" error={lists.error} onRetry={() => void lists.refetch()} />
      ) : (
        <>
          <div role="tablist" aria-label={t('wishlist.lists')} className="no-scrollbar -mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            {all.map((l) => (
              <button
                key={l.id}
                role="tab"
                aria-selected={l.id === activeId}
                onClick={() => setParams({ list: l.id }, { replace: true })}
                className={cn(
                  'inline-flex h-10 shrink-0 items-center gap-2 rounded-pill border px-4 text-sm font-semibold transition-colors',
                  l.id === activeId ? 'border-primary bg-primary text-primary-fg' : 'border-border bg-surface text-fg hover:border-border-strong',
                )}
              >
                {name(l)}
                <span className="latin text-xs opacity-75 tabular">{l.itemCount}</span>
              </button>
            ))}
          </div>

          <section className="mt-4 rounded-lg border border-border bg-surface px-4 sm:px-6" aria-live="polite">
            {active && !active.isDefault && (
              <div className="flex justify-end gap-1 border-b border-border py-2">
                <Button variant="ghost" size="sm" leftIcon={<Pencil className="size-4" />} onClick={() => setDialog('rename')}>
                  {t('wishlist.rename')}
                </Button>
                <Button variant="ghost" size="sm" className="text-danger" leftIcon={<Trash2 className="size-4" />} onClick={() => setDialog('delete')}>
                  {t('wishlist.deleteList')}
                </Button>
              </div>
            )}
            {detail.isPending ? (
              <div className="space-y-4 py-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex gap-4">
                    <Skeleton className="size-24 rounded-md" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-5 w-24" />
                    </div>
                  </div>
                ))}
              </div>
            ) : detail.isError ? (
              <ErrorState className="my-6" error={detail.error} onRetry={() => void detail.refetch()} />
            ) : !detail.data.items.length ? (
              <EmptyState
                className="my-8"
                icon={<Heart className="size-6" />}
                title={t('wishlist.empty')}
                description={t('wishlist.emptyHint')}
                action={<Button to="/">{t('wishlist.browse')}</Button>}
              />
            ) : (
              <ul className="divide-y divide-border">
                {detail.data.items.map((it) => (
                  <ItemRow key={`${it.productId}-${it.variantId ?? ''}`} item={it} list={detail.data} lists={all} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {dialog === 'create' && (
        <NameDialog
          initial=""
          title={t('wishlist.newList')}
          loading={m.create.isPending}
          onClose={() => setDialog(null)}
          onSave={(n) =>
            m.create.mutate(n, {
              onSuccess: (l) => {
                setDialog(null);
                setParams({ list: l.id }, { replace: true });
              },
              onError: (e) => toast.error(socialError(e)),
            })
          }
        />
      )}
      {dialog === 'rename' && active && (
        <NameDialog
          initial={active.name}
          title={t('wishlist.rename')}
          loading={m.rename.isPending}
          onClose={() => setDialog(null)}
          onSave={(n) => m.rename.mutate({ id: active.id, name: n }, { onSuccess: () => setDialog(null), onError: (e) => toast.error(socialError(e)) })}
        />
      )}
      {dialog === 'delete' && active && (
        <Modal
          open
          onOpenChange={(v) => !v && setDialog(null)}
          title={t('wishlist.deleteTitle', { name: active.name })}
          description={t('wishlist.deleteBody')}
          size="sm"
          footer={
            <>
              <Button variant="ghost" onClick={() => setDialog(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="danger"
                loading={m.remove.isPending}
                onClick={() =>
                  m.remove.mutate(active.id, {
                    onSuccess: () => {
                      setDialog(null);
                      setParams({}, { replace: true });
                    },
                    onError: (e) => toast.error(socialError(e)),
                  })
                }
              >
                {t('common.delete')}
              </Button>
            </>
          }
        />
      )}
    </Container>
  );
}

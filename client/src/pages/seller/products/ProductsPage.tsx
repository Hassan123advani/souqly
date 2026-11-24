import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Archive, Copy, FileSpreadsheet, MoreHorizontal, Package, Pencil, Plus, Search, Send } from 'lucide-react';
import { PERMISSIONS, PRODUCT_STATUSES, type ProductStatus, type SellerProduct } from '@souqly/shared';
import { getErrorMessage } from '@/api/client';
import { useBulkProducts, useProductAction, useSellerProducts } from '@/api/seller';
import { Seo } from '@/components/layout/Seo';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  LoadMore,
  Modal,
  SectionHeader,
  Skeleton,
  type BadgeTone,
} from '@/components/ui';
import { PublishPausedAlert } from '@/components/billing/PublishPausedAlert';
import { useBillingSuspension } from '@/components/billing/SuspendedBanner';
import { useCan } from '@/components/seller/usePermissions';
import { useDebounced } from '@/hooks/useDebounced';
import { cn } from '@/lib/cn';
import { money } from '@/lib/format';

export const PRODUCT_TONES: Record<ProductStatus, BadgeTone> = {
  draft: 'neutral',
  pending_review: 'warning',
  published: 'success',
  rejected: 'danger',
  archived: 'neutral',
};

export default function ProductsPage() {
  const { t, i18n } = useTranslation();
  const can = useCan();
  const manage = can(PERMISSIONS.STORE_PRODUCTS_MANAGE);
  const publishPaused = useBillingSuspension().suspended === true;
  const [sp, setSp] = useSearchParams();
  const status = (sp.get('status') as ProductStatus | null) ?? undefined;
  const [q, setQ] = useState(sp.get('q') ?? '');
  const dq = useDebounced(q.trim(), 350);
  const list = useSellerProducts({ status, q: dq || undefined });
  const action = useProductAction();
  const bulkMut = useBulkProducts();
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmArchive, setConfirmArchive] = useState<string[] | null>(null);
  const items = list.data?.pages.flatMap((p) => p.data) ?? [];
  const counts = list.data?.pages[0]?.meta?.counts;

  const setStatus = (s?: string) => {
    const n = new URLSearchParams(sp);
    if (s) n.set('status', s);
    else n.delete('status');
    setSp(n, { replace: true });
    setSelected([]);
  };

  async function bulk(kind: 'publish' | 'archive', ids: string[]) {
    try {
      const res = await bulkMut.mutateAsync({ ids, action: kind });
      if (res.ok.length) toast.success(t(kind === 'publish' ? 'seller.products.publishedN' : 'seller.products.archivedN', { count: res.ok.length }));
      for (const f of res.failed) {
        const title = items.find((p) => p.id === f.id)?.title ?? f.id;
        const reason = i18n.exists(`errors.${f.code}`) ? t(`errors.${f.code}`) : f.message;
        toast.error(t('seller.products.bulkFailed', { title, reason }));
      }
      setSelected((s) => s.filter((id) => !res.ok.includes(id)));
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  }

  async function duplicate(p: SellerProduct) {
    try {
      await action.mutateAsync({ id: p.id, action: 'duplicate' });
      toast.success(t('seller.products.duplicated'));
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  }

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const allOn = items.length > 0 && items.every((p) => selected.includes(p.id));

  return (
    <>
      <Seo title={t('seller.nav.products')} noindex />
      <SectionHeader
        as="h1"
        title={t('seller.nav.products')}
        description={t('seller.products.subtitle')}
        action={
          manage && (
            <div className="flex flex-wrap gap-2">
              <Button to="/seller/products/bulk" variant="outline" leftIcon={<FileSpreadsheet className="size-4" />}>
                {t('growth.bulk.short')}
              </Button>
              <Button to="/seller/products/new" leftIcon={<Plus className="size-4" />}>
                {t('seller.products.add')}
              </Button>
            </div>
          )
        }
      />
      {manage && publishPaused && <PublishPausedAlert className="mb-4" />}
      <div className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex w-max gap-1 border-b border-border" role="tablist">
          {[undefined, ...PRODUCT_STATUSES].map((s) => (
            <button
              key={s ?? 'all'}
              role="tab"
              aria-selected={status === s}
              onClick={() => setStatus(s)}
              className={cn(
                '-mb-px flex h-10 items-center gap-1.5 border-b-2 px-3 text-sm font-semibold',
                status === s ? 'border-primary text-primary-800' : 'border-transparent text-fg-muted hover:text-fg',
              )}
            >
              {t(s ? `seller.productStatus.${s}` : 'seller.common.all')}
              {counts && <span className="rounded-pill bg-surface-2 px-1.5 text-[11px]">{counts[s ?? 'all'] ?? 0}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-80">
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('seller.products.search')}
            aria-label={t('seller.products.search')}
            startIcon={<Search className="size-4" />}
          />
        </div>
        {manage && selected.length > 0 && (
          <div className="flex items-center gap-2 rounded-md bg-primary-50 px-3 py-1.5 text-sm">
            <span className="font-semibold text-primary-800">{t('seller.common.selected', { count: selected.length })}</span>
            <Button
              size="sm"
              variant="outline"
              leftIcon={<Send className="size-4" />}
              loading={bulkMut.isPending}
              disabled={publishPaused}
              title={publishPaused ? t('billing.publishPaused.short') : undefined}
              onClick={() => void bulk('publish', selected)}
            >
              {t('seller.products.publish')}
            </Button>
            <Button size="sm" variant="ghost" leftIcon={<Archive className="size-4" />} onClick={() => setConfirmArchive(selected)}>
              {t('seller.products.archive')}
            </Button>
          </div>
        )}
      </div>

      {list.error ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : list.isLoading ? (
        <div className="grid gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Package />}
            title={dq || status ? t('seller.products.noMatch') : t('seller.products.emptyTitle')}
            description={dq || status ? undefined : t('seller.products.emptyBody')}
            action={
              manage && !dq && !status ? (
                <Button to="/seller/products/new" leftIcon={<Plus className="size-4" />}>
                  {t('seller.products.add')}
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {manage && (
            <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
              <Checkbox checked={allOn} onChange={() => setSelected(allOn ? [] : items.map((p) => p.id))} label={t('seller.common.selectAll')} />
            </div>
          )}
          <ul className="divide-y divide-border">
            {items.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                {manage && <Checkbox checked={selected.includes(p.id)} onChange={() => toggle(p.id)} aria-label={p.title} />}
                <div className="size-14 shrink-0 overflow-hidden rounded-md bg-surface-2">
                  {p.images[0] && <img src={p.images[0].url} alt="" className="size-full object-cover" loading="lazy" />}
                </div>
                <div className="min-w-0 flex-1">
                  <Link to={`/seller/products/${p.id}`} className="line-clamp-1 text-sm font-semibold text-fg hover:text-primary-700">
                    {p.title}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
                    <Badge tone={PRODUCT_TONES[p.status]} size="sm">
                      {t(`seller.productStatus.${p.status}`)}
                    </Badge>
                    <span dir="ltr">{p.priceMin === p.priceMax ? money(p.priceMin) : `${money(p.priceMin)} – ${money(p.priceMax)}`}</span>
                    <span className={p.totalStock <= 5 ? 'font-semibold text-danger' : undefined}>
                      {t('seller.products.stockN', { count: p.totalStock })}
                    </span>
                    <span className="hidden sm:inline">
                      {t('seller.products.variantsN', {
                        count: p.variants.length,
                      })}
                    </span>
                    <span className="hidden sm:inline">{t('seller.products.soldN', { count: p.soldCount })}</span>
                  </div>
                </div>
                {manage && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <IconButton label={t('common.moreActions')} variant="ghost" size="sm">
                        <MoreHorizontal className="size-4" />
                      </IconButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem asChild>
                        <Link to={`/seller/products/${p.id}`}>
                          <Pencil className="size-4" /> {t('seller.common.edit')}
                        </Link>
                      </DropdownMenuItem>
                      {(p.status === 'draft' || p.status === 'rejected' || p.status === 'archived') && (
                        <DropdownMenuItem disabled={publishPaused} onSelect={() => void bulk('publish', [p.id])}>
                          <Send className="size-4" /> {t('seller.products.publish')}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onSelect={() => void duplicate(p)}>
                        <Copy className="size-4" /> {t('seller.products.duplicate')}
                      </DropdownMenuItem>
                      {p.status !== 'archived' && (
                        <DropdownMenuItem onSelect={() => setConfirmArchive([p.id])}>
                          <Archive className="size-4" /> {t('seller.products.archive')}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </li>
            ))}
          </ul>
          <LoadMore hasMore={!!list.hasNextPage} loading={list.isFetchingNextPage} onLoadMore={() => void list.fetchNextPage()} />
        </Card>
      )}

      <Modal
        open={!!confirmArchive}
        onOpenChange={(o) => !o && setConfirmArchive(null)}
        title={t('seller.products.archiveTitle', {
          count: confirmArchive?.length ?? 0,
        })}
        description={t('seller.products.archiveBody')}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmArchive(null)}>
              {t('seller.common.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={bulkMut.isPending}
              onClick={() => {
                const ids = confirmArchive ?? [];
                setConfirmArchive(null);
                void bulk('archive', ids);
              }}
            >
              {t('seller.products.archive')}
            </Button>
          </>
        }
      />
    </>
  );
}

import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Boxes, History, Search, SlidersHorizontal } from 'lucide-react';
import { PERMISSIONS, type InventoryRow } from '@souqly/shared';
import { useInventory } from '@/api/seller';
import { Seo } from '@/components/layout/Seo';
import { Badge, Button, Card, EmptyState, ErrorState, IconButton, Input, LoadMore, SectionHeader, Skeleton, Switch } from '@/components/ui';
import { AdjustStockDialog } from '@/components/seller/inventory/AdjustStockDialog';
import { MovementsSheet } from '@/components/seller/inventory/MovementsSheet';
import { WarehousesCard } from '@/components/seller/inventory/WarehousesCard';
import { useCan } from '@/components/seller/usePermissions';
import { useDebounced } from '@/hooks/useDebounced';

export default function InventoryPage() {
  const { t } = useTranslation();
  const can = useCan();
  const manage = can(PERMISSIONS.STORE_INVENTORY_MANAGE);
  const [sp, setSp] = useSearchParams();
  const low = sp.get('low') === '1';
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 350);
  const list = useInventory({ lowStock: low, q: dq || undefined });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  const [adjusting, setAdjusting] = useState<InventoryRow | null>(null);
  const [history, setHistory] = useState<InventoryRow | null>(null);

  return (
    <>
      <Seo title={t('seller.nav.inventory')} noindex />
      <SectionHeader as="h1" title={t('seller.nav.inventory')} description={t('seller.inventory.subtitle')} />
      <div className="grid gap-5">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
            <div className="w-full sm:w-80">
              <Input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('seller.inventory.search')}
                aria-label={t('seller.inventory.search')}
                startIcon={<Search className="size-4" />}
              />
            </div>
            <Switch
              checked={low}
              onCheckedChange={(v) => {
                const n = new URLSearchParams(sp);
                if (v) n.set('low', '1');
                else n.delete('low');
                setSp(n, { replace: true });
              }}
              label={t('seller.inventory.lowOnly')}
            />
          </div>
          {list.error ? (
            <ErrorState error={list.error} onRetry={() => void list.refetch()} />
          ) : list.isLoading ? (
            <div className="grid gap-2 p-4">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : !rows.length ? (
            <EmptyState
              icon={<Boxes />}
              title={low ? t('seller.inventory.noLow') : dq ? t('seller.products.noMatch') : t('seller.inventory.empty')}
              action={
                !low && !dq ? (
                  <Button to="/seller/products/new" size="sm">
                    {t('seller.products.add')}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <ul className="divide-y divide-border sm:hidden">
                {rows.map((r) => (
                  <li key={`m-${r.productId}_${r.variantId}`} className="flex items-center gap-3 px-4 py-3">
                    <div className="size-12 shrink-0 overflow-hidden rounded bg-surface-2">
                      {r.image && <img src={r.image} alt="" className="size-full object-cover" loading="lazy" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link to={`/seller/products/${r.productId}`} className="line-clamp-1 text-sm font-semibold text-fg">
                        {r.title}
                      </Link>
                      <p className="truncate text-xs text-fg-muted">{[Object.values(r.options).join(' / '), r.sku].filter(Boolean).join(' · ')}</p>
                      <p className="mt-0.5 text-xs">
                        <span className={r.lowStock ? 'font-bold text-danger' : 'font-semibold text-fg'}>
                          {t('seller.inventory.availableN', { n: r.available })}
                        </span>
                        <span className="text-fg-muted"> · {t('seller.inventory.reservedN', { n: r.reserved })}</span>
                      </p>
                    </div>
                    <IconButton label={t('seller.inventory.history')} size="sm" variant="ghost" onClick={() => setHistory(r)}>
                      <History className="size-4" />
                    </IconButton>
                    {manage && (
                      <IconButton label={t('seller.inventory.adjust')} size="sm" variant="outline" onClick={() => setAdjusting(r)}>
                        <SlidersHorizontal className="size-4" />
                      </IconButton>
                    )}
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-surface-2 text-xs text-fg-muted">
                    <tr>
                      <th className="px-4 py-2 text-start font-semibold">{t('seller.inventory.product')}</th>
                      <th className="px-3 py-2 text-start font-semibold">{t('seller.editor.cols.sku')}</th>
                      <th className="px-3 py-2 text-end font-semibold">{t('seller.inventory.stock')}</th>
                      <th className="px-3 py-2 text-end font-semibold">{t('seller.inventory.reserved')}</th>
                      <th className="px-3 py-2 text-end font-semibold">{t('seller.inventory.available')}</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((r) => (
                      <tr key={`${r.productId}_${r.variantId}`}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-3">
                            <div className="size-10 shrink-0 overflow-hidden rounded bg-surface-2">
                              {r.image && <img src={r.image} alt="" className="size-full object-cover" loading="lazy" />}
                            </div>
                            <div className="min-w-0">
                              <Link to={`/seller/products/${r.productId}`} className="line-clamp-1 font-semibold text-fg hover:text-primary-700">
                                {r.title}
                              </Link>
                              {Object.keys(r.options).length > 0 && <p className="text-xs text-fg-muted">{Object.values(r.options).join(' / ')}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-fg-muted" dir="ltr">
                          {r.sku}
                        </td>
                        <td className="px-3 py-2.5 text-end font-semibold text-fg">{r.stock}</td>
                        <td className="px-3 py-2.5 text-end text-fg-muted">{r.reserved}</td>
                        <td className="px-3 py-2.5 text-end">
                          {r.lowStock ? (
                            <Badge tone="danger" size="sm">
                              <AlertTriangle className="size-3" /> {r.available}
                            </Badge>
                          ) : (
                            <span className="font-semibold text-fg">{r.available}</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex justify-end gap-1">
                            <IconButton label={t('seller.inventory.history')} size="sm" variant="ghost" onClick={() => setHistory(r)}>
                              <History className="size-4" />
                            </IconButton>
                            {manage && (
                              <Button size="sm" variant="outline" leftIcon={<SlidersHorizontal className="size-4" />} onClick={() => setAdjusting(r)}>
                                {t('seller.inventory.adjust')}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <LoadMore hasMore={!!list.hasNextPage} loading={list.isFetchingNextPage} onLoadMore={() => void list.fetchNextPage()} />
            </>
          )}
        </Card>
        <WarehousesCard canManage={manage} />
      </div>
      <AdjustStockDialog row={adjusting} onClose={() => setAdjusting(null)} />
      <MovementsSheet row={history} onClose={() => setHistory(null)} />
    </>
  );
}

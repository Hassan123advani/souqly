import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertTriangle, Minus, Plus, Receipt, RefreshCw, ScanBarcode, ShoppingCart, Trash2, Wifi, WifiOff } from 'lucide-react';
import { PERMISSIONS, posSaleSchema } from '@souqly/shared';
import { useSellerStore } from '@/api/seller';
import { isPlanLimit, StorePermGate, UpgradeCard, usePlanFeature } from '@/components/seller/growth/gates';
import { firstIssue, rupeesToMinor } from '@/components/seller/growth/utils';
import { useActiveStoreId } from '@/components/seller/useActiveStore';
import { cartTotals, optionText, type CartLine, type Payment } from '@/components/seller/pos/cart';
import { PaymentDialog } from '@/components/seller/pos/PaymentDialog';
import { newClientId, type LocalReceipt, type QueuedSale } from '@/components/seller/pos/posDb';
import { ReceiptDialog } from '@/components/seller/pos/ReceiptDialog';
import { ShiftBar, useCurrentShift } from '@/components/seller/pos/ShiftBar';
import { usePosEngine, type PosEngine } from '@/components/seller/pos/usePosEngine';
import { Seo } from '@/components/layout/Seo';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, IconButton, Input, PageSpinner, SectionHeader, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import type { PosCatalogRow } from '@/api/growth';
import { useLang } from '@/lib/catalog';
import { cn } from '@/lib/cn';
import { formatDateTime, formatRelative, money } from '@/lib/format';

export default function PosPage() {
  const { t } = useTranslation();
  return (
    <>
      <Seo title={t('growth.pos.title')} noindex />
      <StorePermGate perm={PERMISSIONS.STORE_POS_USE}>
        <PosGate />
      </StorePermGate>
    </>
  );
}

function PosGate() {
  const { t } = useTranslation();
  const allowed = usePlanFeature('pos');
  if (allowed === undefined) return <PageSpinner />;
  if (!allowed) {
    return (
      <>
        <SectionHeader as="h1" title={t('growth.pos.title')} description={t('growth.pos.subtitle')} />
        <UpgradeCard feature="pos" />
      </>
    );
  }
  return <PosTerminal />;
}

function PosTerminal() {
  const { t } = useTranslation();
  const lang = useLang();
  const storeId = useActiveStoreId();
  const engine = usePosEngine(storeId);
  const { shift } = useCurrentShift(engine);
  const [receipt, setReceipt] = useState<QueuedSale | null>(null);
  const [tab, setTab] = useState<'sell' | 'sales'>('sell');

  if (engine.dbError) {
    return (
      <Card>
        <ErrorState title={t('growth.pos.storageError')} error={engine.dbError} onRetry={() => window.location.reload()} />
      </Card>
    );
  }
  if (isPlanLimit(engine.catalogError)) return <UpgradeCard feature="pos" />;

  return (
    <>
      <SectionHeader
        as="h1"
        title={t('growth.pos.title')}
        description={t('growth.pos.subtitle')}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={engine.online ? 'success' : 'warning'}>
              {engine.online ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
              {engine.online ? t('growth.pos.online') : t('growth.pos.offline')}
            </Badge>
            {engine.pendingCount > 0 && <Badge tone="info">{t('growth.pos.pendingN', { count: engine.pendingCount })}</Badge>}
            {engine.errorCount > 0 && <Badge tone="danger">{t('growth.pos.failedN', { count: engine.errorCount })}</Badge>}
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<RefreshCw className={cn('size-4', (engine.isSyncing || engine.refreshing) && 'animate-spin')} />}
              disabled={!engine.online}
              onClick={() => {
                void engine.flush();
                void engine.refreshCatalog();
              }}
            >
              {t('growth.pos.syncNow')}
            </Button>
            <ShiftBar engine={engine} shift={shift} />
          </div>
        }
      />
      {!engine.online && <Alert tone="warning" className="mb-4" title={t('growth.pos.offlineTitle')}>{t('growth.pos.offlineBody')}</Alert>}
      {engine.catalogError && !isPlanLimit(engine.catalogError) && (
        <Alert tone="danger" className="mb-4" title={t('growth.pos.catalogError')} action={<Button size="sm" variant="outline" onClick={() => void engine.refreshCatalog(true)}>{t('common.retry')}</Button>}>
          {engine.lastSync ? t('growth.pos.usingCached', { when: formatRelative(engine.lastSync, lang) }) : null}
        </Alert>
      )}
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'sell' | 'sales')}>
        <TabsList className="max-w-sm">
          <TabsTrigger value="sell" icon={<ShoppingCart className="size-4" />}>
            {t('growth.pos.tabs.sell')}
          </TabsTrigger>
          <TabsTrigger value="sales" icon={<Receipt className="size-4" />}>
            {t('growth.pos.tabs.sales')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="sell">
          {!engine.ready ? <Skeleton className="h-96" /> : <Register engine={engine} shiftId={shift?.id} onSold={setReceipt} />}
        </TabsContent>
        <TabsContent value="sales">
          <SalesList engine={engine} onOpen={setReceipt} />
        </TabsContent>
      </Tabs>
      <ReceiptDialog sale={receipt ? (engine.queue.find((q) => q.clientId === receipt.clientId) ?? receipt) : null} onClose={() => setReceipt(null)} />
    </>
  );
}

function Register({ engine, shiftId, onSold }: { engine: PosEngine; shiftId?: string; onSold: (s: QueuedSale) => void }) {
  const { t } = useTranslation();
  const { data: store } = useSellerStore();
  const scan = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState('');
  const [lines, setLines] = useState<CartLine[]>([]);
  const [cartDisc, setCartDisc] = useState('');
  const [discPct, setDiscPct] = useState(false);
  const [paying, setPaying] = useState(false);
  const [saving, setSaving] = useState(false);

  const totalsBefore = cartTotals(lines, 0);
  const cartDiscount = discPct
    ? Math.round(((totalsBefore.subtotal - totalsBefore.lineDiscounts) * Math.min(100, Number(cartDisc) || 0)) / 100)
    : (rupeesToMinor(cartDisc) ?? 0);
  const totals = cartTotals(lines, cartDiscount);

  const matches = useMemo(() => {
    const q = code.trim().toLowerCase();
    if (q.length < 2) return [];
    const out: PosCatalogRow[] = [];
    for (const r of engine.catalog.values()) {
      if (!r.isActive) continue;
      if (r.title.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q) || r.barcode?.includes(q)) out.push(r);
      if (out.length >= 8) break;
    }
    return out;
  }, [code, engine.catalog]);

  const add = (row: PosCatalogRow) => {
    setLines((ls) => {
      const i = ls.findIndex((l) => l.row.variantId === row.variantId);
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, qty: Math.min(1000, l.qty + 1) } : l));
      return [...ls, { row, qty: 1, discount: 0 }];
    });
    setCode('');
    scan.current?.focus();
  };

  const onScan = async () => {
    const c = code.trim();
    if (!c) return;
    const row = await engine.lookup(c);
    if (row && row.isActive) add(row);
    else if (matches.length === 1) add(matches[0]!);
    else if (!matches.length) toast.error(t('growth.pos.notFound', { code: c }));
  };

  const patch = (i: number, p: Partial<CartLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));

  const pay = async (payments: Payment[], customer?: { phone?: string; name?: string }) => {
    if (!store) return;
    const clientId = newClientId();
    const createdAt = new Date().toISOString();
    const body = {
      clientId,
      createdAt,
      items: lines.map((l) => ({ variantId: l.row.variantId, qty: l.qty, price: l.row.price, discount: Math.min(l.discount, l.row.price * l.qty) })),
      payments,
      discount: cartDiscount,
      ...(customer ? { customer } : {}),
      ...(shiftId ? { shiftId } : {}),
    };
    const parsed = posSaleSchema.safeParse(body);
    if (!parsed.success) return void toast.error(firstIssue(parsed.error));
    const paid = payments.reduce((a, p) => a + p.amount, 0);
    const receipt: LocalReceipt = {
      clientId,
      at: createdAt,
      store: { name: store.name, address: [store.address.line1, store.address.area, store.address.city].filter(Boolean).join(', '), phone: store.contact.phone ?? null },
      items: lines.map((l) => ({ title: l.row.title, options: l.row.options, qty: l.qty, price: l.row.price, discount: l.discount, lineTotal: Math.max(0, l.row.price * l.qty - l.discount) })),
      subtotal: totals.subtotal,
      discount: totals.discount,
      total: totals.total,
      payments,
      change: Math.max(0, paid - totals.total),
      customer: customer ?? null,
    };
    setSaving(true);
    try {
      const item = await engine.enqueue(body, receipt);
      setLines([]);
      setCartDisc('');
      setPaying(false);
      toast.success(engine.online ? t('growth.pos.saleSaved') : t('growth.pos.saleQueued'));
      onSold(item);
    } catch {
      toast.error(t('growth.pos.storageError'));
    } finally {
      setSaving(false);
      scan.current?.focus();
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
      <div className="grid content-start gap-4">
        <Card className="p-4">
          <form
            className="relative"
            onSubmit={(e) => {
              e.preventDefault();
              void onScan();
            }}
          >
            <Input
              ref={scan}
              autoFocus
              inputSize="lg"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t('growth.pos.scanPlaceholder')}
              aria-label={t('growth.pos.scanPlaceholder')}
              startIcon={<ScanBarcode className="size-5" />}
              autoComplete="off"
            />
            {matches.length > 0 && (
              <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-lg border border-border bg-surface shadow-pop" role="listbox" aria-label={t('growth.picker.results')}>
                {matches.map((r) => (
                  <li key={r.variantId}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={false}
                      onClick={() => add(r)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-start hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
                    >
                      <span className="size-9 shrink-0 overflow-hidden rounded bg-surface-2">{r.image && <img src={r.image} alt="" className="size-full object-cover" />}</span>
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-1 text-sm font-semibold text-fg">{r.title}</span>
                        <span className="text-xs text-fg-muted">
                          {[optionText(r.options), r.sku].filter(Boolean).join(' · ')} · {t('growth.pos.stockN', { n: r.stock })}
                        </span>
                      </span>
                      <span className="text-sm font-bold" dir="ltr">
                        {money(r.price)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </form>
          <p className="mt-2 text-xs text-fg-muted">{t('growth.pos.catalogN', { count: engine.catalog.size })}</p>
        </Card>

        <Card className="overflow-hidden">
          {!lines.length ? (
            <EmptyState compact icon={<ShoppingCart />} title={t('growth.pos.emptyCart')} description={t('growth.pos.emptyCartBody')} />
          ) : (
            <ul className="divide-y divide-border">
              {lines.map((l, i) => (
                <li key={l.row.variantId} className="grid gap-2 p-3 sm:grid-cols-[1fr_auto_7rem_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="line-clamp-1 text-sm font-semibold text-fg">{l.row.title}</p>
                    <p className="text-xs text-fg-muted">
                      {[optionText(l.row.options), l.row.sku].filter(Boolean).join(' · ')} · <span dir="ltr">{money(l.row.price)}</span>
                    </p>
                    {l.qty > l.row.stock && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-warning">
                        <AlertTriangle className="size-3" /> {t('growth.pos.overStock', { n: l.row.stock })}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <IconButton label={t('growth.pos.less')} size="sm" variant="outline" onClick={() => (l.qty > 1 ? patch(i, { qty: l.qty - 1 }) : setLines((ls) => ls.filter((_, j) => j !== i)))}>
                      <Minus className="size-4" />
                    </IconButton>
                    <Input
                      aria-label={t('growth.pos.qty')}
                      inputMode="numeric"
                      dir="ltr"
                      className="h-9 w-14 text-center"
                      value={l.qty}
                      onChange={(e) => patch(i, { qty: Math.max(1, Math.min(1000, Number(e.target.value.replace(/\D/g, '')) || 1)) })}
                    />
                    <IconButton label={t('growth.pos.more')} size="sm" variant="outline" onClick={() => patch(i, { qty: Math.min(1000, l.qty + 1) })}>
                      <Plus className="size-4" />
                    </IconButton>
                  </div>
                  <Input
                    aria-label={t('growth.pos.lineDiscount')}
                    placeholder={t('growth.pos.lineDiscount')}
                    inputMode="decimal"
                    dir="ltr"
                    className="h-9"
                    defaultValue={l.discount ? String(l.discount / 100) : ''}
                    onBlur={(e) => patch(i, { discount: Math.min(rupeesToMinor(e.target.value) ?? 0, l.row.price * l.qty) })}
                  />
                  <div className="flex items-center justify-between gap-2 sm:justify-end">
                    <span className="font-bold text-fg" dir="ltr">
                      {money(Math.max(0, l.row.price * l.qty - l.discount))}
                    </span>
                    <IconButton label={t('seller.common.remove')} size="sm" variant="ghost" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                      <Trash2 className="size-4" />
                    </IconButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="grid content-start gap-4 p-4 lg:sticky lg:top-20 lg:self-start">
        <div>
          <p className="mb-1.5 text-sm font-semibold text-fg">{t('growth.pos.cartDiscount')}</p>
          <div className="flex gap-2">
            <Input inputMode="decimal" dir="ltr" value={cartDisc} onChange={(e) => setCartDisc(e.target.value)} aria-label={t('growth.pos.cartDiscount')} />
            <div className="inline-flex shrink-0 rounded-md border border-border p-0.5" role="group">
              {[false, true].map((pct) => (
                <button
                  key={String(pct)}
                  type="button"
                  aria-pressed={discPct === pct}
                  onClick={() => setDiscPct(pct)}
                  className={cn('h-9 rounded px-3 text-xs font-semibold', discPct === pct ? 'bg-surface-2 text-fg' : 'text-fg-muted')}
                >
                  {pct ? '%' : 'Rs'}
                </button>
              ))}
            </div>
          </div>
        </div>
        <dl className="grid gap-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-fg-muted">{t('growth.pos.itemsN', { count: totals.units })}</dt>
            <dd dir="ltr">{money(totals.subtotal)}</dd>
          </div>
          {totals.discount > 0 && (
            <div className="flex justify-between text-sale">
              <dt>{t('growth.pos.discount')}</dt>
              <dd dir="ltr">-{money(totals.discount)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-border pt-2 text-lg font-extrabold text-fg">
            <dt>{t('growth.pos.total')}</dt>
            <dd dir="ltr">{money(totals.total)}</dd>
          </div>
        </dl>
        {!shiftId && <p className="text-xs text-fg-muted">{t('growth.pos.noShift')}</p>}
        <Button size="lg" block disabled={!lines.length} onClick={() => setPaying(true)}>
          {t('growth.pos.charge', { amount: money(totals.total) })}
        </Button>
        {lines.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setLines([])}>
            {t('growth.pos.clear')}
          </Button>
        )}
      </Card>
      <PaymentDialog open={paying} total={totals.total} busy={saving} onClose={() => setPaying(false)} onPay={(p, c) => void pay(p, c)} />
    </div>
  );
}

function SalesList({ engine, onOpen }: { engine: PosEngine; onOpen: (s: QueuedSale) => void }) {
  const { t } = useTranslation();
  const lang = useLang();
  if (!engine.ready) return <Skeleton className="h-64" />;
  if (!engine.queue.length) {
    return (
      <Card>
        <EmptyState icon={<Receipt />} title={t('growth.pos.noSales')} description={t('growth.pos.noSalesBody')} />
      </Card>
    );
  }
  const tone = { pending: 'info', synced: 'success', error: 'danger' } as const;
  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-border">
        {engine.queue.map((s) => (
          <li key={s.clientId} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-fg" dir="ltr">
                {s.result?.number ?? s.clientId.slice(0, 8).toUpperCase()}
              </p>
              <p className="text-xs text-fg-muted">
                {formatDateTime(s.createdAt, lang)} · {t('growth.pos.itemsN', { count: s.receipt.items.reduce((a, i) => a + i.qty, 0) })}
              </p>
              {s.status === 'error' && <p className="text-xs text-danger">{s.result?.error?.message || s.result?.error?.code}</p>}
            </div>
            <span className="font-bold" dir="ltr">
              {money(s.receipt.total)}
            </span>
            <Badge tone={tone[s.status]} size="sm">
              {t(`growth.pos.status.${s.status}`)}
            </Badge>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={() => onOpen(s)}>
                {t('growth.pos.receipt.view')}
              </Button>
              {s.status === 'error' && (
                <>
                  <Button size="sm" variant="ghost" disabled={!engine.online} onClick={() => void engine.retry(s.clientId)}>
                    {t('common.retry')}
                  </Button>
                  <IconButton label={t('growth.pos.discard')} size="sm" variant="ghost" onClick={() => void engine.discard(s.clientId)}>
                    <Trash2 className="size-4" />
                  </IconButton>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

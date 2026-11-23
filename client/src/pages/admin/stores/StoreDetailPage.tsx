import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Ban, CheckCircle2, Crown, ExternalLink, Eye, Lock, PlayCircle, XCircle } from 'lucide-react';
import { PERMISSIONS, STORE_PLANS } from '@souqly/shared';
import { useAdminGet, useAdminList, useAdminMutation, type AdminOrderRow, type AdminProductRow, type AdminStoreDetail } from '@/api/admin';
import { getErrorMessage } from '@/api/client';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { PageHeader } from '@/components/admin/PageHeader';
import { StatusPill } from '@/components/admin/StatusPill';
import { useAdminCan } from '@/components/admin/useAdminCan';
import { Alert, Avatar, Badge, Button, Card, CardHeader, ErrorState, Input, Select, Skeleton, Switch, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import { useLang } from '@/lib/catalog';
import { formatDate, money } from '@/lib/format';

type Action = 'approve' | 'reject' | 'suspend' | 'unsuspend';

/** Flattens the masked KYC objects into label/value rows. */
function flat(obj: unknown, prefix = ''): [string, string][] {
  if (!obj || typeof obj !== 'object') return [];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    v && typeof v === 'object' && !Array.isArray(v) ? flat(v, `${prefix}${k}.`) : [[`${prefix}${k}`, Array.isArray(v) ? v.join(', ') : String(v ?? '—')] as [string, string]],
  );
}

export default function StoreDetailPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const lang = useLang();
  const can = useAdminCan();
  const manage = can(PERMISSIONS.ADMIN_STORES_MANAGE);
  const q = useAdminGet<AdminStoreDetail>(`stores/${id}`);
  const [reveal, setReveal] = useState(false);
  const biz = useAdminGet<{ business: unknown; payout: unknown; pickupAddress: unknown }>(`stores/${id}/business`, undefined, { enabled: reveal });
  const products = useAdminList<AdminProductRow>('products', { storeId: id }, { enabled: can(PERMISSIONS.ADMIN_PRODUCTS_MODERATE), limit: 10 });
  const orders = useAdminList<AdminOrderRow>('orders', { storeId: id }, { enabled: can(PERMISSIONS.ADMIN_ORDERS_VIEW), limit: 10 });
  const post = useAdminMutation('post', ['stores', 'mall-requests']);
  const patch = useAdminMutation('patch', ['stores', 'mall-requests']);
  const put = useAdminMutation('put', ['stores']);
  const [action, setAction] = useState<Action | null>(null);
  const [commission, setCommission] = useState<string | null>(null);
  const s = q.data;

  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!s)
    return (
      <div className="grid gap-4">
        <Skeleton className="h-16 w-1/2" />
        <Skeleton className="h-48" />
      </div>
    );

  const fail = (e: unknown) => toast.error(getErrorMessage(e));
  const ok = (msg: string) => () => (toast.success(msg), setAction(null));
  function confirm(reason: string) {
    if (!action) return;
    const body = action === 'reject' || action === 'suspend' ? { reason } : undefined;
    post.mutate({ path: `stores/${id}/${action}`, body }, { onSuccess: ok(t(`admin.stores.done.${action}`)), onError: fail });
  }
  const specs: Record<Action, { title: string; desc: string; tone: 'danger' | 'primary'; reason?: number }> = {
    approve: { title: t('admin.stores.approveTitle', { name: s.name }), desc: t('admin.stores.approveDesc'), tone: 'primary' },
    reject: { title: t('admin.stores.rejectTitle', { name: s.name }), desc: t('admin.stores.rejectDesc'), tone: 'danger', reason: 5 },
    suspend: { title: t('admin.stores.suspendTitle', { name: s.name }), desc: t('admin.stores.suspendDesc'), tone: 'danger', reason: 3 },
    unsuspend: { title: t('admin.stores.unsuspendTitle', { name: s.name }), desc: t('admin.stores.unsuspendDesc'), tone: 'primary' },
  };
  const spec = action ? specs[action] : null;
  const pct = commission ?? (s.commissionOverrideBps !== null ? String(s.commissionOverrideBps / 100) : '');

  return (
    <>
      <PageHeader
        title={s.name}
        crumbs={[{ label: t('admin.nav.stores'), to: '/admin/stores' }]}
        actions={
          <>
            <Button variant="ghost" size="sm" href={`/store/${s.slug}`} target="_blank" rel="noopener noreferrer" rightIcon={<ExternalLink className="size-3.5" />}>
              {t('admin.stores.viewStore')}
            </Button>
            {manage && s.status === 'pending' && (
              <>
                <Button size="sm" variant="danger" leftIcon={<XCircle className="size-4" />} onClick={() => setAction('reject')}>
                  {t('admin.stores.reject')}
                </Button>
                <Button size="sm" leftIcon={<CheckCircle2 className="size-4" />} onClick={() => setAction('approve')}>
                  {t('admin.stores.approve')}
                </Button>
              </>
            )}
            {manage && s.status === 'approved' && (
              <Button size="sm" variant="danger" leftIcon={<Ban className="size-4" />} onClick={() => setAction('suspend')}>
                {t('admin.stores.suspend')}
              </Button>
            )}
            {manage && s.status === 'suspended' && (
              <Button size="sm" leftIcon={<PlayCircle className="size-4" />} onClick={() => setAction('unsuspend')}>
                {t('admin.stores.unsuspend')}
              </Button>
            )}
          </>
        }
      />

      {s.suspension && (
        <Alert tone="danger" title={t('admin.stores.suspendedSince', { date: formatDate(s.suspension.at, lang) })} className="mb-4">
          {s.suspension.reason}
        </Alert>
      )}
      {s.rejectionReason && s.status === 'rejected' && (
        <Alert tone="warning" title={t('admin.stores.rejectedReason')} className="mb-4">
          {s.rejectionReason}
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <div className="grid content-start gap-4">
          <Card className="p-5">
            <div className="flex items-center gap-3">
              <Avatar src={s.logo} name={s.name} size="lg" />
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 truncate text-lg font-bold text-fg">
                  {s.name}
                  {s.isMall && <Crown className="size-4 text-accent-600" />}
                </p>
                <div className="mt-1 flex gap-1.5">
                  <StatusPill status={s.status} />
                  <Badge size="sm">{t(`admin.plans.${s.plan}`)}</Badge>
                </div>
              </div>
            </div>
            {s.tagline && <p className="mt-3 text-sm text-fg-muted">{s.tagline}</p>}
            <dl className="mt-4 grid gap-2.5 text-sm">
              {s.owner && (
                <div className="flex justify-between gap-2">
                  <dt className="text-fg-muted">{t('admin.stores.owner')}</dt>
                  <dd>
                    <Link to={`/admin/users/${s.owner.id}`} className="font-semibold text-primary-700 hover:underline">
                      {s.owner.name}
                    </Link>
                  </dd>
                </div>
              )}
              {s.contact?.email && <Pair k={t('admin.users.email')} v={s.contact.email} />}
              {s.contact?.phone && <Pair k={t('admin.users.phone')} v={s.contact.phone} />}
              {s.address?.city && <Pair k={t('admin.stores.city')} v={s.address.city} />}
              <Pair k={t('admin.stores.members')} v={String(s.members)} />
              <Pair k={t('admin.stores.created')} v={formatDate(s.createdAt, lang)} />
              {s.approvedAt && <Pair k={t('admin.stores.approvedAt')} v={formatDate(s.approvedAt, lang)} />}
            </dl>
          </Card>

          {manage && (
            <Card className="grid gap-4 p-5">
              <Switch
                checked={s.isMall}
                onCheckedChange={(isMall) => patch.mutate({ path: `stores/${id}/mall`, body: { isMall } }, { onSuccess: () => toast.success(t('admin.common.saved')), onError: fail })}
                label={t('admin.stores.mallBadge')}
                description={s.mallRequested && !s.isMall ? t('admin.stores.mallRequested') : t('admin.stores.mallHint')}
              />
              <div>
                <p className="mb-1.5 text-sm font-semibold text-fg">{t('admin.stores.plan')}</p>
                <Select
                  value={s.plan}
                  onValueChange={(plan) => patch.mutate({ path: `stores/${id}/plan`, body: { plan } }, { onSuccess: () => toast.success(t('admin.common.saved')), onError: fail })}
                  options={STORE_PLANS.map((p) => ({ value: p, label: t(`admin.plans.${p}`) }))}
                />
              </div>
              <div>
                <p className="mb-1.5 text-sm font-semibold text-fg">{t('admin.stores.commission')}</p>
                <div className="flex gap-2">
                  <Input type="number" min={0} max={100} step="0.1" value={pct} placeholder={t('admin.stores.commissionDefault')} onChange={(e) => setCommission(e.target.value)} endAdornment={<span className="text-sm text-fg-muted">%</span>} />
                  <Button
                    variant="outline"
                    loading={put.isPending}
                    onClick={() =>
                      put.mutate(
                        { path: `stores/${id}/commission`, body: { bps: pct === '' ? null : Math.round(Number(pct) * 100) } },
                        { onSuccess: () => (toast.success(t('admin.common.saved')), setCommission(null)), onError: fail },
                      )
                    }
                  >
                    {t('admin.common.save')}
                  </Button>
                </div>
                <p className="mt-1 text-xs text-fg-muted">{t('admin.stores.commissionHint')}</p>
              </div>
            </Card>
          )}

          {s.hasBusinessInfo && (
            <Card className="p-5">
              <p className="flex items-center gap-2 text-sm font-bold text-fg">
                <Lock className="size-4 text-fg-muted" />
                {t('admin.stores.business')}
              </p>
              {!reveal ? (
                <>
                  <p className="mt-1 text-xs text-fg-muted">{t('admin.stores.businessAudited')}</p>
                  <Button className="mt-3" variant="outline" size="sm" leftIcon={<Eye className="size-4" />} onClick={() => setReveal(true)}>
                    {t('admin.stores.showMasked')}
                  </Button>
                </>
              ) : biz.error ? (
                <ErrorState compact error={biz.error} />
              ) : !biz.data ? (
                <Skeleton className="mt-3 h-24" />
              ) : (
                <dl className="mt-3 grid gap-2 text-sm">
                  {[...flat(biz.data.business), ...flat(biz.data.payout, 'payout.')].map(([k, v]) => (
                    <Pair key={k} k={k} v={v} mono />
                  ))}
                </dl>
              )}
            </Card>
          )}
        </div>

        <div className="grid content-start gap-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label={t('admin.stores.gmv')} value={money(s.stats.gmv)} />
            <Stat label={t('admin.dash.orders')} value={String(s.stats.orders)} />
            <Stat label={t('admin.stores.rating')} value={s.ratingAvg ? s.ratingAvg.toFixed(1) : '—'} />
            <Stat label={t('admin.stores.followers')} value={String(s.followerCount)} />
          </div>
          <Card>
            <Tabs defaultValue={can(PERMISSIONS.ADMIN_PRODUCTS_MODERATE) ? 'products' : 'orders'}>
              <div className="border-b border-border px-4 pt-3">
                <TabsList>
                  {can(PERMISSIONS.ADMIN_PRODUCTS_MODERATE) && <TabsTrigger value="products">{t('admin.stores.products')}</TabsTrigger>}
                  {can(PERMISSIONS.ADMIN_ORDERS_VIEW) && <TabsTrigger value="orders">{t('admin.dash.orders')}</TabsTrigger>}
                </TabsList>
              </div>
              <TabsContent value="products">
                <MiniList
                  loading={products.isLoading}
                  empty={t('admin.stores.noProducts')}
                  rows={(products.data?.pages[0]?.data ?? []).map((p) => ({ id: p.id, title: p.title, image: p.image, status: p.status, right: money(p.priceMin), to: `/admin/products?status=${p.status}` }))}
                />
              </TabsContent>
              <TabsContent value="orders">
                <MiniList
                  loading={orders.isLoading}
                  empty={t('admin.users.noOrders')}
                  rows={(orders.data?.pages[0]?.data ?? []).map((o) => ({ id: o.id, title: o.number, status: o.status, right: money(o.total), to: `/admin/orders/${o.id}`, sub: formatDate(o.createdAt, lang) }))}
                />
              </TabsContent>
            </Tabs>
          </Card>
          {s.description && (
            <Card>
              <CardHeader title={t('admin.stores.about')} />
              <p className="whitespace-pre-line p-5 text-sm text-fg-muted">{s.description}</p>
            </Card>
          )}
        </div>
      </div>

      {spec && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setAction(null)}
          title={spec.title}
          description={spec.desc}
          confirmLabel={t(`admin.stores.${action}`)}
          tone={spec.tone}
          reasonLabel={spec.reason ? t('admin.common.reason') : undefined}
          reasonRequired={!!spec.reason}
          reasonMin={spec.reason}
          loading={post.isPending}
          onConfirm={confirm}
        />
      )}
    </>
  );
}

function Pair({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-fg-muted">{k}</dt>
      <dd className={mono ? 'latin truncate font-mono text-xs text-fg' : 'truncate font-medium text-fg'} dir="ltr">
        {v}
      </dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{label}</p>
      <p className="mt-1 truncate text-xl font-extrabold text-fg" dir="ltr">
        {value}
      </p>
    </Card>
  );
}

function MiniList({ rows, loading, empty }: { loading: boolean; empty: string; rows: { id: string; title: string; image?: string | null; status: string; right: string; to: string; sub?: string }[] }) {
  if (loading) return <div className="grid gap-2 p-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div>;
  if (!rows.length) return <p className="p-6 text-center text-sm text-fg-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-border">
      {rows.map((r) => (
        <li key={r.id}>
          <Link to={r.to} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-surface-2">
            {r.image !== undefined && <span className="size-10 shrink-0 overflow-hidden rounded-md bg-surface-2">{r.image && <img src={r.image} alt="" className="size-full object-cover" loading="lazy" />}</span>}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-fg">{r.title}</span>
              {r.sub && <span className="text-xs text-fg-muted">{r.sub}</span>}
            </span>
            <StatusPill status={r.status} />
            <span className="w-24 text-end font-semibold" dir="ltr">
              {r.right}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

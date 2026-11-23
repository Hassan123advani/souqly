import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Percent, Plus, Trash2 } from 'lucide-react';
import { adminCommissionRuleSchema, PERMISSIONS, type CategoryNode } from '@souqly/shared';
import { useAdminGet, useAdminList, useAdminMutation, type AdminStoreRow, type CommissionRule } from '@/api/admin';
import { useCategoryTree } from '@/api/catalog';
import { getErrorMessage } from '@/api/client';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { DataTable, type Column } from '@/components/admin/DataTable';
import { PageHeader } from '@/components/admin/PageHeader';
import { useAdminCan } from '@/components/admin/useAdminCan';
import { pctToBps } from '@/components/admin/zodForm';
import { Alert, Badge, Button, FormField, IconButton, Input, Modal, Select, Switch } from '@/components/ui';
import { useDebounced } from '@/hooks/useDebounced';
import { useLocalized } from '@/lib/catalog';

function flatten(nodes: CategoryNode[], depth = 0): { id: string; label: string; name: CategoryNode['name'] }[] {
  return nodes.flatMap((n) => [{ id: n.id, label: `${'— '.repeat(depth)}`, name: n.name }, ...flatten(n.children ?? [], depth + 1)]);
}

export default function CommissionPage() {
  const { t } = useTranslation();
  const loc = useLocalized();
  const can = useAdminCan();
  const manage = can(PERMISSIONS.ADMIN_FINANCE_MANAGE);
  const q = useAdminGet<CommissionRule[]>('commission-rules');
  const tree = useCategoryTree();
  const cats = useMemo(() => flatten(tree.data ?? []), [tree.data]);
  const patch = useAdminMutation('patch', ['commission-rules']);
  const del = useAdminMutation('delete', ['commission-rules']);
  const [creating, setCreating] = useState(false);
  const [remove, setRemove] = useState<CommissionRule | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const fail = (e: unknown) => toast.error(getErrorMessage(e));
  const catName = (id: string | null) => {
    const c = cats.find((x) => x.id === id);
    return c ? loc(c.name) : `#${id?.slice(-6)}`;
  };

  const columns: Column<CommissionRule>[] = [
    { key: 'scope', header: t('admin.finance.scope'), cell: (r) => <Badge tone={r.scope === 'global' ? 'primary' : r.scope === 'category' ? 'info' : 'accent'} size="sm">{t(`admin.finance.scopes.${r.scope}`)}</Badge> },
    {
      key: 'target',
      header: t('admin.finance.target'),
      cell: (r) =>
        r.scope === 'global' ? (
          <span className="text-fg-muted">{t('admin.finance.allSales')}</span>
        ) : r.scope === 'category' ? (
          catName(r.categoryId)
        ) : (
          <Link to={`/admin/stores/${r.storeId}`} className="font-semibold text-primary-700 hover:underline">
            {t('admin.finance.storeN', { id: r.storeId?.slice(-6) })}
          </Link>
        ),
    },
    {
      key: 'rate',
      header: t('admin.finance.rate'),
      cell: (r) =>
        manage ? (
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              min={0}
              max={100}
              step="0.1"
              className="h-9 w-24"
              value={edits[r.id] ?? String(r.bps / 100)}
              onChange={(e) => setEdits((x) => ({ ...x, [r.id]: e.target.value }))}
              endAdornment={<span className="text-xs text-fg-muted">%</span>}
              aria-label={t('admin.finance.rate')}
            />
            {edits[r.id] !== undefined && edits[r.id] !== String(r.bps / 100) && (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  patch.mutate(
                    { path: `commission-rules/${r.id}`, body: { bps: pctToBps(edits[r.id]) ?? 0 } },
                    { onSuccess: () => (toast.success(t('admin.common.saved')), setEdits(({ [r.id]: _, ...rest }) => rest)), onError: fail },
                  )
                }
              >
                {t('admin.common.save')}
              </Button>
            )}
          </div>
        ) : (
          <span className="font-semibold">{(r.bps / 100).toFixed(1)}%</span>
        ),
    },
    {
      key: 'active',
      header: t('admin.finance.active'),
      cell: (r) => <Switch checked={r.isActive} disabled={!manage} onCheckedChange={(isActive) => patch.mutate({ path: `commission-rules/${r.id}`, body: { isActive } }, { onError: fail })} label={<span className="sr-only">{t('admin.finance.active')}</span>} />,
    },
    {
      key: 'a',
      header: '',
      align: 'end',
      cell: (r) =>
        manage && (
          <IconButton size="sm" variant="ghost" label={t('common.delete')} onClick={() => setRemove(r)}>
            <Trash2 className="size-4" />
          </IconButton>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t('admin.nav.commission')}
        description={t('admin.finance.commissionSub')}
        crumbs={[{ label: t('admin.nav.finance') }]}
        actions={
          manage && (
            <Button size="sm" leftIcon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              {t('admin.finance.newRule')}
            </Button>
          )
        }
      />
      <Alert tone="info" className="mb-4">
        {t('admin.finance.precedence')}
      </Alert>
      <DataTable rows={q.data ?? []} columns={columns} rowKey={(r) => r.id} isLoading={q.isLoading} error={q.error} onRetry={() => void q.refetch()} empty={{ title: t('admin.finance.noRules'), icon: <Percent /> }} />
      {creating && <RuleForm cats={cats} onClose={() => setCreating(false)} />}
      {remove && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setRemove(null)}
          title={t('admin.finance.deleteRule')}
          confirmLabel={t('common.delete')}
          tone="danger"
          loading={del.isPending}
          onConfirm={() => del.mutate({ path: `commission-rules/${remove.id}` }, { onSuccess: () => (toast.success(t('admin.common.deleted')), setRemove(null)), onError: fail })}
        />
      )}
    </>
  );
}

function RuleForm({ cats, onClose }: { cats: ReturnType<typeof flatten>; onClose: () => void }) {
  const { t } = useTranslation();
  const loc = useLocalized();
  const create = useAdminMutation('post', ['commission-rules']);
  const [scope, setScope] = useState<'global' | 'category' | 'store'>('category');
  const [categoryId, setCategoryId] = useState('');
  const [store, setStore] = useState<AdminStoreRow | null>(null);
  const [storeQ, setStoreQ] = useState('');
  const dq = useDebounced(storeQ.trim(), 300);
  const stores = useAdminList<AdminStoreRow>('stores', { q: dq, status: 'approved' }, { enabled: scope === 'store' && dq.length >= 2, limit: 8 });
  const [pct, setPct] = useState('10');
  const [error, setError] = useState<string | null>(null);

  function save() {
    const parsed = adminCommissionRuleSchema.safeParse({
      scope,
      ...(scope === 'category' ? { categoryId: categoryId || undefined } : {}),
      ...(scope === 'store' ? { storeId: store?.id } : {}),
      bps: pctToBps(pct) ?? 0,
      isActive: true,
    });
    if (!parsed.success) return setError(t('admin.finance.ruleInvalid'));
    create.mutate({ path: 'commission-rules', body: parsed.data }, { onSuccess: () => (toast.success(t('admin.common.saved')), onClose()), onError: (e) => toast.error(getErrorMessage(e)) });
  }

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('admin.finance.newRule')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={create.isPending} onClick={save}>
            {t('admin.common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <FormField label={t('admin.finance.scope')}>
          <Select value={scope} onValueChange={(v) => setScope(v as typeof scope)} options={(['global', 'category', 'store'] as const).map((s) => ({ value: s, label: t(`admin.finance.scopes.${s}`) }))} />
        </FormField>
        {scope === 'category' && (
          <FormField label={t('admin.finance.category')}>
            <Select value={categoryId} onValueChange={setCategoryId} placeholder={t('admin.finance.pickCategory')} options={cats.map((c) => ({ value: c.id, label: `${c.label}${loc(c.name)}` }))} />
          </FormField>
        )}
        {scope === 'store' && (
          <FormField label={t('admin.stores.store')}>
            {store ? (
              <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                <span className="font-semibold">{store.name}</span>
                <Button variant="link" size="sm" onClick={() => setStore(null)}>
                  {t('admin.common.change')}
                </Button>
              </div>
            ) : (
              <div>
                <Input value={storeQ} onChange={(e) => setStoreQ(e.target.value)} placeholder={t('admin.stores.search')} />
                <ul className="mt-1 max-h-48 overflow-y-auto">
                  {(stores.data?.pages[0]?.data ?? []).map((s) => (
                    <li key={s.id}>
                      <button type="button" className="w-full rounded px-2 py-1.5 text-start text-sm hover:bg-surface-2" onClick={() => setStore(s)}>
                        {s.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </FormField>
        )}
        <FormField label={t('admin.finance.rate')}>
          <Input type="number" min={0} max={100} step="0.1" value={pct} onChange={(e) => setPct(e.target.value)} endAdornment={<span className="text-sm text-fg-muted">%</span>} />
        </FormField>
      </div>
    </Modal>
  );
}

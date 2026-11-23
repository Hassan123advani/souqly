import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, FolderTree, ListPlus, MoveRight, Pencil, Plus, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useAdminGet, useAdminMutation, type AdminCategory } from '@/api/admin';
import { getErrorMessage } from '@/api/client';
import { CategoryForm } from '@/components/admin/catalog/CategoryForm';
import { AttributesEditor } from '@/components/admin/catalog/AttributesEditor';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { PageHeader } from '@/components/admin/PageHeader';
import { CategoryIcon } from '@/components/catalog/CategoryIcon';
import { Badge, Button, Card, EmptyState, ErrorState, IconButton, Input, Modal, Select, Skeleton } from '@/components/ui';
import { useLocalized } from '@/lib/catalog';
import { cn } from '@/lib/cn';

type Node = AdminCategory & { children: Node[] };

function buildTree(all: AdminCategory[]): Node[] {
  const map = new Map<string, Node>(all.map((c) => [c.id, { ...c, children: [] }]));
  const roots: Node[] = [];
  for (const n of map.values()) (n.parentId && map.get(n.parentId) ? map.get(n.parentId)!.children : roots).push(n);
  const sort = (xs: Node[]) => (xs.sort((a, b) => a.order - b.order), xs.forEach((x) => sort(x.children)));
  sort(roots);
  return roots;
}

type Dialog = { kind: 'create'; parentId: string | null } | { kind: 'edit' | 'attributes' | 'move' | 'delete'; cat: AdminCategory };

export default function CategoriesPage() {
  const { t } = useTranslation();
  const loc = useLocalized();
  const q = useAdminGet<AdminCategory[]>('categories');
  const post = useAdminMutation('post', ['categories']);
  const del = useAdminMutation('delete', ['categories']);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [filter, setFilter] = useState('');
  const [moveTo, setMoveTo] = useState('');
  const all = q.data ?? [];
  const tree = useMemo(() => buildTree(all), [all]);
  const fail = (e: unknown) => toast.error(getErrorMessage(e));
  const f = filter.trim().toLowerCase();
  const matches = (c: Node): boolean => !f || loc(c.name).toLowerCase().includes(f) || c.slug.includes(f) || c.children.some(matches);

  function reorder(siblings: Node[], idx: number, dir: -1 | 1) {
    const ids = siblings.map((s) => s.id);
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j]!, ids[idx]!];
    post.mutate({ path: 'categories/reorder', body: { parentId: siblings[0]?.parentId ?? null, ids } }, { onError: fail });
  }

  function renderNodes(nodes: Node[], depth: number) {
    return nodes.filter(matches).map((c, i, arr) => {
      const expanded = !!f || open[c.id];
      return (
        <li key={c.id}>
          <div className={cn('group flex items-center gap-2 border-b border-border py-2 pe-3 hover:bg-surface-2/60', !c.isActive && 'opacity-60')} style={{ paddingInlineStart: 12 + depth * 24 }}>
            <button
              type="button"
              className={cn('grid size-6 place-items-center rounded text-fg-muted hover:bg-surface-2', !c.children.length && 'invisible')}
              onClick={() => setOpen((o) => ({ ...o, [c.id]: !o[c.id] }))}
              aria-label={expanded ? t('admin.catalog.collapse') : t('admin.catalog.expand')}
              aria-expanded={expanded}
            >
              {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="flip-rtl size-4" />}
            </button>
            <span className="grid size-8 shrink-0 place-items-center rounded-md" style={{ background: c.color ? `${c.color}22` : undefined, color: c.color ?? undefined }}>
              <CategoryIcon name={c.icon} className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-fg">{loc(c.name)}</p>
              <p className="truncate text-xs text-fg-muted" dir="ltr">
                {c.slug}
              </p>
            </div>
            <div className="hidden items-center gap-1.5 md:flex">
              {!c.isActive && <Badge size="sm">{t('admin.catalog.inactive')}</Badge>}
              {c.commissionBps !== null && <Badge size="sm" tone="accent">{(c.commissionBps / 100).toFixed(1)}%</Badge>}
              {c.attributes.length > 0 && <Badge size="sm" tone="info">{t('admin.catalog.attrCount', { count: c.attributes.length })}</Badge>}
              <span className="w-20 text-end text-xs text-fg-muted">{t('admin.catalog.products', { count: c.productCount })}</span>
            </div>
            <div className="flex items-center opacity-100 sm:opacity-0 sm:transition-opacity sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
              <IconButton size="sm" variant="ghost" label={t('admin.catalog.moveUp')} disabled={i === 0 || !!f} onClick={() => reorder(arr, i, -1)}>
                <ArrowUp className="size-4" />
              </IconButton>
              <IconButton size="sm" variant="ghost" label={t('admin.catalog.moveDown')} disabled={i === arr.length - 1 || !!f} onClick={() => reorder(arr, i, 1)}>
                <ArrowDown className="size-4" />
              </IconButton>
              <IconButton size="sm" variant="ghost" label={t('admin.catalog.addChild')} onClick={() => setDialog({ kind: 'create', parentId: c.id })}>
                <ListPlus className="size-4" />
              </IconButton>
              <IconButton size="sm" variant="ghost" label={t('admin.catalog.attributes')} onClick={() => setDialog({ kind: 'attributes', cat: c })}>
                <SlidersHorizontal className="size-4" />
              </IconButton>
              <IconButton size="sm" variant="ghost" label={t('admin.catalog.move')} onClick={() => (setMoveTo(c.parentId ?? 'root'), setDialog({ kind: 'move', cat: c }))}>
                <MoveRight className="flip-rtl size-4" />
              </IconButton>
              <IconButton size="sm" variant="ghost" label={t('common.edit')} onClick={() => setDialog({ kind: 'edit', cat: c })}>
                <Pencil className="size-4" />
              </IconButton>
              <IconButton size="sm" variant="ghost" label={t('common.delete')} disabled={c.productCount > 0 || c.children.length > 0} onClick={() => setDialog({ kind: 'delete', cat: c })}>
                <Trash2 className="size-4" />
              </IconButton>
            </div>
          </div>
          {expanded && c.children.length > 0 && <ul>{renderNodes(c.children, depth + 1)}</ul>}
        </li>
      );
    });
  }

  // Valid new parents: anything outside the moved category's own subtree.
  const moveOptions =
    dialog?.kind === 'move'
      ? [{ value: 'root', label: t('admin.catalog.topLevel') }, ...all.filter((c) => c.id !== dialog.cat.id && !c.ancestors.includes(dialog.cat.id)).map((c) => ({ value: c.id, label: `${'— '.repeat(c.ancestors.length)}${loc(c.name)}` }))]
      : [];

  return (
    <>
      <PageHeader
        title={t('admin.nav.categories')}
        description={t('admin.catalog.subtitle')}
        crumbs={[{ label: t('admin.nav.catalog') }]}
        actions={
          <Button size="sm" leftIcon={<Plus className="size-4" />} onClick={() => setDialog({ kind: 'create', parentId: null })}>
            {t('admin.catalog.newCategory')}
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-72">
          <Input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t('admin.catalog.filter')} aria-label={t('admin.catalog.filter')} />
        </div>
        <Button variant="ghost" size="sm" onClick={() => setOpen(Object.fromEntries(all.map((c) => [c.id, true])))}>
          {t('admin.catalog.expandAll')}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen({})}>
          {t('admin.catalog.collapseAll')}
        </Button>
      </div>
      <Card className="overflow-hidden">
        {q.error ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : q.isLoading ? (
          <div className="grid gap-2 p-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
        ) : !tree.length ? (
          <EmptyState icon={<FolderTree />} title={t('admin.catalog.empty')} />
        ) : (
          <ul>{renderNodes(tree, 0)}</ul>
        )}
      </Card>

      {(dialog?.kind === 'create' || dialog?.kind === 'edit') && (
        <CategoryForm
          key={dialog.kind === 'edit' ? dialog.cat.id : 'new'}
          category={dialog.kind === 'edit' ? dialog.cat : undefined}
          parentId={dialog.kind === 'create' ? dialog.parentId : undefined}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'attributes' && <AttributesEditor category={dialog.cat} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'move' && (
        <Modal
          open
          onOpenChange={(o) => !o && setDialog(null)}
          title={t('admin.catalog.moveTitle', { name: loc(dialog.cat.name) })}
          description={t('admin.catalog.moveDesc')}
          size="sm"
          footer={
            <>
              <Button variant="ghost" onClick={() => setDialog(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                loading={post.isPending}
                onClick={() =>
                  post.mutate(
                    { path: `categories/${dialog.cat.id}/move`, body: { parentId: moveTo === 'root' ? null : moveTo } },
                    { onSuccess: () => (toast.success(t('admin.catalog.moved')), setDialog(null)), onError: fail },
                  )
                }
              >
                {t('admin.catalog.move')}
              </Button>
            </>
          }
        >
          <Select value={moveTo} onValueChange={setMoveTo} options={moveOptions} />
        </Modal>
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          title={t('admin.catalog.deleteTitle', { name: loc(dialog.cat.name) })}
          description={t('admin.catalog.deleteDesc')}
          confirmLabel={t('common.delete')}
          tone="danger"
          loading={del.isPending}
          onConfirm={() => del.mutate({ path: `categories/${dialog.cat.id}` }, { onSuccess: () => (toast.success(t('admin.catalog.deleted')), setDialog(null)), onError: fail })}
        />
      )}
    </>
  );
}

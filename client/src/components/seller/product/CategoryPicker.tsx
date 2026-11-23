import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { CategoryNode } from '@souqly/shared';
import { useCategoryTree } from '@/api/catalog';
import { ErrorState, Select, Skeleton } from '@/components/ui';
import { useLocalized } from '@/lib/catalog';

/** Path of nodes from a root to `id` (empty when not found). */
export function findPath(tree: CategoryNode[], id: string): CategoryNode[] {
  for (const n of tree) {
    if (n.id === id) return [n];
    const sub = findPath(n.children, id);
    if (sub.length) return [n, ...sub];
  }
  return [];
}

/** Cascading category selects (one per tree level). Any level can be chosen. */
export function CategoryPicker({ value, onChange }: { value: string; onChange: (id: string, slug: string) => void }) {
  const { t } = useTranslation();
  const loc = useLocalized();
  const { data, isLoading, error, refetch } = useCategoryTree();
  const path = useMemo(() => (data ? findPath(data, value) : []), [data, value]);

  if (isLoading) return <Skeleton className="h-11 w-full" />;
  if (error || !data) return <ErrorState compact error={error} onRetry={() => void refetch()} />;

  const levels: CategoryNode[][] = [data];
  for (const n of path) if (n.children.length) levels.push(n.children);

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {levels.map((nodes, depth) => (
        <Select
          key={depth}
          value={path[depth]?.id ?? ''}
          onValueChange={(id) => {
            const n = nodes.find((x) => x.id === id);
            if (n) onChange(n.id, n.slug);
          }}
          placeholder={depth === 0 ? t('seller.editor.categoryPick') : t('seller.editor.subcategoryPick')}
          aria-label={depth === 0 ? t('seller.editor.categoryPick') : t('seller.editor.subcategoryPick')}
          options={nodes.map((n) => ({ value: n.id, label: loc(n.name) }))}
        />
      ))}
    </div>
  );
}

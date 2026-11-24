import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Star, Trash2 } from 'lucide-react';
import { featuredProductsSchema } from '@souqly/shared';
import { getErrorMessage } from '@/api/client';
import { useFeaturedProducts, useSaveFeatured } from '@/api/growth';
import { Button, Card, CardHeader, EmptyState, ErrorState, IconButton, Skeleton } from '@/components/ui';
import { ProductName, ProductSearchAdd } from '../growth/ProductPicker';
import { firstIssue } from '../growth/utils';

const MAX = 12;

/** Pinned products for the store page "featured" section (≤ 12, ordered). */
export function FeaturedTab() {
  const { t } = useTranslation();
  const q = useFeaturedProducts();
  const save = useSaveFeatured();
  const [draft, setDraft] = useState<string[] | null>(null);
  const ids = draft ?? q.data?.productIds ?? [];
  const dirty = draft !== null;

  const move = (i: number, d: -1 | 1) =>
    setDraft(() => {
      const next = [...ids];
      const j = i + d;
      if (j < 0 || j >= next.length) return next;
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });

  const submit = () => {
    const parsed = featuredProductsSchema.safeParse({ productIds: ids });
    if (!parsed.success) return void toast.error(firstIssue(parsed.error));
    save.mutate(ids, {
      onSuccess: () => {
        setDraft(null);
        toast.success(t('seller.common.saved'));
      },
      onError: (e) => toast.error(getErrorMessage(e)),
    });
  };

  return (
    <Card>
      <CardHeader
        title={t('growth.featured.title')}
        description={t('growth.featured.hint', { max: MAX })}
        action={
          <div className="flex gap-2">
            {dirty && (
              <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
                {t('seller.common.cancel')}
              </Button>
            )}
            <Button size="sm" onClick={submit} loading={save.isPending} disabled={!dirty}>
              {t('seller.common.save')}
            </Button>
          </div>
        }
      />
      <div className="grid gap-3 p-4">
        {q.error ? (
          <ErrorState compact error={q.error} onRetry={() => void q.refetch()} />
        ) : q.isLoading ? (
          <Skeleton className="h-32" />
        ) : (
          <>
            <ProductSearchAdd exclude={ids} disabled={ids.length >= MAX} onAdd={(p) => setDraft([...ids, p.id])} />
            {!ids.length ? (
              <EmptyState compact icon={<Star />} title={t('growth.featured.empty')} />
            ) : (
              <ol className="divide-y divide-border rounded-md border border-border">
                {ids.map((id, i) => (
                  <li key={id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className="w-6 text-center font-bold text-fg-muted">{i + 1}</span>
                    <ProductName id={id} className="line-clamp-1 min-w-0 flex-1 text-fg" />
                    <IconButton label={t('growth.featured.up')} size="sm" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)}>
                      <ArrowUp className="size-4" />
                    </IconButton>
                    <IconButton label={t('growth.featured.down')} size="sm" variant="ghost" disabled={i === ids.length - 1} onClick={() => move(i, 1)}>
                      <ArrowDown className="size-4" />
                    </IconButton>
                    <IconButton label={t('seller.common.remove')} size="sm" variant="ghost" onClick={() => setDraft(ids.filter((x) => x !== id))}>
                      <Trash2 className="size-4" />
                    </IconButton>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

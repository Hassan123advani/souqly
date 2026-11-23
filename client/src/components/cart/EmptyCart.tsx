import { useTranslation } from 'react-i18next';
import { ShoppingBag } from 'lucide-react';
import { useJustForYou } from '@/api/catalog';
import { Button, Card, EmptyState } from '@/components/ui';
import { ProductRail } from '@/components/product/Rail';

/** Empty cart with a "Just for you" rail so the page never dead-ends. */
export function EmptyCart() {
  const { t } = useTranslation();
  const feed = useJustForYou();
  const products = feed.data?.pages.flatMap((p) => p.data).slice(0, 12);
  return (
    <div className="space-y-8">
      <Card>
        <EmptyState
          icon={<ShoppingBag />}
          title={t('cart.emptyTitle')}
          description={t('cart.emptyBody')}
          action={<Button to="/">{t('cart.startShopping')}</Button>}
        />
      </Card>
      <ProductRail
        title={t('cart.justForYou')}
        products={products}
        loading={feed.isPending}
        error={feed.error}
        onRetry={() => void feed.refetch()}
      />
    </div>
  );
}

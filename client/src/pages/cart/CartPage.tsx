import { useTranslation } from 'react-i18next';
import { useMe } from '@/api/auth';
import { useServerCart } from '@/api/cart';
import { Card, Container, ErrorState, Skeleton } from '@/components/ui';
import { Seo } from '@/components/layout/Seo';
import { GuestCart } from '@/components/cart/GuestCart';
import { ServerCart } from '@/components/cart/ServerCart';
import { useCart } from '@/stores/cart';

function CartSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]" aria-busy>
      <div className="space-y-4">
        {[0, 1].map((k) => (
          <Card key={k} className="space-y-4 p-5">
            <Skeleton className="h-6 w-48" />
            {[0, 1].map((j) => (
              <div key={j} className="flex gap-4">
                <Skeleton className="size-24 rounded-md" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-8 w-28" />
                </div>
              </div>
            ))}
          </Card>
        ))}
      </div>
      <Card className="h-72 space-y-4 p-5">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-24 w-full" />
      </Card>
    </div>
  );
}

export default function CartPage() {
  const { t } = useTranslation();
  const mode = useCart((s) => s.mode);
  const me = useMe();
  // Signed-in users wait for the session check + guest-cart merge before seeing the server cart.
  const syncing = me.isPending || (!!me.data && mode === 'guest');
  const cart = useServerCart(mode === 'server');
  return (
    <Container className="py-6 sm:py-10">
      <Seo title={t('cart.title')} noindex />
      <h1 className="mb-5 text-2xl font-extrabold tracking-tight text-fg sm:text-3xl">{t('cart.title')}</h1>
      {syncing ? (
        <CartSkeleton />
      ) : mode === 'guest' ? (
        <GuestCart />
      ) : cart.isPending ? (
        <CartSkeleton />
      ) : cart.isError ? (
        <Card>
          <ErrorState error={cart.error} onRetry={() => void cart.refetch()} />
        </Card>
      ) : (
        <ServerCart cart={cart.data} />
      )}
    </Container>
  );
}

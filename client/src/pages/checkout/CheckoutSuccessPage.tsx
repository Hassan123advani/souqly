import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import { Banknote, Check, ChevronRight, Package } from 'lucide-react';
import { useCheckout } from '@/api/cart';
import { Button, Card, Container, ErrorState, Skeleton } from '@/components/ui';
import { Seo } from '@/components/layout/Seo';
import { Confetti } from '@/components/cart/Confetti';
import { StoreLogo } from '@/components/product/StoreCard';
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge';
import { money } from '@/lib/format';

export default function CheckoutSuccessPage() {
  const { t } = useTranslation();
  const { number = '' } = useParams();
  const q = useCheckout(number);
  const reduce = useReducedMotion();
  const c = q.data;

  return (
    <Container className="max-w-2xl py-8 sm:py-14">
      <Seo title={t('checkout.success.title')} noindex />
      {q.isPending ? (
        <Card className="space-y-4 p-8 text-center">
          <Skeleton className="mx-auto size-16 rounded-full" />
          <Skeleton className="mx-auto h-7 w-2/3" />
          <Skeleton className="mx-auto h-4 w-1/2" />
          <Skeleton className="h-24 w-full" />
        </Card>
      ) : q.isError || !c ? (
        <Card>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </Card>
      ) : (
        <div className="space-y-5">
          <Card className="relative overflow-hidden px-6 pb-8 pt-10 text-center">
            <Confetti />
            <motion.div
              initial={reduce ? false : { scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 18 }}
              className="mx-auto grid size-16 place-items-center rounded-full bg-success text-white shadow-pop"
            >
              <Check className="size-8 stroke-[3]" aria-hidden />
            </motion.div>
            <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-fg sm:text-3xl">{t('checkout.success.title')}</h1>
            <p className="mt-2 text-sm text-fg-muted">{t('checkout.success.body', { count: c.orders.length })}</p>
            <p className="mt-4 inline-flex items-center gap-2 rounded-pill bg-surface-2 px-4 py-1.5 text-sm">
              <span className="text-fg-subtle">{t('checkout.success.number')}</span>
              <span className="latin font-bold tracking-wide text-fg" dir="ltr">
                {c.number}
              </span>
            </p>
          </Card>

          {c.paymentMethod === 'cod' && (
            <Card className="flex items-center gap-4 border-accent-100 bg-accent-50 p-5">
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-accent text-accent-fg">
                <Banknote className="size-6" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-accent-800">{t('checkout.success.codTitle')}</p>
                <p className="latin text-2xl font-extrabold tabular text-fg" dir="ltr">
                  {money(c.totals.total)}
                </p>
                {c.orders.length > 1 && <p className="text-xs text-fg-muted">{t('checkout.success.codSplit', { count: c.orders.length })}</p>}
              </div>
            </Card>
          )}

          <Card className="p-2">
            <h2 className="flex items-center gap-2 px-3 pb-1 pt-3 text-sm font-bold text-fg">
              <Package className="size-4 text-primary-700" aria-hidden />
              {t('checkout.success.ordersTitle', { count: c.orders.length })}
            </h2>
            <ul>
              {c.orders.map((o) => (
                <li key={o.id}>
                  <Link
                    to={`/account/orders/${o.number}`}
                    className="flex items-center gap-3 rounded-md px-3 py-3 transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <StoreLogo src={o.store.logo} name={o.store.name} className="size-10 text-sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-fg">{o.store.name}</p>
                      <p className="latin text-xs text-fg-subtle" dir="ltr">
                        {o.number} · {t('orders.itemsN', { count: o.items.reduce((n, i) => n + i.qty, 0) })}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="latin text-sm font-bold tabular text-fg" dir="ltr">
                        {money(o.total)}
                      </span>
                      <OrderStatusBadge status={o.status} />
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-fg-subtle rtl:rotate-180" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button to="/" variant="accent" size="lg" block>
              {t('checkout.success.continue')}
            </Button>
            <Button to="/account/orders" variant="outline" size="lg" block>
              {t('checkout.success.viewOrders')}
            </Button>
          </div>
        </div>
      )}
    </Container>
  );
}

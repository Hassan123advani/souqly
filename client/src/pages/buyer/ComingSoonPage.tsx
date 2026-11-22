import { useTranslation } from 'react-i18next';
import { Heart, MessageCircle, ShoppingCart } from 'lucide-react';
import { Seo } from '@/components/layout/Seo';
import { Button, Container, EmptyState } from '@/components/ui';

const ICONS = {
  cart: ShoppingCart,
  wishlist: Heart,
  chat: MessageCircle,
};

export type ComingFeature = keyof typeof ICONS;

/** A real, friendly page for marketplace areas that arrive in a later release. */
export default function ComingSoonPage({ feature }: { feature: ComingFeature }) {
  const { t } = useTranslation();
  const Icon = ICONS[feature];
  return (
    <Container className="py-10 sm:py-16">
      <Seo title={t(`coming.${feature}.title`)} noindex />
      <div className="mx-auto max-w-xl rounded-xl border border-border bg-surface shadow-card">
        <EmptyState
          icon={<Icon />}
          title={t(`coming.${feature}.title`)}
          description={t(`coming.${feature}.body`)}
          action={
            <>
              <Button to="/">{t('coming.backHome')}</Button>
              <Button to="/sell" variant="outline">
                {t('coming.sellInstead')}
              </Button>
            </>
          }
        />
      </div>
    </Container>
  );
}

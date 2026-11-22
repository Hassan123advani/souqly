import { useTranslation } from 'react-i18next';
import { ArrowRight, BadgeCheck, HandCoins, MessageCircle, RotateCcw, Store } from 'lucide-react';
import { Seo } from '@/components/layout/Seo';
import { Button, Container, ProductCardSkeleton, SectionHeader, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';

// Frosted "product tiles" floating inside the lantern arch.
const tile = 'absolute rounded-lg bg-white/[0.07] p-2.5 shadow-pop ring-1 ring-white/15 backdrop-blur-md';

function HeroArt() {
  // Layered arches framing skeleton "product tiles" — hints at the catalogue to come.
  return (
    <div className="relative mx-auto hidden aspect-[5/4] w-full max-w-md lg:block" aria-hidden>
      <div className="absolute inset-x-10 bottom-0 top-6 rounded-t-[999px] border border-accent/40 bg-gradient-to-b from-accent/15 to-transparent" />
      <div className="absolute inset-x-20 bottom-0 top-16 rounded-t-[999px] border border-accent/30" />
      <div className="absolute start-1/2 top-2 size-3 -translate-x-1/2 rounded-full bg-accent shadow-glow rtl:translate-x-1/2" />
      <div className={cn(tile, 'bottom-6 start-2 w-40 rotate-[-6deg]')}>
        <div className="aspect-square w-full rounded-md bg-gradient-to-br from-accent/30 to-sale/20" />
        <div className="mt-2.5 h-2 w-3/4 rounded-pill bg-white/25" />
        <div className="mt-2 h-3 w-14 rounded-sm bg-sale" />
      </div>
      <div className={cn(tile, 'bottom-14 end-2 w-44 rotate-[5deg]')}>
        <div className="aspect-[4/3] w-full rounded-md bg-gradient-to-br from-primary-400/40 to-primary-200/30" />
        <div className="mt-2.5 h-2 w-2/3 rounded-pill bg-white/25" />
        <div className="mt-2 h-3 w-16 rounded-sm bg-accent" />
      </div>
      <div className={cn(tile, 'start-1/2 top-24 w-36 -translate-x-1/2 rtl:translate-x-1/2')}>
        <div className="aspect-square w-full rounded-md bg-gradient-to-br from-white/25 to-white/5" />
        <div className="mt-2.5 h-2 w-1/2 rounded-pill bg-white/25" />
      </div>
    </div>
  );
}

export default function HomePage() {
  const { t } = useTranslation();
  const trust = [
    { icon: HandCoins, title: t('home.trust.cod'), body: t('home.trust.codBody') },
    { icon: BadgeCheck, title: t('home.trust.verified'), body: t('home.trust.verifiedBody') },
    { icon: RotateCcw, title: t('home.trust.returns'), body: t('home.trust.returnsBody') },
    { icon: MessageCircle, title: t('home.trust.chat'), body: t('home.trust.chatBody') },
  ];

  return (
    <>
      <Seo description={t('home.metaDescription')} />
      <Container className="pt-4 sm:pt-6">
        {/* Hero */}
        <section className="dark relative overflow-hidden rounded-xl bg-[#0B2826] text-fg shadow-pop">
          <div className="absolute inset-0 bg-[radial-gradient(60%_80%_at_85%_0%,rgba(242,169,59,.28),transparent_60%),radial-gradient(70%_90%_at_0%_100%,rgba(14,94,90,.95),transparent_70%)]" />
          <div className="souq-pattern absolute inset-0 opacity-60 [mask-image:linear-gradient(90deg,transparent_20%,#000)]" />
          <div className="relative grid items-center gap-8 px-6 py-10 sm:px-10 sm:py-14 lg:grid-cols-[1.15fr_1fr] lg:px-14 lg:py-16">
            <div className="max-w-xl">
              <p className="inline-flex items-center gap-2 rounded-pill bg-white/5 px-3 py-1 text-xs font-bold text-accent ring-1 ring-white/10">
                <span className="size-1.5 animate-glow rounded-full bg-accent" />
                {t('home.hero.eyebrow')}
              </p>
              <h1 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight text-ink-950 sm:text-5xl">
                {t('home.hero.title')}
              </h1>
              <p className="mt-4 max-w-lg text-base text-fg-muted sm:text-lg">{t('home.hero.body')}</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Button to="/categories" variant="accent" size="lg" rightIcon={<ArrowRight className="flip-rtl size-4" />}>
                  {t('home.hero.ctaShop')}
                </Button>
                <Button
                  to="/sell"
                  variant="outline"
                  size="lg"
                  className="border-white/20 bg-white/5 text-ink-950 hover:bg-white/10"
                  leftIcon={<Store className="size-4" />}
                >
                  {t('home.hero.ctaSell')}
                </Button>
              </div>
            </div>
            <HeroArt />
          </div>
        </section>

        {/* Trust strip */}
        <ul className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {trust.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex items-start gap-3 rounded-lg border border-border bg-surface p-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-t-[1.25rem] rounded-b-md bg-primary-50 text-primary-700">
                <Icon className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-fg">{title}</p>
                <p className="mt-0.5 hidden text-xs text-fg-muted sm:block">{body}</p>
              </div>
            </li>
          ))}
        </ul>

        {/* Categories */}
        <section className="mt-12" aria-busy="true" aria-labelledby="home-cats">
          <SectionHeader
            title={<span id="home-cats">{t('home.categories.title')}</span>}
            eyebrow={t('home.categories.eyebrow')}
          />
          <div className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-4 sm:px-0 md:grid-cols-8">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex w-20 shrink-0 flex-col items-center gap-2 sm:w-auto">
                <Skeleton className="aspect-square w-full rounded-t-[999px] rounded-b-lg" />
                <Skeleton className="h-2.5 w-3/4" />
              </div>
            ))}
          </div>
        </section>

        {/* Deals */}
        <section className="mt-12" aria-busy="true" aria-labelledby="home-deals">
          <div className="rounded-xl border border-sale-100 bg-gradient-to-br from-sale-50 via-surface to-accent-50 p-4 sm:p-6">
            <SectionHeader
              title={<span id="home-deals">{t('home.deals.title')}</span>}
              eyebrow={t('home.deals.eyebrow')}
              description={t('home.deals.body')}
            />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <ProductCardSkeleton key={i} className={i > 3 ? 'hidden lg:block' : i > 1 ? 'hidden sm:block' : ''} />
              ))}
            </div>
          </div>
        </section>

        {/* Shops */}
        <section className="mt-12" aria-busy="true" aria-labelledby="home-shops">
          <SectionHeader
            title={<span id="home-shops">{t('home.shops.title')}</span>}
            eyebrow={t('home.shops.eyebrow')}
            description={t('home.shops.body')}
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-border bg-surface p-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="size-12 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-2/3" />
                    <Skeleton className="h-2.5 w-1/3" />
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <Skeleton className="aspect-square" />
                  <Skeleton className="aspect-square" />
                  <Skeleton className="aspect-square" />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* For you */}
        <section className="mt-12" aria-busy="true" aria-labelledby="home-foryou">
          <SectionHeader title={<span id="home-foryou">{t('home.forYou.title')}</span>} eyebrow={t('home.forYou.eyebrow')} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <ProductCardSkeleton key={i} className={i > 5 ? 'hidden lg:block' : ''} />
            ))}
          </div>
        </section>

        {/* Seller CTA */}
        <section className="mt-14 overflow-hidden rounded-xl border border-border bg-surface">
          <div className="grid items-center gap-6 p-6 sm:p-10 md:grid-cols-[1fr_auto]">
            <div className="flex items-start gap-4">
              <span className="hidden size-14 shrink-0 place-items-center rounded-t-[1.75rem] rounded-b-lg bg-accent-50 text-accent-700 ring-1 ring-accent-100 sm:grid">
                <Store className="size-6" />
              </span>
              <div>
                <h2 className="text-xl font-extrabold tracking-tight text-fg sm:text-2xl">{t('home.sellCta.title')}</h2>
                <p className="mt-1.5 max-w-xl text-sm text-fg-muted">{t('home.sellCta.body')}</p>
              </div>
            </div>
            <Button to="/sell" size="lg" rightIcon={<ArrowRight className="flip-rtl size-4" />}>
              {t('home.sellCta.cta')}
            </Button>
          </div>
        </section>
      </Container>
    </>
  );
}

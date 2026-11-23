import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Check, HandCoins, PackageCheck, ShoppingCart, Sparkles, Truck, Zap } from 'lucide-react';
import type { ProductCard as ProductCardData, ProductDetail } from '@souqly/shared';
import { catalogKeys, useMoreFromStore, useProduct, useRelatedProducts, useStore } from '@/api/catalog';
import { Seo } from '@/components/layout/Seo';
import { Alert, Breadcrumbs, Button, Container, Countdown, Modal, Price, Rating, Skeleton, type Crumb } from '@/components/ui';
import { PageError, breadcrumbLd } from '@/components/catalog/PageStates';
import { Gallery, type Media } from '@/components/pdp/Gallery';
import { QtyStepper, VariantPicker } from '@/components/pdp/VariantPicker';
import { DeliveryEstimate } from '@/components/pdp/DeliveryEstimate';
import { SellerCard } from '@/components/pdp/SellerCard';
import { ShareMenu } from '@/components/pdp/ShareMenu';
import { BoughtTogether } from '@/components/pdp/BoughtTogether';
import { ProductReviews } from '@/components/reviews/ProductReviews';
import { ProductQuestions } from '@/components/qa/ProductQuestions';
import { ReportMenu } from '@/components/social/ReportMenu';
import { AlertToggles } from '@/components/wishlist/AlertToggles';
import { PdpWishlistButton } from '@/components/wishlist/WishlistHeart';
import { MallBadge } from '@/components/product/ProductCard';
import { ProductRail } from '@/components/product/Rail';
import { useAddToCart, unitPrice } from '@/hooks/useAddToCart';
import { cn } from '@/lib/cn';
import { absoluteUrl, compactNumber, useLang, useLocalized } from '@/lib/catalog';
import { formatDate, money } from '@/lib/format';
import { pushRecentlyViewed } from '@/lib/recentlyViewed';
import { choose, findVariant, initialSelection, type Selection } from '@/lib/variants';


function toCard(p: ProductDetail): ProductCardData {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    image: p.images[0]?.url ?? '',
    price: p.priceMin,
    ...(p.compareAtMax ? { compareAtPrice: p.compareAtMax } : {}),
    discountPct: p.discountPct,
    ratingAvg: p.ratingAvg,
    ratingCount: p.ratingCount,
    soldCount: p.soldCount,
    freeShipping: p.freeShipping,
    cod: p.cod,
    isMall: p.store.isMall,
    store: { slug: p.store.slug, name: p.store.name },
    ...(p.flash ? { flash: { price: p.flash.price, endsAt: p.flash.endsAt } } : {}),
  };
}

function plainText(html: string, max = 300): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function productLd(p: ProductDetail, sku: string | undefined, url: string) {
  const availability = p.preOrder?.enabled
    ? 'https://schema.org/PreOrder'
    : p.totalStock > 0 && !p.unavailable
      ? 'https://schema.org/InStock'
      : 'https://schema.org/OutOfStock';
  const major = (m: number) => (m / 100).toFixed(2);
  const price = p.flash?.price ?? p.priceMin;
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.title,
    image: p.images.map((i) => absoluteUrl(i.url)),
    description: plainText(p.description),
    ...(sku ? { sku } : {}),
    ...(p.brand ? { brand: { '@type': 'Brand', name: p.brand.name } } : {}),
    ...(p.category ? { category: p.category.name.en } : {}),
    offers:
      p.priceMin !== p.priceMax && !p.flash
        ? { '@type': 'AggregateOffer', priceCurrency: 'PKR', lowPrice: major(p.priceMin), highPrice: major(p.priceMax), offerCount: p.variants.length, availability, url }
        : {
            '@type': 'Offer',
            priceCurrency: 'PKR',
            price: major(price),
            availability,
            url,
            seller: { '@type': 'Organization', name: p.store.name },
            ...(p.flash ? { priceValidUntil: p.flash.endsAt.slice(0, 10) } : {}),
          },
    ...(p.ratingCount > 0
      ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: p.ratingAvg.toFixed(1), reviewCount: p.ratingCount, bestRating: 5, worstRating: 1 } }
      : {}),
  };
}

function ProductSkeleton() {
  return (
    <Container className="pb-10 pt-4 sm:pt-6" aria-busy>
      <Skeleton className="h-3.5 w-72" />
      <div className="mt-5 grid gap-8 lg:grid-cols-2">
        <Skeleton className="aspect-square w-full rounded-lg" />
        <div className="space-y-4">
          <Skeleton className="h-7 w-4/5" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-24 w-full" />
          <div className="flex gap-3">
            <Skeleton className="h-12 flex-1" />
            <Skeleton className="h-12 flex-1" />
          </div>
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    </Container>
  );
}

function Highlights({ items }: { items: string[] }) {
  const { t } = useTranslation();
  if (!items.length) return null;
  return (
    <div>
      <h3 className="mb-2 text-sm font-bold text-fg">{t('pdp.highlights')}</h3>
      <ul className="space-y-1.5 text-sm text-fg-muted">
        {items.map((h) => (
          <li key={h} className="flex gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            {h}
          </li>
        ))}
      </ul>
    </div>
  );
}

function WholesaleTable({ tiers, qty, base }: { tiers: { minQty: number; price: number }[]; qty: number; base: number }) {
  const { t } = useTranslation();
  const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
  const activeTier = [...sorted].reverse().find((x) => qty >= x.minQty);
  return (
    <div className="rounded-lg border border-accent-200 bg-accent-50/60 p-3">
      <p className="mb-2 inline-flex items-center gap-1.5 text-sm font-bold text-fg">
        <PackageCheck className="size-4 text-accent-700" aria-hidden />
        {t('pdp.wholesale')}
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-start text-xs text-fg-muted">
            <th className="pb-1 text-start font-medium">{t('pdp.minQty')}</th>
            <th className="pb-1 text-start font-medium">{t('pdp.unitPrice')}</th>
            <th className="pb-1 text-end font-medium">{t('pdp.save')}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((tier) => (
            <tr key={tier.minQty} className={cn('border-t border-accent-100', activeTier === tier && 'font-bold text-fg')}>
              <td className="latin py-1.5 tabular">{tier.minQty}+</td>
              <td className="latin py-1.5 tabular" dir="ltr">
                {money(tier.price)}
              </td>
              <td className="latin py-1.5 text-end text-success tabular">{base > tier.price ? `-${Math.round(((base - tier.price) / base) * 100)}%` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ProductPage() {
  const { slug = '' } = useParams();
  const { t } = useTranslation();
  const lang = useLang();
  const localized = useLocalized();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: p, error, isLoading, refetch } = useProduct(slug);
  const storeQuery = useStore(p?.store.slug);
  const related = useRelatedProducts(p ? slug : undefined);
  const moreFromStore = useMoreFromStore(p ? slug : undefined);
  const addToCart = useAddToCart();

  const [selection, setSelection] = useState<Selection>({});
  const [qty, setQty] = useState(1);
  const [sizeGuide, setSizeGuide] = useState(false);

  useEffect(() => {
    if (!p) return;
    setSelection(initialSelection(p));
    setQty(1);
    pushRecentlyViewed(toCard(p));
    void qc.invalidateQueries({ queryKey: catalogKeys.recentlyViewed });
  }, [p?.id]);

  const variant = p ? findVariant(p, selection) : undefined;
  const media: Media[] = useMemo(() => {
    if (!p) return [];
    const vImgs = (variant?.images ?? []).map((url) => ({ kind: 'image' as const, url, alt: p.title }));
    const base = p.images.map((i, n) => ({ kind: 'image' as const, url: i.url, alt: i.alt ?? `${p.title} — ${n + 1}` }));
    const seen = new Set<string>();
    const all: Media[] = [...vImgs, ...base].filter((m) => (seen.has(m.url) ? false : (seen.add(m.url), true)));
    if (p.video) all.push({ kind: 'video', url: p.video.url, alt: t('pdp.video') });
    return all;
  }, [p, variant?.images, t]);

  if (error) return <PageError error={error} onRetry={() => refetch()} />;
  if (isLoading || !p) return <ProductSkeleton />;

  const stock = variant?.stock ?? 0;
  const preOrder = !!p.preOrder?.enabled;
  const purchasable = !!variant && !p.unavailable && (stock > 0 || preOrder);
  const maxQty = preOrder && stock <= 0 ? 99 : stock;
  const pricing = variant ? unitPrice(p, variant) : { price: p.priceMin, compareAt: p.compareAtMax };
  const tierPrice = p.wholesaleTiers?.length
    ? [...p.wholesaleTiers].sort((a, b) => b.minQty - a.minQty).find((x) => qty >= x.minQty)?.price
    : undefined;
  const flashOn = !!p.flash && (!p.flash.variantId || p.flash.variantId === variant?.id) && new Date(p.flash.endsAt).getTime() > Date.now();
  const url = absoluteUrl(`/p/${p.slug}`);

  const crumbs: Crumb[] = [
    { label: t('nav.home'), to: '/' },
    ...p.breadcrumbs.map((b) => ({ label: localized(b.name), to: `/c/${b.slug}` })),
    { label: p.title },
  ];

  const onAdd = () => variant && purchasable && addToCart(p, variant, Math.min(qty, maxQty));
  const onBuy = () => {
    if (!variant || !purchasable) return;
    addToCart(p, variant, Math.min(qty, maxQty), { silent: true });
    navigate('/cart');
  };
  const buyLabel = preOrder ? t('pdp.preOrderNow') : t('pdp.buyNow');

  const discountBadge =
    pricing.compareAt && pricing.compareAt > pricing.price ? Math.round(((pricing.compareAt - pricing.price) / pricing.compareAt) * 100) : 0;
  const badges = (
    <div className="pointer-events-none absolute start-3 top-3 flex flex-col items-start gap-1.5">
      {discountBadge > 0 && (
        <span className="rounded-md bg-sale px-2 py-1 text-xs font-extrabold text-sale-fg shadow-sm tabular" dir="ltr">
          -{discountBadge}%
        </span>
      )}
      {p.store.isMall && <MallBadge size="md" className="shadow-sm" />}
    </div>
  );

  return (
    <Container className="pb-10 pt-4 sm:pt-6">
      <Seo
        title={p.title}
        description={plainText(p.description, 160) || p.highlights.join(' · ')}
        image={p.images[0]?.url}
        type="product"
        canonical={`/p/${p.slug}`}
        jsonLd={[productLd(p, variant?.sku, url), breadcrumbLd(crumbs.slice(0, -1))]}
      />
      <Breadcrumbs items={crumbs} className="hidden text-xs sm:block sm:text-sm [&_li:last-child]:max-w-[40ch] [&_li:last-child_span]:truncate" />

      <div className="mt-0 grid gap-6 sm:mt-5 lg:grid-cols-2 lg:gap-8 xl:grid-cols-[minmax(0,5fr)_minmax(0,4.4fr)_minmax(0,3fr)]">
        {/* Gallery */}
        <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <Gallery media={media} badges={badges} />
        </div>

        {/* Info + buy box */}
        <div className="min-w-0">
          {p.brand && (
            <p className="text-sm text-fg-muted">
              {t('pdp.brand')}{' '}
              {p.brand.slug ? (
                <Link to={`/brand/${p.brand.slug}`} className="font-semibold text-primary-700 hover:underline">
                  {p.brand.name}
                </Link>
              ) : (
                <span className="font-semibold text-fg">{p.brand.name}</span>
              )}
            </p>
          )}
          <h1 className="mt-1 text-xl font-extrabold leading-snug tracking-tight text-fg sm:text-2xl">{p.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-fg-muted">
            {p.ratingCount > 0 ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="latin font-bold text-fg tabular">{p.ratingAvg.toFixed(1)}</span>
                <Rating value={p.ratingAvg} />
                <span>{t('pdp.ratingsN', { n: compactNumber(p.ratingCount) })}</span>
              </span>
            ) : (
              <span>{t('pdp.noRatings')}</span>
            )}
            {p.soldCount > 0 && <span>{t('product.sold', { n: compactNumber(p.soldCount) })}</span>}
            <span className="ms-auto flex items-center gap-1">
              <PdpWishlistButton productId={p.id} variantId={variant?.id} />
              <ShareMenu title={p.title} url={url} />
              <ReportMenu targetType="product" targetId={p.id} />
            </span>
          </div>

          {flashOn && p.flash && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gradient-to-r from-sale to-[#E0663A] px-4 py-2.5 text-white rtl:bg-gradient-to-l">
              <span className="inline-flex items-center gap-2 text-sm font-extrabold">
                <Zap className="size-4 fill-current" aria-hidden />
                {t('home.flash.title')}
              </span>
              <span className="inline-flex items-center gap-2 text-xs font-semibold">
                {t('home.flash.endsIn')}
                <Countdown to={p.flash.endsAt} onDone={() => refetch()} />
              </span>
            </div>
          )}

          <div className={cn('mt-4 rounded-lg p-4', flashOn ? 'bg-sale-50/60' : 'bg-surface-2/60')}>
            <Price amount={tierPrice ?? pricing.price} compareAt={tierPrice ? pricing.price : pricing.compareAt} size="xl" />
            {tierPrice && <p className="mt-1 text-xs font-semibold text-success">{t('pdp.wholesaleApplied', { n: qty })}</p>}
            {!variant && p.priceMin !== p.priceMax && (
              <p className="mt-1 text-xs text-fg-muted">{t('pdp.priceRange', { min: money(p.priceMin), max: money(p.priceMax) })}</p>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {p.freeShipping && (
                <span className="inline-flex items-center gap-1 rounded-sm bg-success-soft px-2 py-0.5 text-xs font-semibold text-success">
                  <Truck className="size-3.5" aria-hidden />
                  {t('product.freeShipping')}
                </span>
              )}
              {p.cod && (
                <span className="inline-flex items-center gap-1 rounded-sm bg-surface px-2 py-0.5 text-xs font-semibold text-fg-muted ring-1 ring-border">
                  <HandCoins className="size-3.5" aria-hidden />
                  {t('product.cod')}
                </span>
              )}
            </div>
          </div>

          {p.unavailable && (
            <Alert tone="warning" className="mt-4" title={t('pdp.holidayTitle')}>
              {p.holidayMessage || t('pdp.holidayBody')}
            </Alert>
          )}
          {preOrder && (
            <Alert tone="info" className="mt-4" title={t('pdp.preOrderTitle')}>
              {p.preOrder?.shipsOn ? t('pdp.preOrderBody', { date: formatDate(p.preOrder.shipsOn, lang) }) : t('pdp.preOrderBodyNoDate')}
            </Alert>
          )}

          <div className="mt-5">
            <VariantPicker
              product={p}
              selection={selection}
              onChoose={(k, v) => {
                setSelection((s) => choose(p, s, k, v));
                setQty(1);
              }}
              onSizeGuide={p.sizeGuide ? () => setSizeGuide(true) : undefined}
            />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="text-sm font-semibold text-fg">{t('pdp.quantity')}</span>
            <QtyStepper value={qty} max={maxQty} onChange={setQty} disabled={!purchasable} />
            {variant && stock > 0 && stock < 10 && <span className="text-sm font-semibold text-sale-600">{t('product.onlyLeft', { n: stock })}</span>}
            {variant && stock <= 0 && !preOrder && <span className="text-sm font-semibold text-danger">{t('pdp.outOfStock')}</span>}
            {!variant && p.options.length > 0 && <span className="text-sm text-fg-muted">{t('pdp.chooseOptions')}</span>}
          </div>
          {variant?.sku && (
            <p className="latin mt-2 text-xs text-fg-subtle" dir="ltr">
              SKU: {variant.sku}
            </p>
          )}

          <div className="mt-5 hidden gap-3 md:flex">
            <Button size="lg" variant="outline" className="flex-1 border-primary-600 text-primary-800" leftIcon={<ShoppingCart className="size-5" />} disabled={!purchasable} onClick={onAdd}>
              {t('pdp.addToCart')}
            </Button>
            <Button size="lg" className="flex-1" disabled={!purchasable} onClick={onBuy}>
              {buyLabel}
            </Button>
          </div>
          <div className="mt-3">
            <AlertToggles productId={p.id} variantId={variant?.id} outOfStock={!!variant && stock <= 0 && !preOrder} />
          </div>

          {p.wholesaleTiers && p.wholesaleTiers.length > 0 && (
            <div className="mt-5">
              <WholesaleTable tiers={p.wholesaleTiers} qty={qty} base={pricing.price} />
            </div>
          )}

          <div className="mt-6">
            <Highlights items={p.highlights} />
          </div>
        </div>

        {/* Delivery + seller */}
        <aside className="grid min-w-0 gap-4 self-start md:grid-cols-2 lg:col-span-2 xl:col-span-1 xl:grid-cols-1">
          <DeliveryEstimate product={p} storeCity={storeQuery.data?.city} />
          <SellerCard store={p.store} product={{ id: p.id, title: p.title, slug: p.slug, image: p.images[0]?.url, price: pricing.price }} />
        </aside>
      </div>

      <BoughtTogether product={p} variant={variant} />

      {/* Details */}
      <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="rounded-lg border border-border bg-surface p-5 sm:p-6" aria-labelledby="pdp-desc">
          <h2 id="pdp-desc" className="text-lg font-extrabold text-fg">
            {t('pdp.description')}
          </h2>
          {p.description ? (
            // Server-sanitized HTML (allow-listed tags/attributes, see D-041).
            <div className="prose-souq mt-4" dangerouslySetInnerHTML={{ __html: p.description }} />
          ) : (
            <p className="mt-4 text-sm text-fg-muted">{t('pdp.noDescription')}</p>
          )}
          {p.tags.length > 0 && (
            <ul className="mt-6 flex flex-wrap gap-1.5">
              {p.tags.map((tag) => (
                <li key={tag}>
                  <Link to={`/search?q=${encodeURIComponent(tag)}`} className="inline-flex rounded-pill bg-surface-2 px-3 py-1 text-xs text-fg-muted hover:text-fg">
                    #{tag}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="self-start rounded-lg border border-border bg-surface p-5 sm:p-6" aria-labelledby="pdp-specs">
          <h2 id="pdp-specs" className="text-lg font-extrabold text-fg">
            {t('pdp.specs')}
          </h2>
          {p.specs.length ? (
            <dl className="mt-4 divide-y divide-border text-sm">
              {p.specs.map((s) => (
                <div key={s.label} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 py-2.5">
                  <dt className="text-fg-muted">{s.label}</dt>
                  <dd className="font-medium text-fg">{s.value}</dd>
                </div>
              ))}
              {p.shipping?.weightGrams ? (
                <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 py-2.5">
                  <dt className="text-fg-muted">{t('pdp.weight')}</dt>
                  <dd className="latin font-medium text-fg tabular">{(p.shipping.weightGrams / 1000).toFixed(2)} kg</dd>
                </div>
              ) : null}
            </dl>
          ) : (
            <p className="mt-4 text-sm text-fg-muted">{t('pdp.noSpecs')}</p>
          )}
          {p.sizeGuide && (
            <Button variant="outline" size="sm" className="mt-4" onClick={() => setSizeGuide(true)}>
              {t('pdp.sizeGuide')}
            </Button>
          )}
        </section>
      </div>

      <ProductReviews slug={p.slug} />
      <ProductQuestions slug={p.slug} />

      <ProductRail
        title={t('pdp.moreFromStore', { store: p.store.name })}
        products={moreFromStore.data?.filter((x) => x.id !== p.id)}
        loading={moreFromStore.isPending}
        viewAll={`/store/${p.store.slug}?tab=products`}
      />
      <ProductRail title={t('pdp.related')} eyebrow={t('pdp.relatedEyebrow')} products={related.data?.filter((x) => x.id !== p.id)} loading={related.isPending} />

      {p.sizeGuide && (
        <Modal open={sizeGuide} onOpenChange={setSizeGuide} title={t('pdp.sizeGuide')} size="lg">
          <div className="prose-souq overflow-x-auto pb-3" dangerouslySetInnerHTML={{ __html: p.sizeGuide }} />
        </Modal>
      )}

      {/* Mobile sticky buy bar (sits above the bottom navigation). */}
      <div className="h-20 md:hidden" aria-hidden />
      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-border bg-surface/95 px-4 py-2.5 shadow-pop backdrop-blur-xl md:hidden">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <Price amount={tierPrice ?? pricing.price} size="md" />
            {flashOn ? (
              <p className="inline-flex items-center gap-1 text-[11px] font-semibold text-sale-600">
                <CalendarClock className="size-3" aria-hidden />
                {t('home.flash.title')}
              </p>
            ) : (
              variant && stock > 0 && stock < 10 && <p className="text-[11px] font-semibold text-sale-600">{t('product.onlyLeft', { n: stock })}</p>
            )}
          </div>
          <Button variant="outline" className="border-primary-600 px-3 text-primary-800" disabled={!purchasable} onClick={onAdd} aria-label={t('pdp.addToCart')}>
            <ShoppingCart className="size-5" />
          </Button>
          <Button className="px-5" disabled={!purchasable} onClick={onBuy} leftIcon={preOrder ? <Sparkles className="size-4" /> : undefined}>
            {buyLabel}
          </Button>
        </div>
      </div>
    </Container>
  );
}

import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BadgeCheck } from 'lucide-react';
import { useBrand } from '@/api/catalog';
import { Seo } from '@/components/layout/Seo';
import { Breadcrumbs, Container } from '@/components/ui';
import { ProductListing } from '@/components/catalog/ProductListing';
import { ListingHeaderSkeleton, PageError, breadcrumbLd } from '@/components/catalog/PageStates';

export default function BrandPage() {
  const { slug = '' } = useParams();
  const { t } = useTranslation();
  const { data, error, isLoading, refetch } = useBrand(slug);
  const extra = useMemo(() => ({ brand: slug }), [slug]);

  if (error) return <PageError error={error} onRetry={() => refetch()} />;
  const crumbs = [
    { label: t('nav.home'), to: '/' },
    { label: t('brandPage.brands') },
    { label: data?.name ?? '', to: `/brand/${slug}` },
  ];

  return (
    <Container className="pb-8 pt-4 sm:pt-6">
      {data && (
        <Seo
          title={data.name}
          description={data.description ?? t('brandPage.metaDescription', { name: data.name })}
          canonical={`/brand/${slug}`}
          image={data.logo}
          jsonLd={[
            breadcrumbLd(crumbs),
            { '@context': 'https://schema.org', '@type': 'Brand', name: data.name, ...(data.logo ? { logo: data.logo } : {}), ...(data.description ? { description: data.description } : {}) },
          ]}
        />
      )}
      {isLoading || !data ? (
        <ListingHeaderSkeleton />
      ) : (
        <header>
          <Breadcrumbs items={crumbs} className="text-xs sm:text-sm" />
          <div className="relative mt-4 overflow-hidden rounded-xl border border-border bg-surface p-5 sm:p-7">
            <div className="souq-pattern pointer-events-none absolute inset-y-0 end-0 w-1/2 opacity-40 [mask-image:linear-gradient(90deg,transparent,#000)] rtl:[mask-image:linear-gradient(270deg,transparent,#000)]" aria-hidden />
            <div className="relative flex items-center gap-4">
              <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-bg text-2xl font-extrabold text-primary-700">
                {data.logo ? <img src={data.logo} alt="" className="size-full object-contain p-1.5" /> : <span className="latin">{data.name.slice(0, 1)}</span>}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-accent-700">{t('brandPage.eyebrow')}</p>
                <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-fg sm:text-3xl">
                  {data.name}
                  {data.isFeatured && <BadgeCheck className="size-6 text-primary-700" aria-label={t('brandPage.featured')} />}
                </h1>
                {data.description && <p className="mt-1 max-w-2xl text-sm text-fg-muted">{data.description}</p>}
              </div>
            </div>
          </div>
        </header>
      )}
      <div className="mt-6">
        <ProductListing key={slug} extraParams={extra} hidden={['brand']} />
      </div>
    </Container>
  );
}

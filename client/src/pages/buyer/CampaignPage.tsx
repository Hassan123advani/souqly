import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarClock, PackageOpen } from 'lucide-react';
import { useCampaign } from '@/api/catalog';
import { Seo } from '@/components/layout/Seo';
import { Badge, Button, Container, Countdown, EmptyState, Skeleton } from '@/components/ui';
import { ProductGrid, ProductGridSkeleton } from '@/components/product/ProductGrid';
import { PageError } from '@/components/catalog/PageStates';
import { formatDate } from '@/lib/format';
import { useLang } from '@/lib/catalog';

export default function CampaignPage() {
  const { slug = '' } = useParams();
  const { t } = useTranslation();
  const lang = useLang();
  const { data, error, isLoading, refetch } = useCampaign(slug);

  if (error) return <PageError error={error} onRetry={() => refetch()} />;

  const now = Date.now();
  const upcoming = data ? new Date(data.startsAt).getTime() > now : false;
  const ended = data ? new Date(data.endsAt).getTime() <= now : false;

  return (
    <Container className="pb-8 pt-4 sm:pt-6">
      {data && (
        <Seo
          title={data.name}
          description={data.description ?? t('campaign.metaDescription', { name: data.name })}
          image={data.banner}
          canonical={`/campaign/${slug}`}
          jsonLd={{
            '@context': 'https://schema.org',
            '@type': 'SaleEvent',
            name: data.name,
            startDate: data.startsAt,
            endDate: data.endsAt,
            ...(data.description ? { description: data.description } : {}),
            ...(data.banner ? { image: data.banner } : {}),
            eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
            location: { '@type': 'VirtualLocation', url: window.location.href },
          }}
        />
      )}
      {isLoading || !data ? (
        <Skeleton className="aspect-[8/3] w-full rounded-xl" />
      ) : (
        <header className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
          {/* Campaign art carries its own headline (D-045), so the details sit in a strip below it. */}
          {data.banner ? (
            <img src={data.banner} alt={data.name} className="aspect-[8/3] w-full object-cover" />
          ) : (
            <div className="souq-pattern aspect-[8/3] w-full bg-[#0B2826]" aria-hidden />
          )}
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {data.isLive && !ended ? (
                  <Badge tone="sale">{t('campaign.live')}</Badge>
                ) : upcoming ? (
                  <Badge tone="accent">{t('campaign.upcoming')}</Badge>
                ) : (
                  <Badge>{t('campaign.ended')}</Badge>
                )}
              </div>
              <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-fg sm:text-3xl">{data.name}</h1>
              {data.description && <p className="mt-1 max-w-2xl text-sm text-fg-muted">{data.description}</p>}
            </div>
            {!ended ? (
              <div className="flex shrink-0 flex-col gap-1.5 text-sm text-fg-muted sm:items-end">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarClock className="size-4" aria-hidden />
                  {upcoming ? t('campaign.startsIn') : t('campaign.endsIn')}
                </span>
                <Countdown to={upcoming ? data.startsAt : data.endsAt} onDone={() => refetch()} />
              </div>
            ) : (
              <p className="text-sm text-fg-muted">{t('campaign.endedOn', { date: formatDate(data.endsAt, lang) })}</p>
            )}
          </div>
        </header>
      )}

      <section className="mt-8" aria-busy={isLoading || undefined}>
        {isLoading || !data ? (
          <ProductGridSkeleton count={10} />
        ) : data.products.length ? (
          <>
            <h2 className="mb-4 text-lg font-extrabold text-fg">{t('campaign.products', { n: data.products.length })}</h2>
            <ProductGrid products={data.products} />
          </>
        ) : (
          <EmptyState
            icon={<PackageOpen />}
            title={upcoming ? t('campaign.emptyUpcoming') : t('campaign.emptyTitle')}
            description={t('campaign.emptyBody')}
            action={<Button to="/">{t('coming.backHome')}</Button>}
            className="rounded-lg border border-dashed border-border-strong bg-surface"
          />
        )}
      </section>
    </Container>
  );
}

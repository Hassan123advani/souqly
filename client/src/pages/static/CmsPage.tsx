import { lazy, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePublicPage, type PublicCmsPage } from '@/api/admin';
import { Seo } from '@/components/layout/Seo';
import { Breadcrumbs, Container, ErrorState, Skeleton } from '@/components/ui';
import { useLang, useLocalized } from '@/lib/catalog';
import { formatDate } from '@/lib/format';

const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

function CmsArticle({ page }: { page: PublicCmsPage }) {
  const { t } = useTranslation();
  const loc = useLocalized();
  const lang = useLang();
  const title = loc(page.title);
  // Body falls back to English when this language has no copy yet. HTML is sanitized server-side on save.
  const body = page.body[lang]?.trim() ? page.body[lang] : page.body.en;
  return (
    <>
      <Seo title={title} />
      <div className="border-b border-border bg-surface">
        <Container className="py-10 sm:py-14">
          <Breadcrumbs items={[{ label: t('nav.home'), to: '/' }, { label: title }]} />
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">{title}</h1>
          {page.updatedAt && <p className="mt-3 text-xs text-fg-subtle">{t('cms.updated', { date: formatDate(page.updatedAt, lang) })}</p>}
        </Container>
      </div>
      <Container className="py-10 sm:py-14">
        <article className="prose-souq mx-auto max-w-3xl" dangerouslySetInnerHTML={{ __html: body }} />
        <p className="mx-auto mt-10 max-w-3xl text-sm text-fg-muted">
          {t('cms.questions')}{' '}
          <Link to="/account/support/new" className="font-semibold text-primary-700 hover:underline">
            {t('cms.contactSupport')}
          </Link>
        </p>
      </Container>
    </>
  );
}

function Loading() {
  return (
    <Container className="py-14">
      <Skeleton className="h-10 w-1/2" />
      <Skeleton className="mt-8 h-64" />
    </Container>
  );
}

/** `/pages/:slug` — a published CMS page or 404. */
export default function CmsPage() {
  const { slug } = useParams();
  const q = usePublicPage(slug);
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <NotFoundPage />;
  return <CmsArticle page={q.data} />;
}

/** About / Terms / Privacy / Help: the admin's CMS page when published, else the built-in copy. */
export function CmsOrFallback({ slug, children }: { slug: string; children: ReactNode }) {
  const q = usePublicPage(slug);
  if (q.isLoading) return <Loading />;
  return q.data ? <CmsArticle page={q.data} /> : <>{children}</>;
}

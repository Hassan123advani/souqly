import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';

/** Per-page <title>/<meta description>. Titles become "X · Souqly". */
export function Seo({ title, description, noindex }: { title?: string; description?: string; noindex?: boolean }) {
  const { t } = useTranslation();
  const full = title ? `${title} · Souqly` : `Souqly — ${t('brand.tagline')}`;
  return (
    <Helmet>
      <title>{full}</title>
      {description && <meta name="description" content={description} />}
      <meta property="og:title" content={full} />
      {description && <meta property="og:description" content={description} />}
      {noindex && <meta name="robots" content="noindex" />}
    </Helmet>
  );
}

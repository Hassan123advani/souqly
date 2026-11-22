import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import { absoluteUrl } from '@/lib/catalog';

type SeoProps = {
  title?: string;
  description?: string;
  noindex?: boolean;
  /** OG/Twitter image (relative URLs are made absolute). */
  image?: string;
  /** og:type, e.g. "product" or "website". */
  type?: string;
  /** Canonical path (defaults to none). */
  canonical?: string;
  /** Structured data objects rendered as application/ld+json. */
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
};

/** JSON for a <script> tag: escape "<" so content can never close the tag. */
function ldJson(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

/** Per-page <title>/<meta description>/OG tags and optional JSON-LD. Titles become "X · Souqly". */
export function Seo({ title, description, noindex, image, type, canonical, jsonLd }: SeoProps) {
  const { t } = useTranslation();
  const full = title ? `${title} · Souqly` : `Souqly — ${t('brand.tagline')}`;
  const desc = description?.slice(0, 300);
  const blocks = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];
  return (
    <Helmet>
      <title>{full}</title>
      {desc && <meta name="description" content={desc} />}
      <meta property="og:title" content={full} />
      {desc && <meta property="og:description" content={desc} />}
      {type && <meta property="og:type" content={type} />}
      {image && <meta property="og:image" content={absoluteUrl(image)} />}
      {canonical && <link rel="canonical" href={absoluteUrl(canonical)} />}
      {canonical && <meta property="og:url" content={absoluteUrl(canonical)} />}
      {noindex && <meta name="robots" content="noindex" />}
      {blocks.map((b, i) => (
        <script key={i} type="application/ld+json">
          {ldJson(b)}
        </script>
      ))}
    </Helmet>
  );
}

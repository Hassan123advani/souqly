import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Seo } from '@/components/layout/Seo';
import { Breadcrumbs, type Crumb } from '@/components/ui';

/** Consistent admin page header: breadcrumbs, title, description and the primary actions. */
export function PageHeader({ title, description, crumbs = [], actions }: { title: string; description?: ReactNode; crumbs?: Crumb[] | null; actions?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <header className="mb-6">
      <Seo title={title} noindex />
      {crumbs && <Breadcrumbs items={[{ label: t('nav.adminPanel'), to: '/admin' }, ...crumbs, { label: title }]} className="mb-2 text-xs" />}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight text-fg">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-sm text-fg-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

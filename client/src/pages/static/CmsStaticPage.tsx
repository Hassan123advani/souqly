import { CmsOrFallback } from './CmsPage';
import HelpPage from './HelpPage';
import StaticPage from './StaticPage';

/** Static routes whose copy the admin can override with a published CMS page of the same slug. */
export default function CmsStaticPage({ page }: { page: 'about' | 'terms' | 'privacy' | 'help' }) {
  return <CmsOrFallback slug={page}>{page === 'help' ? <HelpPage /> : <StaticPage page={page} />}</CmsOrFallback>;
}

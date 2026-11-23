import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Circle, X } from 'lucide-react';
import type { OnboardingChecklist } from '@souqly/shared';
import { Card, IconButton } from '@/components/ui';
import { useSellerPrefs } from '../useSellerPrefs';

const LINKS: Record<keyof OnboardingChecklist, string> = {
  logo: '/seller/store',
  banner: '/seller/store',
  firstProduct: '/seller/products/new',
  policies: '/seller/store?tab=policies',
  payout: '/seller/store?tab=account',
  shipping: '/seller/settings',
};

/** "Get your store ready" checklist; hidden once complete or dismissed. */
export function ChecklistCard({ checklist }: { checklist: OnboardingChecklist }) {
  const { t } = useTranslation();
  const { checklistHidden, setChecklistHidden } = useSellerPrefs();
  const keys = Object.keys(LINKS) as (keyof OnboardingChecklist)[];
  const done = keys.filter((k) => checklist[k]).length;
  if (checklistHidden || done === keys.length) return null;
  const pct = Math.round((done / keys.length) * 100);
  return (
    <Card className="relative overflow-hidden p-5" data-tour="checklist">
      <IconButton label={t('seller.common.dismiss')} size="sm" variant="ghost" className="absolute end-2 top-2" onClick={() => setChecklistHidden(true)}>
        <X className="size-4" />
      </IconButton>
      <h2 className="text-base font-bold text-fg">{t('seller.checklist.title')}</h2>
      <p className="mt-0.5 text-sm text-fg-muted">{t('seller.checklist.progress', { done, total: keys.length })}</p>
      <div className="mt-3 h-2 overflow-hidden rounded-pill bg-surface-2">
        <div className="h-full rounded-pill bg-accent transition-[width] duration-400" style={{ width: `${pct}%` }} />
      </div>
      <ul className="mt-4 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
        {keys.map((k) => (
          <li key={k}>
            <Link to={LINKS[k]} className="flex items-center gap-2 rounded-md p-2 text-sm hover:bg-surface-2">
              {checklist[k] ? <CheckCircle2 className="size-4 shrink-0 text-success" /> : <Circle className="size-4 shrink-0 text-fg-subtle" />}
              <span className={checklist[k] ? 'text-fg-muted line-through' : 'font-medium text-fg'}>{t(`seller.checklist.items.${k}`)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

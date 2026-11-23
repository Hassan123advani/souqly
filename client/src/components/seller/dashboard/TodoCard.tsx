import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ChevronRight, CircleHelp, MessageSquare, PackageCheck, RotateCcw, ShoppingBag, Truck } from 'lucide-react';
import type { SellerDashboard } from '@souqly/shared';
import { cn } from '@/lib/cn';

type Item = { key: keyof SellerDashboard['todo']; icon: typeof ShoppingBag; to?: string };
const ITEMS: Item[] = [
  { key: 'toConfirm', icon: ShoppingBag, to: '/seller/orders?status=placed' },
  { key: 'toPack', icon: PackageCheck, to: '/seller/orders?status=confirmed' },
  { key: 'toShip', icon: Truck, to: '/seller/orders?status=packed' },
  { key: 'returnRequests', icon: RotateCcw, to: '/seller/orders?status=return_requested' },
  { key: 'lowStock', icon: AlertTriangle, to: '/seller/inventory?low=1' },
  // Q&A and chat inboxes ship in Phase 8; counts are shown without a link until then.
  { key: 'unansweredQuestions', icon: CircleHelp },
  { key: 'unreadChats', icon: MessageSquare },
];

/** Things waiting for the seller, each linking into the matching filtered view. */
export function TodoCard({ todo }: { todo: SellerDashboard['todo'] }) {
  const { t } = useTranslation();
  return (
    <ul className="divide-y divide-border">
      {ITEMS.map(({ key, icon: Icon, to }) => {
        const n = todo[key];
        const body = (
          <>
            <span className={cn('grid size-9 shrink-0 place-items-center rounded-md', n ? 'bg-accent-50 text-accent-800' : 'bg-surface-2 text-fg-subtle')}>
              <Icon className="size-4" />
            </span>
            <span className="flex-1 text-sm font-medium text-fg">{t(`seller.dash.todo.${key}`)}</span>
            <span className={cn('text-base font-extrabold', n ? 'text-fg' : 'text-fg-subtle')}>{n}</span>
            {to && <ChevronRight className="flip-rtl size-4 text-fg-subtle" />}
          </>
        );
        return (
          <li key={key}>
            {to ? (
              <Link to={to} className="flex items-center gap-3 px-1 py-2.5 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
                {body}
              </Link>
            ) : (
              <div className="flex items-center gap-3 px-1 py-2.5">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

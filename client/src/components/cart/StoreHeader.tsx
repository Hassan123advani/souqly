import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { StoreLogo } from '@/components/product/StoreCard';
import { MallBadge } from '@/components/product/ProductCard';

/** Store row on top of a cart / checkout / order group. `lead` is an optional checkbox. */
export function StoreHeader({
  store,
  lead,
  trailing,
}: {
  store: { slug: string; name: string; logo?: string; isMall?: boolean };
  lead?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      {lead}
      <Link to={`/store/${store.slug}`} className="group flex min-w-0 items-center gap-2.5 rounded-md">
        <StoreLogo src={store.logo} name={store.name} className="size-8 text-xs" />
        <span className="truncate text-sm font-bold text-fg group-hover:text-primary-700">{store.name}</span>
        {store.isMall && <MallBadge />}
        <ChevronRight className="size-4 shrink-0 text-fg-subtle rtl:rotate-180" aria-hidden />
      </Link>
      {trailing && <div className="ms-auto shrink-0">{trailing}</div>}
    </div>
  );
}

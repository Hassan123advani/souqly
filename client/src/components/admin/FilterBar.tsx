import type { ReactNode } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui';

/** Search box + filter controls + trailing actions (CSV) above an admin list. */
export function FilterBar({ q, onQ, placeholder, children, actions }: { q?: string; onQ?: (v: string) => void; placeholder?: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {onQ && (
        <div className="w-full sm:w-72">
          <Input type="search" value={q} onChange={(e) => onQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} startIcon={<Search className="size-4" />} />
        </div>
      )}
      {children}
      {actions && <div className="ms-auto flex items-center gap-2">{actions}</div>}
    </div>
  );
}

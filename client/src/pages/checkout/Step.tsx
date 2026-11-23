import type { ReactNode } from 'react';
import { Card } from '@/components/ui';

/** Numbered section of the one-page checkout. */
export function Step({ n, title, action, children }: { n: number; title: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="latin grid size-7 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-fg">{n}</span>
        <h2 className="min-w-0 flex-1 text-base font-bold text-fg">{title}</h2>
        {action}
      </div>
      {children}
    </Card>
  );
}

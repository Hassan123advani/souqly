import type { ReactNode } from 'react';
import { Bell, Bike, Package, Undo2, Wallet } from 'lucide-react';
import type { NotificationDTO } from '@souqly/shared';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import { useUi } from '@/stores/ui';

/** Only same-origin relative links are followed (no open redirect via notification data). */
export function safeLink(link?: string): string | undefined {
  return link && link.startsWith('/') && !link.startsWith('//') && !link.startsWith('/\\') ? link : undefined;
}

export function NotificationIcon({ type, className }: { type: string; className?: string }) {
  const Icon = type.startsWith('rider') ? Bike : type.startsWith('return') || type.endsWith('returned') ? Undo2 : type.endsWith('refunded') ? Wallet : type.startsWith('order') ? Package : Bell;
  return (
    <span className={cn('grid size-9 shrink-0 place-items-center rounded-pill bg-primary-50 text-primary-700 dark:bg-primary-950/50', className)} aria-hidden>
      <Icon className="size-4" />
    </span>
  );
}

/** One notification row: icon, title, body, relative time and an unread dot. */
export function NotificationRow({ n, trailing, compact }: { n: NotificationDTO; trailing?: ReactNode; compact?: boolean }) {
  const lang = useUi((s) => s.language);
  const unread = !n.readAt;
  return (
    <div className="flex w-full min-w-0 items-start gap-3 text-start">
      <NotificationIcon type={n.type} />
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm text-fg', unread ? 'font-bold' : 'font-medium', compact && 'line-clamp-1')}>{n.title}</p>
        <p className={cn('text-xs text-fg-muted', compact ? 'line-clamp-2' : 'line-clamp-3')}>{n.body}</p>
        <p className="mt-1 text-[11px] text-fg-subtle">{formatRelative(n.createdAt, lang)}</p>
      </div>
      {unread && <span className="mt-1.5 size-2 shrink-0 rounded-pill bg-accent" aria-hidden />}
      {trailing}
    </div>
  );
}

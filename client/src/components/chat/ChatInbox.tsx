import { useTranslation } from 'react-i18next';
import { Image as ImageIcon, MessageCircle, Package, ShoppingBag } from 'lucide-react';
import type { ConversationDTO } from '@souqly/shared';
import { flatPages, useConversations, type ChatSide } from '@/api/chat';
import { StoreLogo } from '@/components/product/StoreCard';
import { Avatar, Button, CountBadge, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useLang } from '@/lib/catalog';
import { formatRelative } from '@/lib/format';
import { ChatThread } from './ChatThread';
import type { DraftProduct } from './ChatWithSeller';

function Preview({ c }: { c: ConversationDTO }) {
  const { t } = useTranslation();
  const m = c.lastMessage;
  if (!m) return <span className="italic">{t('chat.noMessages')}</span>;
  const icon =
    m.type === 'image' ? <ImageIcon className="size-3.5" /> : m.type === 'product' ? <ShoppingBag className="size-3.5" /> : m.type === 'order' ? <Package className="size-3.5" /> : null;
  const text = m.type === 'text' ? m.text : m.text || t(`chat.kind.${m.type}`);
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      {icon}
      <span className="truncate">{text}</span>
    </span>
  );
}

export function ConversationList({
  side,
  activeId,
  onSelect,
}: {
  side: ChatSide;
  activeId?: string;
  onSelect: (c: ConversationDTO) => void;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const q = useConversations(side);
  const items = flatPages(q.data);

  if (q.isPending)
    return (
      <div className="space-y-1 p-2" aria-busy>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 p-2">
            <Skeleton className="size-11 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-2/5" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          </div>
        ))}
      </div>
    );
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} compact className="m-4" />;
  if (!items.length)
    return (
      <EmptyState
        className="m-4"
        icon={<MessageCircle className="size-6" />}
        title={t(side === 'store' ? 'chat.emptyStore' : 'chat.empty')}
        description={side === 'buyer' ? t('chat.emptyHint') : undefined}
        action={side === 'buyer' ? <Button to="/">{t('chat.browse')}</Button> : undefined}
      />
    );

  return (
    <ul className="divide-y divide-border">
      {items.map((c) => {
        const name = side === 'store' ? (c.buyer?.name ?? '—') : c.store.name;
        const active = c.id === activeId;
        return (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onSelect(c)}
              aria-current={active ? 'true' : undefined}
              className={cn(
                'flex w-full items-center gap-3 px-3 py-3 text-start transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 sm:px-4',
                active && 'bg-primary-50/70 hover:bg-primary-50',
              )}
            >
              <span className="relative shrink-0">
                {side === 'store' ? (
                  <Avatar src={c.buyer?.avatar} name={name} size="md" />
                ) : (
                  <StoreLogo src={c.store.logo} name={c.store.name} className="size-11 border-border text-base" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className={cn('truncate text-sm text-fg', c.unread ? 'font-extrabold' : 'font-semibold')}>{name}</span>
                  <span className="ms-auto shrink-0 text-[11px] text-fg-subtle">{formatRelative(c.lastMessage?.at ?? c.updatedAt, lang)}</span>
                </span>
                <span className="mt-0.5 flex items-center gap-2">
                  <span className={cn('min-w-0 flex-1 truncate text-xs', c.unread ? 'font-semibold text-fg' : 'text-fg-muted')}>
                    {c.lastMessage && c.lastMessage.senderSide === side && <span className="text-fg-subtle">{t('chat.you')} </span>}
                    <Preview c={c} />
                  </span>
                  {c.unread > 0 && <CountBadge count={c.unread} className="static shrink-0" />}
                </span>
              </span>
            </button>
          </li>
        );
      })}
      {q.hasNextPage && (
        <li className="p-3 text-center">
          <Button variant="ghost" size="sm" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
            {t('social.loadMore')}
          </Button>
        </li>
      )}
    </ul>
  );
}

/**
 * Two-pane inbox (desktop) / list → thread navigation (mobile). The active conversation id is
 * owned by the page (route param or local state).
 */
export function ChatInbox({
  side,
  activeId,
  onSelect,
  onBack,
  draftProduct,
  draftOrder,
  className,
  title,
}: {
  side: ChatSide;
  activeId?: string;
  onSelect: (id: string) => void;
  onBack: () => void;
  draftProduct?: DraftProduct;
  draftOrder?: string;
  className?: string;
  title: string;
}) {
  const { t } = useTranslation();
  const q = useConversations(side);
  const active = flatPages(q.data).find((c) => c.id === activeId);
  return (
    <div className={cn('grid min-h-0 overflow-hidden rounded-lg border border-border bg-surface md:grid-cols-[320px_minmax(0,1fr)] lg:grid-cols-[360px_minmax(0,1fr)]', className)}>
      <aside className={cn('flex min-h-0 flex-col border-border md:border-e', activeId && 'hidden md:flex')}>
        <h1 className="flex h-16 shrink-0 items-center border-b border-border px-4 text-lg font-extrabold tracking-tight text-fg">{title}</h1>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ConversationList side={side} activeId={activeId} onSelect={(c) => onSelect(c.id)} />
        </div>
      </aside>
      <div className={cn('min-h-0', !activeId && 'hidden md:block')}>
        {activeId ? (
          <ChatThread
            key={activeId}
            side={side}
            convId={activeId}
            conversation={active}
            onBack={onBack}
            initialDraft={draftProduct}
            initialOrderNumber={draftOrder}
          />
        ) : (
          <div className="grid h-full place-items-center bg-bg p-6">
            <EmptyState icon={<MessageCircle className="size-6" />} title={t('chat.pickConversation')} description={t('chat.pickConversationHint')} />
          </div>
        )}
      </div>
    </div>
  );
}

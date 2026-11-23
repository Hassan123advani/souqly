import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowLeft, ImagePlus, Package, Paperclip, SendHorizontal, ShoppingBag, X } from 'lucide-react';
import type { ConversationDTO, MessageCreateInput, MessageDTO } from '@souqly/shared';
import { flatPages, useChatRoom, useConversation, useMarkRead, useMessages, useQuickReplies, useSendMessage, type ChatSide } from '@/api/chat';
import { getErrorMessage } from '@/api/client';
import { uploadSocial } from '@/api/social';
import { StoreLogo } from '@/components/product/StoreCard';
import { ReportDialog } from '@/components/social/ReportDialog';
import { socialError } from '@/components/social/errors';
import {
  Avatar,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ErrorState,
  IconButton,
  Skeleton,
  Spinner,
  Textarea,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { useLang } from '@/lib/catalog';
import { formatDate } from '@/lib/format';
import { ChatProductCard, MessageBubble } from './MessageBubble';
import { OrderPicker, ProductPicker } from './Pickers';
import type { DraftProduct } from './ChatWithSeller';

type Draft = { kind: 'product'; product: DraftProduct } | { kind: 'order'; id: string; number: string };

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Header avatar + name of the other party. */
function Counterpart({ conv, side }: { conv?: ConversationDTO; side: ChatSide }) {
  if (!conv) return <Skeleton className="h-10 w-40" />;
  const name = side === 'store' ? (conv.buyer?.name ?? '—') : conv.store.name;
  return (
    <div className="flex min-w-0 items-center gap-3">
      {side === 'store' ? (
        <Avatar src={conv.buyer?.avatar} name={name} size="sm" />
      ) : (
        <StoreLogo src={conv.store.logo} name={conv.store.name} className="size-9 border-border text-sm" />
      )}
      <p className="truncate font-bold text-fg">{name}</p>
    </div>
  );
}

export function ChatThread({
  side,
  convId,
  conversation: listRow,
  onBack,
  initialDraft,
  initialOrderNumber,
}: {
  side: ChatSide;
  convId: string;
  conversation?: ConversationDTO;
  onBack?: () => void;
  initialDraft?: DraftProduct;
  initialOrderNumber?: string;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const conv = useConversation(side, convId, listRow);
  const conversation = conv.data;
  const q = useMessages(side, convId);
  const send = useSendMessage(side, convId);
  const markRead = useMarkRead(side);
  const quick = useQuickReplies(side === 'store');
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<Draft | null>(initialDraft ? { kind: 'product', product: initialDraft } : null);
  const [uploading, setUploading] = useState<number | null>(null);
  const [picker, setPicker] = useState<'product' | 'order' | null>(initialOrderNumber ? 'order' : null);
  const [reportId, setReportId] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const stickBottom = useRef(true);
  const prevHeight = useRef<number | null>(null);
  const typingOff = useRef<ReturnType<typeof setTimeout>>();

  const { otherTyping, setTyping } = useChatRoom(side, convId, () => {
    if (document.visibilityState === 'visible') markRead.mutate(convId);
  });

  const messages = useMemo(() => [...flatPages(q.data)].reverse(), [q.data]);
  const newest = messages[messages.length - 1];

  // Mark read when the thread opens with unread messages from the other side.
  const unreadFromOther = messages.some((m) => m.senderSide !== side && !m.readAt);
  useEffect(() => {
    if (unreadFromOther || (conversation?.unread ?? 0) > 0) markRead.mutate(convId);
    // Runs once per thread, when its first page arrives.
  }, [convId, q.isSuccess]);

  // Keep the viewport pinned: to the bottom for new messages, in place when older pages load above.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (prevHeight.current !== null) {
      el.scrollTop += el.scrollHeight - prevHeight.current;
      prevHeight.current = null;
    } else if (stickBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length, otherTyping]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < 120 && q.hasNextPage && !q.isFetchingNextPage) {
      prevHeight.current = el.scrollHeight;
      void q.fetchNextPage();
    }
  };

  const doSend = (body: MessageCreateInput, after?: () => void) => {
    stickBottom.current = true;
    send.mutate(body, { onSuccess: after, onError: (e) => toast.error(socialError(e)) });
  };

  const submit = () => {
    if (draft) {
      doSend(draft.kind === 'product' ? { type: 'product', productId: draft.product.id } : { type: 'order', orderId: draft.id }, () => setDraft(null));
    }
    const body = text.trim();
    if (body) {
      doSend({ type: 'text', text: body });
      setText('');
    }
    clearTimeout(typingOff.current);
    setTyping(false);
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const onType = (v: string) => {
    setText(v);
    setTyping(v.length > 0);
    clearTimeout(typingOff.current);
    typingOff.current = setTimeout(() => setTyping(false), 2500);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp|avif)$/.test(file.type)) return toast.error(t('chat.imageType'));
    if (file.size > 5 * 1024 * 1024) return toast.error(t('chat.imageTooBig'));
    setUploading(0);
    try {
      const up = await uploadSocial(file, 'chat_image', setUploading);
      doSend({ type: 'image', imageKey: up.key });
    } catch (e) {
      toast.error(socialError(e));
    } finally {
      setUploading(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const storeSlug = conversation?.store.slug;
  const canSend = (!!text.trim() || !!draft) && !send.isPending;

  return (
    <section className="flex h-full min-h-0 flex-col bg-bg" aria-label={t('chat.thread')}>
      <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border bg-surface px-3 sm:px-4">
        {onBack && (
          <IconButton label={t('chat.back')} variant="ghost" size="sm" onClick={onBack} className="md:hidden">
            <ArrowLeft className="size-5 rtl:rotate-180" />
          </IconButton>
        )}
        {conv.isError && !conversation ? (
          <p className="truncate text-sm text-danger" role="alert">
            {getErrorMessage(conv.error)}
          </p>
        ) : (
          <Counterpart conv={conversation} side={side} />
        )}
        {side === 'buyer' && storeSlug && (
          <Button to={`/store/${storeSlug}`} variant="ghost" size="sm" className="ms-auto">
            {t('chat.visitStore')}
          </Button>
        )}
      </header>

      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-4 sm:px-5" aria-live="polite">
        {q.isFetchingNextPage && (
          <div className="flex justify-center py-2">
            <Spinner className="size-5" label={t('common.loading')} />
          </div>
        )}
        {q.isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-1/2" />
            <Skeleton className="ms-auto h-10 w-2/5" />
            <Skeleton className="h-16 w-3/5" />
          </div>
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} compact />
        ) : messages.length === 0 ? (
          <p className="mx-auto mt-10 max-w-xs text-center text-sm text-fg-muted">{t('chat.emptyThread')}</p>
        ) : (
          messages.map((m: MessageDTO, i) => {
            const prev = messages[i - 1];
            const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
            return (
              <Fragment key={m.id}>
                {newDay && (
                  <p className="py-2 text-center">
                    <span className="rounded-pill bg-surface-2 px-3 py-1 text-[11px] font-semibold text-fg-muted">
                      {formatDate(m.createdAt, lang, { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </p>
                )}
                <MessageBubble m={m} side={side} onReport={setReportId} />
              </Fragment>
            );
          })
        )}
        {otherTyping && (
          <div className="flex items-center gap-2 text-xs text-fg-muted" role="status">
            <span className="flex gap-1 rounded-lg border border-border bg-surface px-3 py-2.5">
              {[0, 1, 2].map((d) => (
                <span key={d} className="size-1.5 animate-bounce rounded-full bg-fg-subtle motion-reduce:animate-none" style={{ animationDelay: `${d * 150}ms` }} />
              ))}
            </span>
            {t('chat.typing')}
          </div>
        )}
        {newest && newest.senderSide === side && newest.readAt && <p className="text-end text-[11px] text-fg-subtle">{t('chat.seen')}</p>}
      </div>

      <div className="safe-bottom shrink-0 border-t border-border bg-surface px-3 py-2.5 sm:px-4">
        {side === 'store' && !!quick.data?.length && (
          <div className="no-scrollbar -mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
            {quick.data.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => doSend({ type: 'text', text: r })}
                className="shrink-0 rounded-pill border border-primary-100 bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-800 hover:bg-primary-100"
              >
                {r}
              </button>
            ))}
          </div>
        )}
        {draft && (
          <div className="mb-2 flex items-start gap-2 rounded-md bg-surface-2 p-2">
            <p className="sr-only">{t('chat.attachment')}</p>
            {draft.kind === 'product' ? (
              <ChatProductCard product={draft.product} className="flex-1" />
            ) : (
              <p className="flex flex-1 items-center gap-2 text-sm">
                <Package className="size-4 text-primary-700" aria-hidden />
                {t('chat.orderN', { n: draft.number })}
              </p>
            )}
            <IconButton label={t('chat.removeAttachment')} variant="ghost" size="sm" onClick={() => setDraft(null)}>
              <X className="size-4" />
            </IconButton>
          </div>
        )}
        {uploading !== null && (
          <div className="mb-2 flex items-center gap-2 text-xs text-fg-muted">
            <Spinner className="size-4" />
            {t('chat.uploading', { pct: uploading })}
          </div>
        )}
        <div className="flex items-end gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton label={t('chat.attach')} variant="ghost" size="md" disabled={uploading !== null}>
                <Paperclip className="size-5" />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top">
              <DropdownMenuItem icon={<ImagePlus className="size-4" />} onSelect={() => fileRef.current?.click()}>
                {t('chat.sendPhoto')}
              </DropdownMenuItem>
              {storeSlug && (
                <DropdownMenuItem icon={<ShoppingBag className="size-4" />} onSelect={() => setPicker('product')}>
                  {t('chat.sendProduct')}
                </DropdownMenuItem>
              )}
              {conversation && (
                <DropdownMenuItem icon={<Package className="size-4" />} onSelect={() => setPicker('order')}>
                  {t('chat.sendOrder')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
          <label className="sr-only" htmlFor={`chat-input-${convId}`}>
            {t('chat.placeholder')}
          </label>
          <Textarea
            id={`chat-input-${convId}`}
            value={text}
            rows={1}
            maxLength={2000}
            placeholder={t('chat.placeholder')}
            onChange={(e) => onType(e.target.value)}
            onKeyDown={onKey}
            className="max-h-32 min-h-[44px] flex-1 resize-none py-2.5"
          />
          <IconButton label={t('chat.send')} variant="primary" size="md" disabled={!canSend} onClick={submit} className={cn(!canSend && 'opacity-60')}>
            <SendHorizontal className="size-5 rtl:rotate-180" />
          </IconButton>
        </div>
      </div>

      {storeSlug && (
        <ProductPicker
          open={picker === 'product'}
          onOpenChange={(v) => setPicker(v ? 'product' : null)}
          storeSlug={storeSlug}
          onPick={(p) => {
            setDraft({ kind: 'product', product: p });
            setPicker(null);
          }}
        />
      )}
      {conversation && (
        <OrderPicker
          open={picker === 'order'}
          onOpenChange={(v) => setPicker(v ? 'order' : null)}
          side={side}
          convId={convId}
          storeId={conversation.store.id}
          highlight={initialOrderNumber}
          onPick={(o) => {
            setDraft({ kind: 'order', id: o.id, number: o.number });
            setPicker(null);
          }}
        />
      )}
      {reportId && <ReportDialog open onOpenChange={(v) => !v && setReportId(null)} targetType="message" targetId={reportId} />}
    </section>
  );
}

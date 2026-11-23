import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bot, Check, CheckCheck, Flag, Package } from 'lucide-react';
import type { MessageDTO, OrderStatus } from '@souqly/shared';
import type { ChatSide } from '@/api/chat';
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge';
import { ProductImage } from '@/components/product/ProductImage';
import { cn } from '@/lib/cn';
import { useLang } from '@/lib/catalog';
import { INTL_LOCALE, money } from '@/lib/format';

export function timeOf(iso: string, lang: ReturnType<typeof useLang>) {
  return new Intl.DateTimeFormat(INTL_LOCALE[lang], { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

/** Product card shared by bubbles and the draft attachment preview. */
export function ChatProductCard({ product, className }: { product: NonNullable<MessageDTO['product']>; className?: string }) {
  return (
    <Link to={`/p/${product.slug}`} className={cn('flex w-64 max-w-full items-center gap-3 rounded-md border border-border bg-surface p-2 text-fg hover:border-border-strong', className)}>
      <ProductImage src={product.image ?? ''} alt="" className="size-14 shrink-0 rounded-sm" />
      <span className="min-w-0">
        <span className="line-clamp-2 text-sm font-medium leading-snug">{product.title}</span>
        <span className="latin mt-0.5 block text-sm font-bold text-primary-700 tabular">{money(product.price)}</span>
      </span>
    </Link>
  );
}

export function ChatOrderCard({ order, side, className }: { order: NonNullable<MessageDTO['order']>; side: ChatSide; className?: string }) {
  const { t } = useTranslation();
  const to = side === 'store' ? `/seller/orders/${order.id}` : `/account/orders/${order.number}`;
  return (
    <Link to={to} className={cn('flex w-64 max-w-full items-center gap-3 rounded-md border border-border bg-surface p-3 text-fg hover:border-border-strong', className)}>
      <span className="grid size-10 shrink-0 place-items-center rounded-md bg-primary-50 text-primary-700">
        <Package className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1 space-y-1">
        <span className="block text-xs text-fg-muted">{t('chat.orderN', { n: order.number })}</span>
        <span className="flex flex-wrap items-center gap-2">
          <OrderStatusBadge status={order.status as OrderStatus} />
          <span className="latin text-sm font-bold tabular">{money(order.total)}</span>
        </span>
      </span>
    </Link>
  );
}

export function MessageBubble({ m, side, onReport }: { m: MessageDTO; side: ChatSide; onReport?: (id: string) => void }) {
  const { t } = useTranslation();
  const lang = useLang();
  const mine = m.senderSide === side;
  const card = m.type === 'product' || m.type === 'order';
  return (
    <div className={cn('group flex items-end gap-1.5', mine ? 'justify-end' : 'justify-start')}>
      {!mine && onReport && (
        <button
          type="button"
          onClick={() => onReport(m.id)}
          className="order-last grid size-7 shrink-0 place-items-center rounded-full text-fg-subtle opacity-0 hover:bg-surface-2 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
          aria-label={t('chat.reportMessage')}
        >
          <Flag className="size-3.5" />
        </button>
      )}
      <div
        className={cn(
          'max-w-[80%] sm:max-w-[70%]',
          card ? '' : 'rounded-lg px-3 py-2 shadow-sm',
          !card && (mine ? 'rounded-ee-sm bg-primary text-primary-fg' : 'rounded-es-sm border border-border bg-surface text-fg'),
        )}
      >
        {m.auto && (
          <p className={cn('mb-1 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide', mine ? 'text-primary-fg/80' : 'text-fg-subtle')}>
            <Bot className="size-3" aria-hidden />
            {t('chat.autoReply')}
          </p>
        )}
        {m.type === 'image' && m.imageUrl && (
          <a href={m.imageUrl} target="_blank" rel="noreferrer" className="-mx-1 -mt-0.5 mb-1 block overflow-hidden rounded-md">
            <img src={m.imageUrl} alt={t('chat.photo')} className="max-h-72 w-full object-cover" loading="lazy" />
          </a>
        )}
        {m.type === 'product' && m.product && <ChatProductCard product={m.product} />}
        {m.type === 'order' && m.order && <ChatOrderCard order={m.order} side={side} />}
        {m.text && m.type !== 'product' && m.type !== 'order' && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{m.text}</p>}
        <p
          className={cn(
            'mt-1 flex items-center justify-end gap-1 text-[10px] tabular',
            card ? 'text-fg-subtle' : mine ? 'text-primary-fg/75' : 'text-fg-subtle',
          )}
        >
          <span className="latin">{timeOf(m.createdAt, lang)}</span>
          {mine &&
            (m.readAt ? (
              <CheckCheck className={cn('size-3.5', card ? 'text-info' : 'text-accent')} aria-label={t('chat.read')} />
            ) : (
              <Check className="size-3.5" aria-label={t('chat.sent')} />
            ))}
        </p>
      </div>
    </div>
  );
}

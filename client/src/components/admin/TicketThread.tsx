import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Send } from 'lucide-react';
import { getErrorMessage } from '@/api/client';
import type { TicketMessage } from '@/api/admin';
import { Button, Textarea } from '@/components/ui';
import { useLang } from '@/lib/catalog';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';

/** Chat-style ticket conversation + reply box (shared by the buyer page and the admin desk). */
export function TicketThread({ messages, mine, onReply, sending, closed }: { messages: TicketMessage[]; mine: 'user' | 'staff'; onReply?: (body: string) => Promise<unknown>; sending?: boolean; closed?: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  const [text, setText] = useState('');
  return (
    <div className="flex flex-col">
      <ol className="space-y-3 p-4 sm:p-5">
        {messages.map((m, i) => (
          <li key={i} className={cn('flex', m.side === mine ? 'justify-end' : 'justify-start')}>
            <div className={cn('max-w-[85%] rounded-lg px-3.5 py-2.5 text-sm', m.side === mine ? 'rounded-ee-sm bg-primary text-white' : 'rounded-es-sm bg-surface-2 text-fg')}>
              <p className={cn('mb-0.5 text-[11px] font-bold', m.side === mine ? 'text-white/80' : 'text-fg-muted')}>{m.author ?? (m.side === 'staff' ? t('support.team') : t('support.you'))}</p>
              <p className="whitespace-pre-line break-words">{m.body}</p>
              <p className={cn('mt-1 text-[10px]', m.side === mine ? 'text-white/70' : 'text-fg-subtle')}>{formatDateTime(m.at, lang)}</p>
            </div>
          </li>
        ))}
      </ol>
      {onReply &&
        (closed ? (
          <p className="border-t border-border p-4 text-center text-sm text-fg-muted">{t('support.closedNote')}</p>
        ) : (
          <form
            className="flex items-end gap-2 border-t border-border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              const body = text.trim();
              if (body) void onReply(body).then(() => setText(''), (err: unknown) => toast.error(getErrorMessage(err)));
            }}
          >
            <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('support.replyPlaceholder')} aria-label={t('support.replyPlaceholder')} className="flex-1" maxLength={5000} />
            <Button type="submit" loading={sending} disabled={!text.trim()} leftIcon={<Send className="flip-rtl size-4" />}>
              {t('support.send')}
            </Button>
          </form>
        ))}
    </div>
  );
}

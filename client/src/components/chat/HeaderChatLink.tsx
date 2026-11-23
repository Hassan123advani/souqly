import { useTranslation } from 'react-i18next';
import { MessageCircle } from 'lucide-react';
import { useMe } from '@/api/auth';
import { useChatUnread } from '@/api/chat';
import { useFlag } from '@/api/config';
import { CountBadge, IconButton } from '@/components/ui';

/** Desktop header shortcut to `/chat` with the unread conversations badge (signed-in only). */
export function HeaderChatLink() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const on = useFlag('chat');
  const unread = useChatUnread('buyer');
  if (!me || !on) return null;
  return (
    <span className="relative hidden md:inline-flex">
      <IconButton label={t('chat.title')} to="/chat">
        <MessageCircle className="size-[18px]" />
      </IconButton>
      <CountBadge count={unread} />
    </span>
  );
}

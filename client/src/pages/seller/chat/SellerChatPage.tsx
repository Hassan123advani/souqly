import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChatInbox } from '@/components/chat/ChatInbox';
import { Seo } from '@/components/layout/Seo';

/** Seller Center inbox: two panes on desktop, list → thread on mobile (`?c=<id>` keeps the selection). */
export default function SellerChatPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const active = params.get('c') ?? undefined;
  return (
    <>
      <Seo title={t('chat.sellerTitle')} noindex />
      <ChatInbox
        side="store"
        title={t('chat.sellerTitle')}
        activeId={active}
        onSelect={(id) => setParams({ c: id })}
        onBack={() => setParams({})}
        className="h-[calc(100dvh-9rem)] min-h-[480px]"
      />
    </>
  );
}

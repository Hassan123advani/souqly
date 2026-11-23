import { useEffect, useRef } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useStartConversation } from '@/api/chat';
import { useFlag } from '@/api/config';
import { ChatInbox } from '@/components/chat/ChatInbox';
import type { ChatNavState } from '@/components/chat/ChatWithSeller';
import { Seo } from '@/components/layout/Seo';
import { socialError } from '@/components/social/errors';
import { Container, EmptyState, PageSpinner } from '@/components/ui';

/** `/chat` and `/chat/:id`. `?store=<slug>&order=<number>` opens (or creates) the thread with that store. */
export default function ChatPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as ChatNavState;
  const chatOn = useFlag('chat');
  const start = useStartConversation();
  const storeParam = params.get('store');
  const started = useRef(false);

  useEffect(() => {
    if (!storeParam || started.current) return;
    started.current = true;
    const order = params.get('order') ?? undefined;
    start.mutate(
      { storeSlug: storeParam },
      {
        onSuccess: (c) => navigate(`/chat/${c.id}`, { replace: true, state: { ...(order ? { draftOrder: order } : {}) } satisfies ChatNavState }),
        onError: (e) => {
          toast.error(socialError(e));
          navigate('/chat', { replace: true });
        },
      },
    );
  }, [storeParam, params, navigate, start]);

  if (storeParam) return <PageSpinner />;

  return (
    <Container className="py-0 sm:py-6">
      <Seo title={t('chat.title')} noindex />
      {chatOn ? (
        <ChatInbox
          side="buyer"
          title={t('chat.title')}
          activeId={id}
          onSelect={(cid) => navigate(`/chat/${cid}`)}
          onBack={() => navigate('/chat')}
          draftProduct={state.draftProduct}
          draftOrder={state.draftOrder}
          className="-mx-4 h-[calc(100dvh-12rem)] min-h-[380px] rounded-none border-x-0 sm:mx-0 sm:h-[calc(100dvh-9.5rem)] sm:min-h-[520px] sm:rounded-lg sm:border-x"
        />
      ) : (
        <EmptyState className="my-16" title={t('chat.disabled')} />
      )}
    </Container>
  );
}

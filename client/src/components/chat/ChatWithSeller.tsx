import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { MessageCircle } from 'lucide-react';
import { useFlag } from '@/api/config';
import { useStartConversation } from '@/api/chat';
import { Button, type ButtonProps } from '@/components/ui';
import { socialError } from '@/components/social/errors';
import { useAuthGate } from '@/components/social/useAuthGate';

/** Product to attach as a draft card when the thread opens (from the PDP). */
export type DraftProduct = { id: string; title: string; slug: string; image?: string; price: number };
export type ChatNavState = { draftProduct?: DraftProduct; draftOrder?: string };

/** "Chat with seller": opens (or creates) the conversation with a store. Hidden when the `chat` flag is off. */
export function ChatWithSellerButton({
  storeSlug,
  product,
  orderNumber,
  label,
  className,
  size = 'sm',
  variant = 'ghost',
}: {
  storeSlug: string;
  product?: DraftProduct;
  orderNumber?: string;
  label?: string;
  className?: string;
  size?: ButtonProps['size'];
  variant?: ButtonProps['variant'];
}) {
  const { t } = useTranslation();
  const on = useFlag('chat');
  const start = useStartConversation();
  const gate = useAuthGate();
  const navigate = useNavigate();
  if (!on) return null;
  const open = () =>
    gate(() =>
      start.mutate(
        { storeSlug, ...(product ? { productId: product.id } : {}) },
        {
          onSuccess: (c) => {
            const state: ChatNavState = { ...(product ? { draftProduct: product } : {}), ...(orderNumber ? { draftOrder: orderNumber } : {}) };
            navigate(`/chat/${c.id}`, { state });
          },
          onError: (e) => toast.error(socialError(e)),
        },
      ),
    );
  return (
    <Button size={size} variant={variant} className={className} loading={start.isPending} leftIcon={<MessageCircle className="size-4" />} onClick={open}>
      {label ?? t('chat.withSeller')}
    </Button>
  );
}

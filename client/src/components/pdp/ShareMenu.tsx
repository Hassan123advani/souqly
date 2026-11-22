import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Facebook, Link2, MessageCircle, Share2, Smartphone } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, IconButton, Button } from '@/components/ui';

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Share via WhatsApp, Facebook, the native share sheet (when available) or copy the link. */
export function ShareMenu({ title, url, variant = 'icon' }: { title: string; url: string; variant?: 'icon' | 'button' }) {
  const { t } = useTranslation();
  const canNative = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const open = (href: string) => window.open(href, '_blank', 'noopener,noreferrer');

  const copyLink = async () => {
    if (await copy(url)) toast.success(t('common.copied'));
    else toast.error(t('share.copyFailed'));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === 'icon' ? (
          <IconButton label={t('share.title')} variant="outline">
            <Share2 className="size-[18px]" />
          </IconButton>
        ) : (
          <Button variant="outline" size="sm" leftIcon={<Share2 className="size-4" />}>
            {t('share.title')}
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem icon={<MessageCircle />} onSelect={() => open(`https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`)}>
          {t('share.whatsapp')}
        </DropdownMenuItem>
        <DropdownMenuItem icon={<Facebook />} onSelect={() => open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`)}>
          {t('share.facebook')}
        </DropdownMenuItem>
        <DropdownMenuItem icon={<Link2 />} onSelect={() => void copyLink()}>
          {t('share.copy')}
        </DropdownMenuItem>
        {canNative && (
          <DropdownMenuItem icon={<Smartphone />} onSelect={() => void navigator.share({ title, url }).catch(() => undefined)}>
            {t('share.more')}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

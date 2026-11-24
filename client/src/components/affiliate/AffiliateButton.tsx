import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Copy, HandCoins, MessageCircle } from 'lucide-react';
import { useMe } from '@/api/auth';
import { getErrorMessage } from '@/api/client';
import { useFlag } from '@/api/config';
import { useAffiliateLink } from '@/api/growth';
import { Button, IconButton, Input, Modal } from '@/components/ui';
import { AFFILIATE_PCT } from '@/lib/rates';
import { rememberAffiliate } from './affiliateCode';

/** Remembers `?aff=` from a shared product link so the next checkout is attributed. Renders nothing. */
export function AffiliateCapture() {
  const [sp] = useSearchParams();
  const code = sp.get('aff');
  useEffect(() => rememberAffiliate(code), [code]);
  return null;
}

/** "Share & earn" for signed-in buyers (flag `affiliateLinks`): personal product link + 2% commission. */
export function AffiliateButton({ productId, title }: { productId: string; title: string }) {
  const { t } = useTranslation();
  const on = useFlag('affiliateLinks');
  const { data: me } = useMe();
  const link = useAffiliateLink();
  const [open, setOpen] = useState(false);
  if (!on || !me) return null;

  const start = () => {
    setOpen(true);
    if (!link.data) link.mutate(productId, { onError: (e) => toast.error(getErrorMessage(e)) });
  };
  const url = link.data?.url ?? '';
  const copy = () =>
    navigator.clipboard.writeText(url).then(
      () => toast.success(t('common.copied')),
      () => toast.error(t('share.copyFailed')),
    );
  return (
    <>
      <IconButton label={t('growth.affiliate.shareEarn')} variant="outline" onClick={start}>
        <HandCoins className="size-[18px]" />
      </IconButton>
      <Modal open={open} onOpenChange={setOpen} title={t('growth.affiliate.shareEarn')} description={t('growth.affiliate.howItWorks', { pct: AFFILIATE_PCT })}>
        <div className="grid gap-3">
          <Input readOnly dir="ltr" value={link.isPending ? t('common.loading') : url} aria-label={t('growth.affiliate.yourLink')} onFocus={(e) => e.target.select()} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" leftIcon={<Copy className="size-4" />} disabled={!url} onClick={() => void copy()}>
              {t('growth.affiliate.copy')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              leftIcon={<MessageCircle className="size-4" />}
              disabled={!url}
              href={url ? `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}` : undefined}
              target="_blank"
            >
              {t('share.whatsapp')}
            </Button>
            <Button size="sm" variant="ghost" to="/account/affiliate">
              {t('growth.affiliate.myEarnings')}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

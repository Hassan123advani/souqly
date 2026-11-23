import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Gift } from 'lucide-react';
import { giftCardRedeemSchema } from '@souqly/shared';
import { useRedeemGiftCard } from '@/api/wallet';
import { socialError } from '@/components/social/errors';
import { Button, Card, FormField, Input } from '@/components/ui';

/** Redeem a gift card code into the wallet. */
export function GiftCardRedeem() {
  const { t } = useTranslation();
  const redeem = useRedeemGiftCard();
  const form = useForm<{ code: string }>({ resolver: zodResolver(giftCardRedeemSchema), defaultValues: { code: '' } });
  const submit = form.handleSubmit((v) =>
    redeem.mutate(v.code, {
      onSuccess: () => {
        toast.success(t('wallet.gift.success'));
        form.reset();
      },
      onError: (e) => toast.error(socialError(e)),
    }),
  );
  return (
    <Card className="p-4 sm:p-5">
      <h2 className="flex items-center gap-2 font-bold text-fg">
        <Gift className="size-5 text-accent-700" aria-hidden />
        {t('wallet.gift.title')}
      </h2>
      <p className="mt-1 text-sm text-fg-muted">{t('wallet.gift.body')}</p>
      <form className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start" onSubmit={(e) => void submit(e)} noValidate>
        <FormField className="flex-1" label={<span className="sr-only">{t('wallet.gift.code')}</span>} error={form.formState.errors.code ? t('wallet.gift.invalid') : undefined}>
          <Input {...form.register('code')} placeholder="SOUQ-XXXX-XXXX" autoComplete="off" className="latin uppercase tracking-wider" />
        </FormField>
        <Button type="submit" loading={redeem.isPending}>
          {t('wallet.gift.redeem')}
        </Button>
      </form>
    </Card>
  );
}

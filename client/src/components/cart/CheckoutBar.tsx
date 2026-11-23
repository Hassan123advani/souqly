import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { money } from '@/lib/format';

/** Mobile-only bar pinned above the bottom nav with the total and the main CTA. */
export function CheckoutBar({ total, savings, cta, onClick, disabled, loading, lead }: {
  total: number;
  savings?: number;
  cta: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  lead?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-border bg-surface/95 px-4 py-2.5 shadow-pop backdrop-blur-xl lg:hidden">
      <div className="mx-auto flex max-w-xl items-center gap-3">
        {lead}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">{t('cart.total')}</p>
          <p className="latin text-lg font-extrabold leading-tight tabular text-fg" dir="ltr">
            {money(total)}
          </p>
          {!!savings && savings > 0 && <p className="text-[11px] font-semibold text-success">{t('cart.youSave', { amount: money(savings) })}</p>}
        </div>
        <Button size="lg" variant="accent" onClick={onClick} disabled={disabled} loading={loading}>
          {cta}
        </Button>
      </div>
    </div>
  );
}

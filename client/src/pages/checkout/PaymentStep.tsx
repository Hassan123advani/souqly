import { useTranslation } from 'react-i18next';
import { Banknote, CreditCard, Smartphone, type LucideIcon } from 'lucide-react';
import type { PaymentMethod } from '@souqly/shared';
import { usePublicConfig } from '@/api/config';
import { Badge } from '@/components/ui';
import { cn } from '@/lib/cn';
import { Step } from './Step';

const METHODS: { id: PaymentMethod; icon: LucideIcon }[] = [
  { id: 'cod', icon: Banknote },
  { id: 'jazzcash', icon: Smartphone },
  { id: 'easypaisa', icon: Smartphone },
  { id: 'stripe', icon: CreditCard },
];

/** Payment method picker. Only methods the server reports as configured can be chosen. */
export function PaymentStep({ n, value, onChange }: { n: number; value: PaymentMethod; onChange: (m: PaymentMethod) => void }) {
  const { t } = useTranslation();
  const { data } = usePublicConfig();
  const enabled = (m: PaymentMethod) => (m === 'cod' ? data?.integrations.payments.cod !== false : !!data?.integrations.payments[m]);
  return (
    <Step n={n} title={t('checkout.payment')}>
      <div role="radiogroup" aria-label={t('checkout.payment')} className="grid gap-3 sm:grid-cols-2">
        {METHODS.map(({ id, icon: Icon }) => {
          const on = value === id;
          const ok = enabled(id);
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={!ok}
              onClick={() => onChange(id)}
              className={cn(
                'flex items-center gap-3 rounded-md border p-3.5 text-start transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60',
                on ? 'border-primary bg-primary-50/60 ring-1 ring-primary' : 'border-border hover:border-border-strong',
              )}
            >
              <span className={cn('grid size-10 shrink-0 place-items-center rounded-md', on ? 'bg-primary text-primary-fg' : 'bg-surface-2 text-fg-muted')}>
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-fg">{t(`checkout.methods.${id}`)}</span>
                <span className="block text-xs text-fg-subtle">{t(`checkout.methodHints.${id}`)}</span>
              </span>
              {!ok && (
                <Badge size="sm" tone="neutral">
                  {t('checkout.comingSoon')}
                </Badge>
              )}
            </button>
          );
        })}
      </div>
    </Step>
  );
}

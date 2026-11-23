import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Coins } from 'lucide-react';
import { LOYALTY } from '@souqly/shared';
import { useFlag } from '@/api/config';
import { Switch } from '@/components/ui';
import { useDebounced } from '@/hooks/useDebounced';
import { money } from '@/lib/format';

type Redemption = { requested: number; used: number; discount: number; max: number };

/**
 * Checkout "Use coins" toggle + slider. `max` comes from the preview (20% cap and balance); the
 * chosen amount is debounced before it re-prices the preview.
 */
export function CoinsRedeem({ redemption, value, onChange }: { redemption?: Redemption; value: number; onChange: (coins: number) => void }) {
  const { t } = useTranslation();
  const on = useFlag('loyaltyCoins');
  const [local, setLocal] = useState(value);
  const debounced = useDebounced(local, 400);
  useEffect(() => {
    if (debounced !== value) onChange(debounced);
    // Only push user changes; `value` is the committed amount.
  }, [debounced]);
  if (!on || !redemption || (redemption.max <= 0 && value === 0)) return null;
  const max = redemption.max;
  const enabled = value > 0 || local > 0;
  const shown = Math.min(local, max);

  return (
    <div className="rounded-md border border-accent-100 bg-accent-50/60 p-3">
      <Switch
        checked={enabled}
        onCheckedChange={(v) => {
          setLocal(v ? max : 0);
          onChange(v ? max : 0);
        }}
        label={
          <span className="inline-flex items-center gap-1.5">
            <Coins className="size-4 text-accent-700" aria-hidden />
            {t('wallet.checkout.useCoins')}
          </span>
        }
        description={t('wallet.checkout.maxHint', { n: max, v: money(max * LOYALTY.COIN_VALUE_MINOR) })}
      />
      {enabled && (
        <div className="mt-3 space-y-1.5">
          <input
            type="range"
            min={0}
            max={max}
            step={Math.max(1, Math.floor(max / 50))}
            value={shown}
            onChange={(e) => setLocal(Number(e.target.value))}
            className="w-full accent-accent"
            aria-label={t('wallet.checkout.amount')}
          />
          <p className="flex justify-between text-xs">
            <span className="latin font-semibold text-fg tabular">{t('wallet.checkout.using', { n: shown })}</span>
            <span className="latin font-bold text-success tabular">− {money(redemption.discount)}</span>
          </p>
        </div>
      )}
    </div>
  );
}

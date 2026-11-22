import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HandCoins, MapPin, RotateCcw, ShieldCheck, Truck } from 'lucide-react';
import { COUNTRIES, type ProductDetail } from '@souqly/shared';
import { Select } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { useLang } from '@/lib/catalog';

const CITY_KEY = 'souqly-delivery-city';
const DAY = 86_400_000;

function readCity(): string | null {
  try {
    return localStorage.getItem(CITY_KEY);
  } catch {
    return null;
  }
}

/**
 * Delivery estimate: processing days + 1–2 days within the store's city, 3–5 days elsewhere (D-043).
 * The chosen city is remembered locally.
 */
export function DeliveryEstimate({ product, storeCity }: { product: ProductDetail; storeCity?: string }) {
  const { t } = useTranslation();
  const lang = useLang();
  const [city, setCity] = useState<string>(() => readCity() ?? storeCity ?? COUNTRIES[0].cities[0]);
  const same = !!storeCity && city.toLowerCase() === storeCity.toLowerCase();
  const processing = product.shipping?.processingDays ?? 2;
  const [lo, hi] = same ? [1, 2] : [3, 5];
  const from = new Date(Date.now() + (processing + lo) * DAY);
  const to = new Date(Date.now() + (processing + hi) * DAY);
  const fmt = (d: Date) => formatDate(d, lang, { weekday: 'short', day: 'numeric', month: 'short' });
  const preOrder = product.preOrder?.enabled && product.preOrder.shipsOn;

  const pick = (c: string) => {
    setCity(c);
    try {
      localStorage.setItem(CITY_KEY, c);
    } catch {
      /* ignore */
    }
  };

  const row = 'flex items-start gap-3 py-3';
  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className={`${row} border-b border-border px-4`}>
        <MapPin className="mt-2.5 size-4 shrink-0 text-fg-muted" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-fg-muted">{t('pdp.deliverTo')}</p>
          <Select
            aria-label={t('pdp.deliverTo')}
            value={city}
            onValueChange={pick}
            options={COUNTRIES.flatMap((c) => c.cities.map((ct) => ({ value: ct, label: `${ct}, ${t(`countries.${c.code}`)}` })))}
            className="mt-1 h-9 border-0 bg-transparent px-0 text-sm font-semibold shadow-none hover:border-0 focus:ring-0"
          />
        </div>
      </div>
      <div className={`${row} px-4`}>
        <Truck className="mt-0.5 size-4 shrink-0 text-primary-700" aria-hidden />
        <div className="text-sm">
          <p className="font-semibold text-fg">
            {preOrder
              ? t('pdp.preOrderShips', { date: formatDate(product.preOrder!.shipsOn!, lang) })
              : t('pdp.getItBy', { from: fmt(from), to: fmt(to) })}
          </p>
          <p className="text-xs text-fg-muted">
            {product.freeShipping ? t('pdp.freeDelivery') : t('pdp.standardDelivery')}
            {storeCity && ` · ${same ? t('pdp.sameCity', { city: storeCity }) : t('pdp.shipsFrom', { city: storeCity })}`}
          </p>
        </div>
      </div>
      {product.cod && (
        <div className={`${row} border-t border-border px-4`}>
          <HandCoins className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          <p className="text-sm text-fg">{t('pdp.codAvailable')}</p>
        </div>
      )}
      <div className={`${row} border-t border-border px-4`}>
        <RotateCcw className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden />
        <div className="text-sm">
          <p className="text-fg">{product.returnPolicy?.days ? t('pdp.returnDays', { n: product.returnPolicy.days }) : t('pdp.noReturns')}</p>
          {product.returnPolicy?.note && <p className="text-xs text-fg-muted">{product.returnPolicy.note}</p>}
        </div>
      </div>
      <div className={`${row} border-t border-border px-4`}>
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden />
        <p className="text-sm text-fg">
          {product.warranty && product.warranty.type !== 'none'
            ? t(`pdp.warranty_${product.warranty.type === 'brand' ? 'brand' : 'seller'}`, { period: product.warranty.period })
            : t('pdp.noWarranty')}
        </p>
      </div>
    </div>
  );
}

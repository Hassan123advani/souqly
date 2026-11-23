import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { COUNTRIES, shippingSettingsSchema, type ShippingSettings, type ShippingZone } from '@souqly/shared';
import { getErrorMessage } from '@/api/client';
import { useSaveSellerSettings, useSellerSettings } from '@/api/seller';
import { Alert, Button, ErrorState, FormField, IconButton, Input, Skeleton, Switch } from '@/components/ui';
import { cn } from '@/lib/cn';

const ALL_CITIES = COUNTRIES.flatMap((c) => c.cities as readonly string[]);
type ZoneForm = { name: string; all: boolean; cities: string[]; rate: string; freeAbove: string; etaMin: string; etaMax: string };

const toForm = (z: ShippingZone): ZoneForm => ({
  name: z.name,
  all: z.cities === 'all',
  cities: z.cities === 'all' ? [] : z.cities,
  rate: String(z.rate / 100),
  freeAbove: z.freeAbove !== undefined ? String(z.freeAbove / 100) : '',
  etaMin: String(z.etaDays[0]),
  etaMax: String(z.etaDays[1]),
});
const toZone = (f: ZoneForm): ShippingZone => ({
  name: f.name.trim(),
  cities: f.all ? 'all' : f.cities,
  rate: Math.round(Number(f.rate || 0) * 100),
  freeAbove: f.freeAbove ? Math.round(Number(f.freeAbove) * 100) : undefined,
  etaDays: [Number(f.etaMin || 0), Number(f.etaMax || 0)],
});

export function ShippingTab() {
  const { t } = useTranslation();
  const q = useSellerSettings('shipping');
  const save = useSaveSellerSettings('shipping');
  const [zones, setZones] = useState<ZoneForm[]>([]);
  const [processing, setProcessing] = useState('2');
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (q.data) {
      setZones(q.data.zones.map(toForm));
      setProcessing(String(q.data.processingDays));
    }
  }, [q.data]);

  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (q.isLoading) return <Skeleton className="h-60" />;

  const set = (i: number, patch: Partial<ZoneForm>) => setZones(zones.map((z, j) => (j === i ? { ...z, ...patch } : z)));
  const submit = () => {
    const body: ShippingSettings = { zones: zones.map(toZone), processingDays: Number(processing || 0) };
    const parsed = shippingSettingsSchema.safeParse(body);
    if (!parsed.success) {
      const iss = parsed.error.issues[0]!;
      return setError(`${iss.path.join(' › ')}: ${iss.message}`);
    }
    setError(undefined);
    save.mutate(parsed.data, { onSuccess: () => toast.success(t('seller.common.saved')), onError: (e) => toast.error(getErrorMessage(e)) });
  };

  return (
    <div className="grid gap-5">
      <FormField label={t('seller.shipping.processingDays')} hint={t('seller.shipping.processingHint')} className="max-w-xs">
        <Input inputMode="numeric" value={processing} onChange={(e) => setProcessing(e.target.value)} />
      </FormField>
      {zones.map((z, i) => (
        <fieldset key={i} className="grid gap-3 rounded-lg border border-border p-4">
          <div className="flex items-center gap-2">
            <Input value={z.name} maxLength={60} onChange={(e) => set(i, { name: e.target.value })} aria-label={t('seller.shipping.zoneName')} placeholder={t('seller.shipping.zoneName')} className="h-10 max-w-xs font-semibold" />
            <IconButton label={t('seller.common.remove')} variant="ghost" size="sm" className="ms-auto" disabled={zones.length <= 1} onClick={() => setZones(zones.filter((_, j) => j !== i))}>
              <Trash2 className="size-4" />
            </IconButton>
          </div>
          <Switch checked={z.all} onCheckedChange={(all) => set(i, { all })} label={t('seller.shipping.allCities')} />
          {!z.all && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('seller.shipping.cities')}>
              {ALL_CITIES.map((c) => {
                const on = z.cities.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set(i, { cities: on ? z.cities.filter((x) => x !== c) : [...z.cities, c] })}
                    className={cn('h-8 rounded-pill border px-3 text-xs font-semibold', on ? 'border-primary bg-primary text-white' : 'border-border text-fg hover:border-primary-400')}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <FormField label={t('seller.shipping.rate')}>
              <Input inputMode="decimal" dir="ltr" value={z.rate} onChange={(e) => set(i, { rate: e.target.value })} />
            </FormField>
            <FormField label={t('seller.shipping.freeAbove')} hint={t('seller.common.optional')}>
              <Input inputMode="decimal" dir="ltr" value={z.freeAbove} onChange={(e) => set(i, { freeAbove: e.target.value })} />
            </FormField>
            <FormField label={t('seller.shipping.etaMin')}>
              <Input inputMode="numeric" dir="ltr" value={z.etaMin} onChange={(e) => set(i, { etaMin: e.target.value })} />
            </FormField>
            <FormField label={t('seller.shipping.etaMax')}>
              <Input inputMode="numeric" dir="ltr" value={z.etaMax} onChange={(e) => set(i, { etaMax: e.target.value })} />
            </FormField>
          </div>
        </fieldset>
      ))}
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        {zones.length < 30 && (
          <Button
            variant="outline"
            leftIcon={<Plus className="size-4" />}
            onClick={() => setZones([...zones, { name: '', all: false, cities: [], rate: '200', freeAbove: '', etaMin: '2', etaMax: '5' }])}
          >
            {t('seller.shipping.addZone')}
          </Button>
        )}
        <Button loading={save.isPending} onClick={submit}>
          {t('seller.common.save')}
        </Button>
      </div>
    </div>
  );
}

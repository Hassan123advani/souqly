import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { KeyRound, Plus, Save, Trash2 } from 'lucide-react';
import { adminShippingZonesSchema, adminTaxSettingsSchema, PERMISSIONS } from '@souqly/shared';
import { useAdminGet, useAdminMutation, type PaymentToggles, type ShippingZone, type SystemHealth, type TaxSettings } from '@/api/admin';
import { getErrorMessage } from '@/api/client';
import { useAdminCan } from '@/components/admin/useAdminCan';
import { Alert, Badge, Button, Card, ErrorState, FormField, IconButton, Input, Select, Skeleton, Switch } from '@/components/ui';

const fail = (e: unknown) => toast.error(getErrorMessage(e));

/** Integration key (from system health) needed for each online method; COD and wallet need none. */
const KEY_FOR: Partial<Record<keyof PaymentToggles, string>> = { jazzcash: 'hasJazzCash', easypaisa: 'hasEasyPaisa', stripe: 'hasStripe' };

export function PaymentSettings() {
  const { t } = useTranslation();
  const can = useAdminCan();
  const q = useAdminGet<PaymentToggles>('settings/payment-methods');
  const health = useAdminGet<SystemHealth>('system/health', undefined, { enabled: can(PERMISSIONS.ADMIN_SYSTEM_VIEW) });
  const put = useAdminMutation('put', ['settings']);
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Skeleton className="h-72" />;
  const data = q.data;
  return (
    <Card className="divide-y divide-border">
      {(Object.keys(data) as (keyof PaymentToggles)[]).map((m) => {
        const keyName = KEY_FOR[m];
        const hasKey = keyName ? health.data?.integrations[keyName] : true;
        return (
          <div key={m} className="flex items-center gap-4 px-5 py-4">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-fg">
                {t(`admin.settings.methods.${m}`)}
                {keyName &&
                  (hasKey === undefined ? null : hasKey ? (
                    <Badge size="sm" tone="success">
                      <KeyRound className="size-3" />
                      {t('admin.settings.keysPresent')}
                    </Badge>
                  ) : (
                    <Badge size="sm" tone="warning">{t('admin.settings.noKeys')}</Badge>
                  ))}
              </p>
              <p className="text-sm text-fg-muted">{keyName && hasKey === false ? t('admin.settings.comingSoonHint') : t(`admin.settings.methodsDesc.${m}`)}</p>
            </div>
            <Switch
              checked={data[m]}
              disabled={put.isPending}
              label={<span className="sr-only">{m}</span>}
              onCheckedChange={(v) => put.mutate({ path: 'settings/payment-methods', body: { ...data, [m]: v } }, { onSuccess: () => toast.success(t('admin.common.saved')), onError: fail })}
            />
          </div>
        );
      })}
    </Card>
  );
}

type ZoneDraft = { name: string; cities: string; fee: string; freeAbove: string; etaDays: string };

export function ShippingSettings() {
  const { t } = useTranslation();
  const q = useAdminGet<{ zones: ShippingZone[] }>('settings/shipping-zones');
  const put = useAdminMutation('put', ['settings']);
  const [zones, setZones] = useState<ZoneDraft[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (q.data) setZones(q.data.zones.map((z) => ({ name: z.name, cities: z.cities.join(', '), fee: String(z.fee / 100), freeAbove: z.freeAbove !== undefined ? String(z.freeAbove / 100) : '', etaDays: String(z.etaDays) })));
  }, [q.data]);
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!zones) return <Skeleton className="h-72" />;
  const set = (i: number, p: Partial<ZoneDraft>) => setZones(zones.map((z, j) => (j === i ? { ...z, ...p } : z)));
  function save() {
    const parsed = adminShippingZonesSchema.safeParse({
      zones: zones!.map((z) => ({
        name: z.name,
        cities: z.cities.split(',').map((c) => c.trim()).filter(Boolean),
        fee: Math.round(Number(z.fee || 0) * 100),
        ...(z.freeAbove ? { freeAbove: Math.round(Number(z.freeAbove) * 100) } : {}),
        etaDays: Number(z.etaDays || 0),
      })),
    });
    if (!parsed.success) return setError(`${parsed.error.issues[0]?.path.join('.')}: ${parsed.error.issues[0]?.message}`);
    setError(null);
    put.mutate({ path: 'settings/shipping-zones', body: parsed.data }, { onSuccess: () => toast.success(t('admin.common.saved')), onError: fail });
  }
  return (
    <div className="grid gap-3">
      <Alert tone="info">{t('admin.settings.zonesHint')}</Alert>
      {error && <Alert tone="danger">{error}</Alert>}
      {!zones.length && <Card className="p-8 text-center text-sm text-fg-muted">{t('admin.settings.noZones')}</Card>}
      {zones.map((z, i) => (
        <Card key={i} className="grid gap-3 p-4 md:grid-cols-[180px_1fr_110px_120px_90px_auto] md:items-end">
          <FormField label={t('admin.settings.zoneName')}>
            <Input value={z.name} onChange={(e) => set(i, { name: e.target.value })} />
          </FormField>
          <FormField label={t('admin.settings.cities')}>
            <Input value={z.cities} onChange={(e) => set(i, { cities: e.target.value })} placeholder="Karachi, Hyderabad" />
          </FormField>
          <FormField label={t('admin.settings.fee')}>
            <Input type="number" min={0} value={z.fee} onChange={(e) => set(i, { fee: e.target.value })} />
          </FormField>
          <FormField label={t('admin.settings.freeAbove')}>
            <Input type="number" min={0} value={z.freeAbove} onChange={(e) => set(i, { freeAbove: e.target.value })} />
          </FormField>
          <FormField label={t('admin.settings.eta')}>
            <Input type="number" min={0} max={60} value={z.etaDays} onChange={(e) => set(i, { etaDays: e.target.value })} />
          </FormField>
          <IconButton variant="ghost" label={t('admin.common.remove')} onClick={() => setZones(zones.filter((_, j) => j !== i))}>
            <Trash2 className="size-4" />
          </IconButton>
        </Card>
      ))}
      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="outline" size="sm" leftIcon={<Plus className="size-4" />} onClick={() => setZones([...zones, { name: '', cities: '', fee: '200', freeAbove: '', etaDays: '3' }])}>
          {t('admin.settings.addZone')}
        </Button>
        <Button loading={put.isPending} leftIcon={<Save className="size-4" />} onClick={save}>
          {t('admin.common.saveChanges')}
        </Button>
      </div>
    </div>
  );
}

export function TaxSettingsForm() {
  const { t } = useTranslation();
  const q = useAdminGet<TaxSettings>('settings/tax');
  const put = useAdminMutation('put', ['settings']);
  const [draft, setDraft] = useState<{ display: TaxSettings['display']; rates: { country: string; pct: string }[] } | null>(null);
  useEffect(() => {
    if (q.data) setDraft({ display: q.data.display, rates: q.data.rates.map((r) => ({ country: r.country, pct: String(r.bps / 100) })) });
  }, [q.data]);
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!draft) return <Skeleton className="h-60" />;
  function save() {
    const parsed = adminTaxSettingsSchema.safeParse({ display: draft!.display, rates: draft!.rates.map((r) => ({ country: r.country, bps: Math.round(Number(r.pct || 0) * 100) })) });
    if (!parsed.success) return void toast.error(`${parsed.error.issues[0]?.path.join('.')}: ${parsed.error.issues[0]?.message}`);
    put.mutate({ path: 'settings/tax', body: parsed.data }, { onSuccess: () => toast.success(t('admin.common.saved')), onError: fail });
  }
  return (
    <Card className="grid max-w-2xl gap-4 p-5">
      <FormField label={t('admin.settings.taxDisplay')}>
        <Select
          value={draft.display}
          onValueChange={(v) => setDraft({ ...draft, display: v as TaxSettings['display'] })}
          options={[
            { value: 'inclusive', label: t('admin.settings.inclusive') },
            { value: 'exclusive', label: t('admin.settings.exclusive') },
          ]}
        />
      </FormField>
      <div className="grid gap-2">
        <p className="text-sm font-semibold">{t('admin.settings.rates')}</p>
        {draft.rates.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input dir="ltr" value={r.country} maxLength={2} className="w-20 uppercase" aria-label={t('admin.settings.country')} placeholder="PK" onChange={(e) => setDraft({ ...draft, rates: draft.rates.map((x, j) => (j === i ? { ...x, country: e.target.value.toUpperCase() } : x)) })} />
            <Input type="number" min={0} max={100} step="0.1" value={r.pct} className="w-32" aria-label={t('admin.finance.rate')} endAdornment={<span className="text-sm text-fg-muted">%</span>} onChange={(e) => setDraft({ ...draft, rates: draft.rates.map((x, j) => (j === i ? { ...x, pct: e.target.value } : x)) })} />
            <IconButton variant="ghost" size="sm" label={t('admin.common.remove')} onClick={() => setDraft({ ...draft, rates: draft.rates.filter((_, j) => j !== i) })}>
              <Trash2 className="size-4" />
            </IconButton>
          </div>
        ))}
        <Button variant="outline" size="sm" className="justify-self-start" leftIcon={<Plus className="size-4" />} onClick={() => setDraft({ ...draft, rates: [...draft.rates, { country: '', pct: '' }] })}>
          {t('admin.settings.addRate')}
        </Button>
      </div>
      <Button className="justify-self-end" loading={put.isPending} leftIcon={<Save className="size-4" />} onClick={save}>
        {t('admin.common.saveChanges')}
      </Button>
    </Card>
  );
}

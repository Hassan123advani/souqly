import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Bike, HandCoins } from 'lucide-react';
import { fromMinor, PERMISSIONS, toMinor, type SellerRiderDTO } from '@souqly/shared';
import { getErrorMessage } from '@/api/client';
import { useRiderSettings, useSaveRiderSettings, useSellerRiders, useSettleCod } from '@/api/delivery';
import { Seo } from '@/components/layout/Seo';
import { Avatar, Button, Card, CardHeader, EmptyState, ErrorState, FormField, Input, Modal, SectionHeader, Skeleton } from '@/components/ui';
import { useCan } from '@/components/seller/usePermissions';
import { money } from '@/lib/format';

function FeeCard({ manage }: { manage: boolean }) {
  const { t } = useTranslation();
  const q = useRiderSettings();
  const save = useSaveRiderSettings();
  const [fee, setFee] = useState('');
  useEffect(() => {
    if (q.data) setFee(String(fromMinor(q.data.riderFee)));
  }, [q.data]);
  const value = Number(fee);
  const invalid = fee === '' || !Number.isFinite(value) || value < 0 || value > 10_000;

  return (
    <Card>
      <CardHeader title={t('rider.seller.feeTitle')} description={t('rider.seller.feeHint')} />
      <div className="px-5 pb-5">
        {q.isPending ? (
          <Skeleton className="h-11 w-full" />
        ) : q.isError ? (
          <ErrorState compact error={q.error} onRetry={() => void q.refetch()} />
        ) : (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (invalid) return;
              save.mutate({ riderFee: toMinor(value) }, { onSuccess: () => toast.success(t('rider.seller.feeSaved')), onError: (err) => toast.error(getErrorMessage(err)) });
            }}
          >
            <FormField label={t('rider.seller.feeLabel')} error={invalid && fee !== '' ? t('rider.seller.feeInvalid') : undefined} className="min-w-40 flex-1">
              <Input type="number" inputMode="decimal" min={0} max={10000} step="1" value={fee} disabled={!manage} onChange={(e) => setFee(e.target.value)} startIcon={<span className="text-xs font-bold">Rs</span>} />
            </FormField>
            {manage && (
              <Button type="submit" loading={save.isPending} disabled={invalid}>
                {t('common.saveChanges')}
              </Button>
            )}
          </form>
        )}
      </div>
    </Card>
  );
}

function SettleModal({ rider, onClose }: { rider: SellerRiderDTO | null; onClose: () => void }) {
  const { t } = useTranslation();
  const settle = useSettleCod();
  const [amount, setAmount] = useState('');
  useEffect(() => {
    if (rider) setAmount(String(fromMinor(rider.codOutstanding)));
  }, [rider]);
  const minor = toMinor(Number(amount) || 0);
  const invalid = !rider || minor <= 0 || minor > rider.codOutstanding;
  return (
    <Modal
      open={!!rider}
      onOpenChange={(o) => !o && onClose()}
      title={t('rider.seller.settleTitle', { name: rider?.user.name ?? '' })}
      description={rider ? t('rider.seller.settleBody', { amount: money(rider.codOutstanding) }) : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            loading={settle.isPending}
            disabled={invalid}
            onClick={() =>
              rider &&
              settle.mutate(
                { memberId: rider.memberId, amount: minor },
                {
                  onSuccess: () => {
                    toast.success(t('rider.seller.settled'));
                    onClose();
                  },
                  onError: (e) => toast.error(getErrorMessage(e)),
                },
              )
            }
          >
            {t('rider.seller.settle')}
          </Button>
        </>
      }
    >
      <FormField label={t('rider.seller.amountReceived')} error={amount && invalid ? t('rider.seller.amountInvalid') : undefined}>
        <Input type="number" inputMode="decimal" min={1} step="1" value={amount} onChange={(e) => setAmount(e.target.value)} startIcon={<span className="text-xs font-bold">Rs</span>} />
      </FormField>
    </Modal>
  );
}

export default function SellerRidersPage() {
  const { t } = useTranslation();
  const can = useCan();
  const manage = can(PERMISSIONS.STORE_ORDERS_MANAGE);
  const q = useSellerRiders();
  const [settling, setSettling] = useState<SellerRiderDTO | null>(null);

  return (
    <>
      <Seo title={t('rider.seller.title')} noindex />
      <SectionHeader as="h1" title={t('rider.seller.title')} description={t('rider.seller.subtitle')} />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {q.isPending ? (
            <Card className="space-y-3 p-4" aria-busy>
              {[0, 1, 2].map((k) => (
                <Skeleton key={k} className="h-16 w-full" />
              ))}
            </Card>
          ) : q.isError ? (
            <Card>
              <ErrorState error={q.error} onRetry={() => void q.refetch()} />
            </Card>
          ) : !q.data.length ? (
            <Card>
              <EmptyState
                icon={<Bike />}
                title={t('rider.seller.empty')}
                description={t('rider.seller.emptyBody')}
                action={can(PERMISSIONS.STORE_STAFF_MANAGE) ? <Button to="/seller/staff">{t('rider.seller.addRider')}</Button> : undefined}
              />
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <ul className="divide-y divide-border">
                {q.data.map((r) => (
                  <li key={r.memberId} className="flex flex-wrap items-center gap-3 px-4 py-4">
                    <Avatar name={r.user.name} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-fg">{r.user.name}</p>
                      <p className="text-xs text-fg-muted">
                        {t('rider.seller.stats', { active: r.activeDeliveries, delivered: r.deliveredTotal })} · {t('rider.seller.earnings', { amount: money(r.earnings) })}
                      </p>
                    </div>
                    <div className="text-end">
                      <p className="text-[11px] text-fg-muted">{t('rider.seller.codHeld')}</p>
                      <p className={r.codOutstanding > 0 ? 'text-sm font-extrabold text-accent-800' : 'text-sm font-bold text-fg-muted'} dir="ltr">
                        {money(r.codOutstanding)}
                      </p>
                    </div>
                    {manage && (
                      <Button size="sm" variant="outline" leftIcon={<HandCoins className="size-4" />} disabled={r.codOutstanding <= 0} onClick={() => setSettling(r)}>
                        {t('rider.seller.settle')}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
        <FeeCard manage={manage} />
      </div>
      <SettleModal rider={settling} onClose={() => setSettling(null)} />
    </>
  );
}

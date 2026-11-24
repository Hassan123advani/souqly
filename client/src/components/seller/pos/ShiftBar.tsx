import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Clock, DoorClosed, DoorOpen } from 'lucide-react';
import { useMe } from '@/api/auth';
import { getErrorMessage } from '@/api/client';
import { useCloseShift, useOpenShift, usePosShifts, type PosShift } from '@/api/growth';
import { Badge, Button, FormField, Input, Modal, Textarea } from '@/components/ui';
import { useLang } from '@/lib/catalog';
import { cn } from '@/lib/cn';
import { formatDateTime, money } from '@/lib/format';
import { rupeesToMinor } from '../growth/utils';
import { getMeta, setMeta } from './posDb';
import type { PosEngine } from './usePosEngine';

/** The cashier's open shift (server when online, IndexedDB copy when offline). */
export function useCurrentShift(engine: PosEngine) {
  const { data: me } = useMe();
  const shifts = usePosShifts(engine.online && engine.ready);
  const [cached, setCached] = useState<PosShift | null>(null);
  const fromServer = shifts.data ? (shifts.data.find((s) => s.status === 'open' && s.openedBy === me?.id) ?? null) : undefined;
  useEffect(() => {
    const db = engine.db.current;
    if (!db || !engine.ready) return;
    if (fromServer !== undefined) void setMeta(db, { key: 'shift', value: fromServer }).then(() => setCached(fromServer));
    else void getMeta(db, 'shift').then((s) => setCached(s ?? null));
  }, [engine.db, engine.ready, fromServer]);
  return { shift: fromServer === undefined ? cached : fromServer, history: shifts.data ?? [], loading: shifts.isLoading };
}

export function ShiftBar({ engine, shift }: { engine: PosEngine; shift: PosShift | null }) {
  const { t } = useTranslation();
  const lang = useLang();
  const [dialog, setDialog] = useState<'open' | 'close' | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {shift ? (
        <>
          <Badge tone="success">
            <Clock className="size-3" /> {t('growth.pos.shift.openSince', { at: formatDateTime(shift.openedAt, lang) })}
          </Badge>
          <Button size="sm" variant="outline" leftIcon={<DoorClosed className="size-4" />} disabled={!engine.online} onClick={() => setDialog('close')}>
            {t('growth.pos.shift.close')}
          </Button>
        </>
      ) : (
        <Button size="sm" variant="outline" leftIcon={<DoorOpen className="size-4" />} disabled={!engine.online} onClick={() => setDialog('open')}>
          {t('growth.pos.shift.open')}
        </Button>
      )}
      <OpenShiftDialog open={dialog === 'open'} onClose={() => setDialog(null)} />
      {shift && <CloseShiftDialog open={dialog === 'close'} shift={shift} pending={engine.pendingCount} onClose={() => setDialog(null)} />}
    </div>
  );
}

function OpenShiftDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [cash, setCash] = useState('');
  const mut = useOpenShift();
  const amount = rupeesToMinor(cash);
  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title={t('growth.pos.shift.open')}
      description={t('growth.pos.shift.openHint')}
      footer={
        <Button
          disabled={amount === null}
          loading={mut.isPending}
          onClick={() =>
            mut.mutate(amount ?? 0, {
              onSuccess: () => {
                toast.success(t('growth.pos.shift.opened'));
                setCash('');
                onClose();
              },
              onError: (e) => toast.error(getErrorMessage(e)),
            })
          }
        >
          {t('growth.pos.shift.open')}
        </Button>
      }
    >
      <FormField label={t('growth.pos.shift.openingCash')}>
        <Input inputMode="decimal" dir="ltr" autoFocus value={cash} onChange={(e) => setCash(e.target.value)} />
      </FormField>
    </Modal>
  );
}

function CloseShiftDialog({ open, shift, pending, onClose }: { open: boolean; shift: PosShift; pending: number; onClose: () => void }) {
  const { t } = useTranslation();
  const [cash, setCash] = useState('');
  const [note, setNote] = useState('');
  const [closed, setClosed] = useState<PosShift | null>(null);
  const mut = useCloseShift();
  const amount = rupeesToMinor(cash);
  const done = () => {
    setClosed(null);
    setCash('');
    setNote('');
    onClose();
  };
  return (
    <Modal
      open={open || !!closed}
      onOpenChange={(o) => !o && done()}
      size="sm"
      title={closed ? t('growth.pos.shift.summary') : t('growth.pos.shift.close')}
      description={closed ? undefined : t('growth.pos.shift.closeHint')}
      footer={
        closed ? (
          <Button onClick={done}>{t('common.close')}</Button>
        ) : (
          <Button
            disabled={amount === null}
            loading={mut.isPending}
            onClick={() =>
              mut.mutate(
                { id: shift.id, countedCash: amount ?? 0, note: note.trim() || undefined },
                { onSuccess: (s) => setClosed(s), onError: (e) => toast.error(getErrorMessage(e)) },
              )
            }
          >
            {t('growth.pos.shift.close')}
          </Button>
        )
      }
    >
      {closed ? (
        <dl className="grid gap-2 text-sm">
          {(
            [
              ['openingCash', closed.openingCash],
              ['cashSales', closed.cashSales],
              ['expectedCash', closed.expectedCash],
              ['countedCash', closed.countedCash],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="flex justify-between">
              <dt className="text-fg-muted">{t(`growth.pos.shift.${k}`)}</dt>
              <dd className="font-semibold" dir="ltr">
                {money(v ?? 0)}
              </dd>
            </div>
          ))}
          <div className="flex justify-between border-t border-border pt-2">
            <dt className="font-bold">{t('growth.pos.shift.variance')}</dt>
            <dd className={cn('font-extrabold', (closed.variance ?? 0) < 0 ? 'text-danger' : (closed.variance ?? 0) > 0 ? 'text-warning' : 'text-success')} dir="ltr">
              {money(closed.variance ?? 0)}
            </dd>
          </div>
          <p className="text-xs text-fg-muted">{t('growth.pos.shift.salesN', { count: closed.salesCount ?? 0, total: money(closed.salesTotal ?? 0) })}</p>
        </dl>
      ) : (
        <div className="grid gap-3">
          {pending > 0 && <p className="text-sm font-semibold text-warning">{t('growth.pos.shift.pendingWarn', { count: pending })}</p>}
          <FormField label={t('growth.pos.shift.countedCash')}>
            <Input inputMode="decimal" dir="ltr" autoFocus value={cash} onChange={(e) => setCash(e.target.value)} />
          </FormField>
          <FormField label={t('growth.pos.shift.note')} hint={t('seller.common.optional')}>
            <Textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </FormField>
        </div>
      )}
    </Modal>
  );
}

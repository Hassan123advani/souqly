import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Banknote, CreditCard, Smartphone, Split } from 'lucide-react';
import { Button, FormField, Input, Modal } from '@/components/ui';
import { cn } from '@/lib/cn';
import { money } from '@/lib/format';
import { rupeesToMinor } from '../growth/utils';
import { paymentCheck, type Payment } from './cart';

type Mode = 'cash' | 'card' | 'wallet' | 'split';
const MODES: { mode: Mode; icon: typeof Banknote }[] = [
  { mode: 'cash', icon: Banknote },
  { mode: 'card', icon: CreditCard },
  { mode: 'wallet', icon: Smartphone },
  { mode: 'split', icon: Split },
];

/** Quick cash amounts: exact, then the next round notes above the total (minor units). */
function quickCash(total: number): number[] {
  const out = new Set<number>([total]);
  for (const note of [50_000, 100_000, 500_000]) out.add(Math.ceil(total / note) * note);
  return [...out].filter((v) => v >= total).sort((a, b) => a - b).slice(0, 4);
}

export function PaymentDialog({
  open,
  total,
  onClose,
  onPay,
  busy,
}: {
  open: boolean;
  total: number;
  onClose: () => void;
  onPay: (payments: Payment[], customer: { phone?: string; name?: string } | undefined) => void;
  busy?: boolean;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('cash');
  const [tendered, setTendered] = useState('');
  const [split, setSplit] = useState({ cash: '', card: '', wallet: '' });
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setMode('cash');
      setTendered('');
      setSplit({ cash: '', card: '', wallet: '' });
      setPhone('');
      setName('');
    }
  }

  const payments: Payment[] =
    mode === 'cash'
      ? [{ method: 'cash', amount: tendered ? (rupeesToMinor(tendered) ?? 0) : total }]
      : mode === 'split'
        ? (['cash', 'card', 'wallet'] as const).map((m) => ({ method: m, amount: rupeesToMinor(split[m]) ?? 0 })).filter((p) => p.amount > 0)
        : [{ method: mode, amount: total }];
  const check = paymentCheck(total, payments.length ? payments : [{ method: 'cash', amount: 0 }]);
  const valid = payments.length > 0 && check.valid;

  const confirm = () => {
    if (!valid) return;
    const customer = phone.trim() || name.trim() ? { ...(phone.trim() ? { phone: phone.trim() } : {}), ...(name.trim() ? { name: name.trim() } : {}) } : undefined;
    onPay(payments.length ? payments : [{ method: 'cash', amount: 0 }], customer);
  };

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t('growth.pos.pay.title')}
      description={t('growth.pos.pay.total', { amount: money(total) })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('seller.common.cancel')}
          </Button>
          <Button onClick={confirm} disabled={!valid} loading={busy}>
            {t('growth.pos.pay.complete')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label={t('growth.pos.pay.method')}>
          {MODES.map(({ mode: m, icon: Icon }) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                'flex flex-col items-center gap-1 rounded-md border p-3 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring',
                mode === m ? 'border-primary bg-primary-50 text-primary-800' : 'border-border text-fg-muted hover:bg-surface-2',
              )}
            >
              <Icon className="size-5" />
              {t(`growth.pos.methods.${m}`)}
            </button>
          ))}
        </div>

        {mode === 'cash' && (
          <>
            <FormField label={t('growth.pos.pay.tendered')} hint={t('growth.pos.pay.tenderedHint')}>
              <Input inputMode="decimal" dir="ltr" inputSize="lg" autoFocus value={tendered} onChange={(e) => setTendered(e.target.value)} placeholder={String(total / 100)} />
            </FormField>
            <div className="flex flex-wrap gap-2">
              {quickCash(total).map((v) => (
                <Button key={v} size="sm" variant="outline" onClick={() => setTendered(String(v / 100))}>
                  <span dir="ltr">{money(v)}</span>
                </Button>
              ))}
            </div>
          </>
        )}
        {mode === 'split' && (
          <div className="grid gap-3 sm:grid-cols-3">
            {(['cash', 'card', 'wallet'] as const).map((m) => (
              <FormField key={m} label={t(`growth.pos.methods.${m}`)}>
                <Input inputMode="decimal" dir="ltr" value={split[m]} onChange={(e) => setSplit((s) => ({ ...s, [m]: e.target.value }))} />
              </FormField>
            ))}
          </div>
        )}
        {(mode === 'card' || mode === 'wallet') && <p className="text-sm text-fg-muted">{t('growth.pos.pay.exact', { amount: money(total) })}</p>}

        <dl className="grid grid-cols-3 gap-2 rounded-md bg-surface-2 p-3 text-center">
          <div>
            <dt className="text-xs text-fg-muted">{t('growth.pos.pay.paid')}</dt>
            <dd className="font-bold text-fg" dir="ltr">
              {money(check.paid)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-fg-muted">{t('growth.pos.pay.due')}</dt>
            <dd className={cn('font-bold', check.due ? 'text-danger' : 'text-fg')} dir="ltr">
              {money(check.due)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-fg-muted">{t('growth.pos.pay.change')}</dt>
            <dd className="text-lg font-extrabold text-success" dir="ltr">
              {money(check.change)}
            </dd>
          </div>
        </dl>
        {check.paid >= total && check.change > check.cash && <p className="text-sm font-semibold text-danger">{t('growth.pos.pay.changeCashOnly')}</p>}

        <details className="rounded-md border border-border p-3">
          <summary className="cursor-pointer text-sm font-semibold text-fg">{t('growth.pos.pay.customer')}</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <FormField label={t('growth.pos.pay.phone')}>
              <Input type="tel" dir="ltr" maxLength={20} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </FormField>
            <FormField label={t('growth.pos.pay.name')}>
              <Input maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
            </FormField>
          </div>
        </details>
      </div>
    </Modal>
  );
}

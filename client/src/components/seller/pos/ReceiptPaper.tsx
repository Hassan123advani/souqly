import { useTranslation } from 'react-i18next';
import { useLang } from '@/lib/catalog';
import { cn } from '@/lib/cn';
import { formatDateTime, money } from '@/lib/format';
import { optionText } from './cart';

export type ReceiptData = {
  store: { name: string; address?: string; phone?: string | null };
  number: string;
  at: string;
  items: { title: string; options: Record<string, string>; qty: number; price: number; lineTotal: number }[];
  subtotal: number;
  discount: number;
  total: number;
  payments: { method: string; amount: number }[];
  change: number;
  customer?: { phone?: string; name?: string } | null;
};

/** Thermal-style receipt (58 mm or 80 mm wide). Monospace, high contrast, prints in black. */
export function ReceiptPaper({ r, width = 80, qr, note, id }: { r: ReceiptData; width?: 58 | 80; qr?: string | null; note?: string; id?: string }) {
  const { t } = useTranslation();
  const lang = useLang();
  return (
    <div
      id={id}
      className={cn('mx-auto bg-white px-3 py-4 font-mono text-black', width === 58 ? 'w-[58mm] text-[10px]' : 'w-[80mm] text-[12px]')}
      style={{ lineHeight: 1.35 }}
    >
      <div className="text-center">
        <p className="text-[1.3em] font-bold">{r.store.name}</p>
        {r.store.address && <p>{r.store.address}</p>}
        {r.store.phone && <p dir="ltr">{r.store.phone}</p>}
      </div>
      <hr className="my-2 border-dashed border-black" />
      <p>
        {t('growth.pos.receipt.no')}: <span dir="ltr">{r.number}</span>
      </p>
      <p>{formatDateTime(r.at, lang)}</p>
      {r.customer?.name && <p>{r.customer.name}</p>}
      <hr className="my-2 border-dashed border-black" />
      <ul className="grid gap-1">
        {r.items.map((i, idx) => (
          <li key={idx}>
            <p className="break-words font-semibold">
              {i.title}
              {Object.keys(i.options).length > 0 && ` (${optionText(i.options)})`}
            </p>
            <p className="flex justify-between gap-2" dir="ltr">
              <span>
                {i.qty} x {money(i.price)}
              </span>
              <span>{money(i.lineTotal)}</span>
            </p>
          </li>
        ))}
      </ul>
      <hr className="my-2 border-dashed border-black" />
      <Row label={t('growth.pos.subtotal')} value={money(r.subtotal)} />
      {r.discount > 0 && <Row label={t('growth.pos.discount')} value={`-${money(r.discount)}`} />}
      <Row label={t('growth.pos.total')} value={money(r.total)} bold />
      {r.payments.map((p, i) => (
        <Row key={i} label={t(`growth.pos.methods.${p.method}`, { defaultValue: p.method })} value={money(p.amount)} />
      ))}
      {r.change > 0 && <Row label={t('growth.pos.pay.change')} value={money(r.change)} />}
      <hr className="my-2 border-dashed border-black" />
      {qr && <img src={qr} alt={t('growth.pos.receipt.qrAlt')} className="mx-auto size-28" />}
      <p className="mt-1 text-center">{note ?? t('growth.pos.receipt.thanks')}</p>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <p className={cn('flex justify-between gap-2', bold && 'text-[1.2em] font-bold')}>
      <span>{label}</span>
      <span dir="ltr">{value}</span>
    </p>
  );
}

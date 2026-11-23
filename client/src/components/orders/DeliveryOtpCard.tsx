import { useTranslation } from 'react-i18next';
import { ShieldCheck } from 'lucide-react';

/** Delivery code the buyer gives the rider on hand-over. */
export function DeliveryOtpCard({ otp }: { otp: string }) {
  const { t } = useTranslation();
  return (
    <section
      aria-labelledby="otp-title"
      className="rounded-lg border border-primary-100 bg-gradient-to-br from-primary-50 to-surface p-5 shadow-card dark:from-primary-950/40"
    >
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-5 text-primary-700" aria-hidden />
        <h2 id="otp-title" className="text-sm font-bold text-fg">
          {t('orders.otpTitle')}
        </h2>
      </div>
      <p className="latin mt-3 flex gap-2" dir="ltr" aria-label={t('orders.otpAria', { code: otp.split('').join(' ') })}>
        {otp.split('').map((d, i) => (
          <span
            key={i}
            className="grid h-14 w-12 place-items-center rounded-md border border-primary-200 bg-surface text-3xl font-extrabold tabular text-primary-800 shadow-sm"
            aria-hidden
          >
            {d}
          </span>
        ))}
      </p>
      <p className="mt-3 text-xs font-medium text-fg-muted">{t('orders.otpHint')}</p>
    </section>
  );
}

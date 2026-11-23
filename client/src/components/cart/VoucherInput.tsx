import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { TicketPercent, X } from 'lucide-react';
import type { AppliedVoucherDTO } from '@souqly/shared';
import { useApplyVoucher, useRemoveVoucher } from '@/api/cart';
import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import { money } from '@/lib/format';
import { featureError } from './errors';

/** Applied voucher pill; invalid ones (e.g. below min spend) are shown muted with the reason. */
export function VoucherChip({ voucher, onRemove, removing }: { voucher: AppliedVoucherDTO; onRemove?: () => void; removing?: boolean }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-pill border border-dashed px-2.5 py-1 text-xs font-semibold',
        voucher.valid ? 'border-success/50 bg-success-soft text-success' : 'border-warning/50 bg-warning-soft text-warning',
      )}
    >
      <TicketPercent className="size-3.5 shrink-0" aria-hidden />
      <span className="latin">{voucher.code}</span>
      <span className="truncate font-medium">
        {voucher.valid
          ? voucher.type === 'free_shipping'
            ? t('cart.voucherFreeShipping')
            : t('cart.voucherSaves', { amount: money(voucher.discount) })
          : t(`cart.voucherReason.${voucher.reason ?? 'NOT_ELIGIBLE'}`, { defaultValue: t('cart.voucherReason.NOT_ELIGIBLE') })}
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={removing}
          className="-me-1 grid size-5 place-items-center rounded-full hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10"
          aria-label={t('cart.removeVoucher', { code: voucher.code })}
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  );
}

/** Code input + applied chip. The server decides whether a code is a platform or store voucher. */
export function VoucherInput({ applied, placeholder, className }: { applied?: AppliedVoucherDTO; placeholder: string; className?: string }) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const apply = useApplyVoucher();
  const remove = useRemoveVoucher();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c.length < 3) return setError(t('cart.voucherErrors.INVALID'));
    setError(null);
    apply.mutate(c, {
      onSuccess: () => {
        setCode('');
        toast.success(t('cart.voucherApplied', { code: c }));
      },
      onError: (err) => setError(featureError(err, 'cart.voucherErrors')),
    });
  };

  return (
    <div className={cn('space-y-2', className)}>
      {applied && <VoucherChip voucher={applied} removing={remove.isPending} onRemove={() => remove.mutate(applied.code)} />}
      <form onSubmit={submit} className="flex gap-2">
        <input
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            if (error) setError(null);
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          aria-invalid={!!error || undefined}
          maxLength={32}
          className="latin h-9 min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-3 text-sm uppercase placeholder:normal-case placeholder:text-fg-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring aria-[invalid=true]:border-danger"
        />
        <Button type="submit" size="sm" variant="outline" loading={apply.isPending} disabled={!code.trim()}>
          {t('cart.apply')}
        </Button>
      </form>
      {error && (
        <p className="text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

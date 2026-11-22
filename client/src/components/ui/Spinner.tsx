import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';

export function Spinner({ className, label }: { className?: string; label?: string }) {
  const { t } = useTranslation();
  return (
    <svg
      className={cn('size-5 animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label={label ?? t('common.loading')}
    >
      <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeOpacity=".2" strokeWidth="3" />
      <path d="M21.5 12A9.5 9.5 0 0 0 12 2.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Centered spinner for whole-page / route loading. */
export function PageSpinner() {
  return (
    <div className="grid min-h-[40vh] place-items-center text-primary-700">
      <Spinner className="size-8" />
    </div>
  );
}

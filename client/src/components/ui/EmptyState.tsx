import type { ReactNode } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { Button } from './Button';
import { getErrorMessage } from '@/api/client';

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn('flex flex-col items-center text-center', compact ? 'gap-2 py-8' : 'gap-3 px-4 py-14', className)}>
      {icon && (
        <div className="relative mb-1">
          {/* Arch-shaped halo echoes the logo mark. */}
          <div className="grid size-16 place-items-center rounded-t-[2rem] rounded-b-xl bg-primary-50 text-primary-700 ring-1 ring-primary-100 [&_svg]:size-7">
            {icon}
          </div>
          <span className="absolute -end-1 -top-1 size-3 rounded-full bg-accent ring-4 ring-bg" aria-hidden />
        </div>
      )}
      <h3 className={cn('font-bold text-fg', compact ? 'text-base' : 'text-lg')}>{title}</h3>
      {description && <p className="max-w-md text-sm text-fg-muted">{description}</p>}
      {action && <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function ErrorState({
  error,
  title,
  onRetry,
  className,
  compact,
}: {
  error?: unknown;
  title?: ReactNode;
  onRetry?: () => void;
  className?: string;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center gap-3 text-center', compact ? 'py-8' : 'px-4 py-14', className)}
    >
      <div className="grid size-14 place-items-center rounded-full bg-danger-soft text-danger">
        <AlertTriangle className="size-6" />
      </div>
      <h3 className="text-base font-bold text-fg">{title ?? t('errors.title')}</h3>
      <p className="max-w-md text-sm text-fg-muted">{error ? getErrorMessage(error) : t('errors.GENERIC')}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} leftIcon={<RotateCw className="size-4" />}>
          {t('common.retry')}
        </Button>
      )}
    </div>
  );
}

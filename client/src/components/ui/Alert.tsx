import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

const tones = {
  info: { cls: 'border-info/25 bg-info-soft', icon: Info, iconCls: 'text-info' },
  success: { cls: 'border-success/25 bg-success-soft', icon: CheckCircle2, iconCls: 'text-success' },
  warning: { cls: 'border-warning/30 bg-warning-soft', icon: AlertTriangle, iconCls: 'text-warning' },
  danger: { cls: 'border-danger/25 bg-danger-soft', icon: XCircle, iconCls: 'text-danger' },
};

export function Alert({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: keyof typeof tones;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const { cls, icon: Icon, iconCls } = tones[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-md border p-3.5 text-sm', cls, className)}>
      <Icon className={cn('mt-0.5 size-[18px] shrink-0', iconCls)} aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold text-fg">{title}</p>}
        {children && <div className={cn('text-fg-muted', title && 'mt-0.5')}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

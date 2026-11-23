import { useTranslation } from 'react-i18next';
import { Badge, type BadgeTone } from '@/components/ui';

const TONES: Record<string, BadgeTone> = {
  approved: 'success',
  published: 'success',
  active: 'success',
  delivered: 'success',
  paid: 'success',
  resolved: 'success',
  connected: 'success',
  completed: 'success',
  pending: 'warning',
  pending_review: 'warning',
  pending_payment: 'warning',
  requested: 'warning',
  open: 'warning',
  reviewing: 'warning',
  placed: 'warning',
  return_requested: 'warning',
  escalated: 'warning',
  draft: 'neutral',
  rejected: 'danger',
  suspended: 'danger',
  blocked: 'danger',
  cancelled: 'danger',
  failed: 'danger',
  disconnected: 'danger',
  hidden: 'danger',
  deleted: 'danger',
  urgent: 'danger',
  high: 'warning',
  confirmed: 'info',
  packed: 'info',
  shipped: 'info',
  out_for_delivery: 'info',
  refunded: 'info',
  returned: 'info',
  closed: 'neutral',
  live: 'success',
  scheduled: 'info',
  ended: 'neutral',
  inactive: 'neutral',
  dismissed: 'neutral',
};

/** Translated, colour-coded status chip used by every admin list. */
export function StatusPill({ status, className }: { status: string | null | undefined; className?: string }) {
  const { t } = useTranslation();
  if (!status) return null;
  return (
    <Badge tone={TONES[status] ?? 'neutral'} size="sm" className={className}>
      <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden />
      {t(`admin.status.${status}`, { defaultValue: status.replace(/_/g, ' ') })}
    </Badge>
  );
}

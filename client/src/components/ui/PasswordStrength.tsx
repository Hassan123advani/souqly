import { passwordStrength } from '@souqly/shared';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';

const COLORS = ['bg-ink-300', 'bg-danger', 'bg-warning', 'bg-primary-500', 'bg-success'];
const LABELS = ['form.strength.0', 'form.strength.1', 'form.strength.2', 'form.strength.3', 'form.strength.4'];

export function PasswordStrength({ password, className }: { password: string; className?: string }) {
  const { t } = useTranslation();
  const score = password ? Math.max(passwordStrength(password), 1) : 0;
  return (
    <div className={cn('flex items-center gap-3', className)} aria-live="polite">
      <div className="flex flex-1 gap-1" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={cn('h-1.5 flex-1 rounded-pill transition-colors duration-250', i <= score ? COLORS[score] : 'bg-surface-3')}
          />
        ))}
      </div>
      <span className="min-w-16 text-end text-xs font-medium text-fg-muted">
        {password ? t(LABELS[score]) : t('form.strength.hint')}
      </span>
    </div>
  );
}

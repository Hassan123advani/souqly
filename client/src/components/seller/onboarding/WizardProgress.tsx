import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Step indicator: numbered circles with labels underneath on desktop, "Step n of N" + bar on mobile. */
export function WizardProgress({ step, steps }: { step: number; steps: string[] }) {
  const { t } = useTranslation();
  const pct = Math.round(((step - 1) / (steps.length - 1)) * 100);
  return (
    <nav aria-label={t('seller.wizard.progress')}>
      <div className="sm:hidden">
        <p className="text-xs font-semibold text-fg-muted">
          {t('seller.wizard.stepOf', { n: step, total: steps.length })} · <span className="text-fg">{steps[step - 1]}</span>
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-pill bg-surface-2">
          <div className="h-full rounded-pill bg-primary transition-[width] duration-400 ease-souq" style={{ width: `${Math.max(pct, 4)}%` }} />
        </div>
      </div>
      <ol className="hidden sm:flex">
        {steps.map((label, i) => {
          const n = i + 1;
          const state = n < step ? 'done' : n === step ? 'current' : 'todo';
          return (
            <li key={label} className="relative flex flex-1 flex-col items-center gap-1.5 px-1" aria-current={state === 'current' ? 'step' : undefined}>
              {n < steps.length && (
                <span aria-hidden className={cn('absolute top-3.5 h-0.5 w-full start-1/2', n < step ? 'bg-primary' : 'bg-border')} />
              )}
              <span
                className={cn(
                  'relative grid size-7 place-items-center rounded-full text-xs font-bold',
                  state === 'done' && 'bg-primary text-white',
                  state === 'current' && 'bg-accent text-ink-900 ring-4 ring-accent-100',
                  state === 'todo' && 'bg-surface-2 text-fg-muted',
                )}
              >
                {state === 'done' ? <Check className="size-4" /> : n}
              </span>
              <span className={cn('text-center text-[11px] font-semibold leading-tight', state === 'todo' ? 'text-fg-muted' : 'text-fg')}>{label}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

import { useTranslation } from 'react-i18next';
import type { SellerDashboard } from '@souqly/shared';

/** Semi-circle gauge (SVG) + factor bars. Factor values are 0..1. */
export function HealthGauge({ health }: { health: SellerDashboard['healthScore'] }) {
  const { t } = useTranslation();
  const score = Math.max(0, Math.min(100, health.score));
  const color = score >= 80 ? 'rgb(var(--success))' : score >= 60 ? 'rgb(var(--warning))' : 'rgb(var(--danger))';
  const r = 52;
  const len = Math.PI * r;
  return (
    <div className="grid gap-4">
      <div className="relative mx-auto w-48">
        <svg viewBox="0 0 120 68" className="w-full" role="img" aria-label={t('seller.dash.healthAria', { score })}>
          <path d="M8 62 A52 52 0 0 1 112 62" fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" className="text-surface-2" />
          <path
            d="M8 62 A52 52 0 0 1 112 62"
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${(len * score) / 100} ${len}`}
            className="transition-[stroke-dasharray] duration-400"
          />
        </svg>
        <div className="absolute inset-x-0 bottom-0 text-center">
          <p className="text-3xl font-extrabold text-fg">{score}</p>
          <p className="text-xs text-fg-muted">{t(score >= 80 ? 'seller.dash.healthGood' : score >= 60 ? 'seller.dash.healthOk' : 'seller.dash.healthLow')}</p>
        </div>
      </div>
      <ul className="grid gap-2.5">
        {health.factors.map((f) => (
          <li key={f.key}>
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-fg">{t(`seller.dash.factors.${f.key}`, f.key)}</span>
              <span className="text-fg-muted" dir="ltr">
                {Math.round(f.value * 100)}% · ×{f.weight}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-pill bg-surface-2">
              <div className="h-full rounded-pill bg-primary" style={{ width: `${Math.round(f.value * 100)}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

/** Flash-sale style countdown. Calls `onDone` once when it reaches zero. */
export function Countdown({ to, onDone, className }: { to: string | number | Date; onDone?: () => void; className?: string }) {
  const { t } = useTranslation();
  const target = new Date(to).getTime();
  const [now, setNow] = useState(() => Date.now());
  const left = target - now;
  const finished = left <= 0;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    if (finished) {
      doneRef.current?.();
      return;
    }
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [finished]);
  const p = parts(left);
  const cells: [number, string][] = [
    ...(p.d > 0 ? ([[p.d, t('countdown.d')]] as [number, string][]) : []),
    [p.h, t('countdown.h')],
    [p.m, t('countdown.m')],
    [p.s, t('countdown.s')],
  ];
  return (
    <span className={cn('latin inline-flex items-center gap-1', className)} dir="ltr" role="timer" aria-live="off">
      {cells.map(([n, label], i) => (
        <span key={label} className="inline-flex items-center gap-1">
          {i > 0 && <span className="font-bold text-sale-600">:</span>}
          <span className="grid min-w-8 place-items-center rounded-md bg-ink-900 px-1.5 py-1 text-sm font-bold text-ink-50 tabular">
            {String(n).padStart(2, '0')}
            <span className="sr-only">{label}</span>
          </span>
        </span>
      ))}
    </span>
  );
}

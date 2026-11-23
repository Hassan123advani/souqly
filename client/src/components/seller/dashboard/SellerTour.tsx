import { useEffect, useLayoutEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useSellerPrefs } from '../useSellerPrefs';

const STEPS = ['dashboard', 'orders', 'products', 'inventory', 'store', 'checklist'] as const;

type Pos = { top: number; left: number; side: 'end' | 'below' } | null;

/**
 * First-visit tour: a small popover pointing at sidebar items (`data-tour`). Steps whose anchor is
 * missing (no permission / mobile drawer closed) are shown centred. Dismissal is persisted.
 */
export function SellerTour() {
  const { t, i18n } = useTranslation();
  const { tourDone, setTourDone } = useSellerPrefs();
  const desktop = useMediaQuery('(min-width: 1024px)');
  const [i, setI] = useState(0);
  const [pos, setPos] = useState<Pos>(null);
  const step = STEPS[i]!;
  const rtl = i18n.dir() === 'rtl';

  useLayoutEffect(() => {
    if (tourDone) return;
    const el = document.querySelector<HTMLElement>(`[data-tour="${step}"]`);
    const r = el?.getBoundingClientRect();
    if (!el || !r || r.width === 0) return setPos(null);
    el.scrollIntoView({ block: 'nearest' });
    if (step === 'checklist' || !desktop) setPos({ top: r.bottom + window.scrollY + 8, left: rtl ? r.right - 300 : r.left, side: 'below' });
    else setPos({ top: r.top + window.scrollY - 4, left: rtl ? r.left - 312 : r.right + 12, side: 'end' });
  }, [step, tourDone, desktop, rtl]);

  useEffect(() => {
    if (tourDone) return;
    const el = document.querySelector<HTMLElement>(`[data-tour="${step}"]`);
    el?.classList.add('ring-2', 'ring-accent', 'ring-offset-2', 'ring-offset-bg');
    return () => el?.classList.remove('ring-2', 'ring-accent', 'ring-offset-2', 'ring-offset-bg');
  }, [step, tourDone]);

  if (tourDone) return null;
  const last = i === STEPS.length - 1;
  return (
    <div
      role="dialog"
      aria-label={t('seller.tour.label')}
      className="z-40 w-[300px] max-w-[calc(100vw-2rem)] animate-fade-in rounded-lg border border-border bg-surface p-4 shadow-pop"
      style={pos ? { position: 'absolute', top: pos.top, left: Math.max(16, pos.left) } : { position: 'fixed', bottom: 88, insetInlineEnd: 16 }}
    >
      <p className="text-[11px] font-bold uppercase tracking-wide text-accent-700">{t('seller.tour.step', { n: i + 1, total: STEPS.length })}</p>
      <p className="mt-1 text-sm font-bold text-fg">{t(`seller.tour.${step}.title`)}</p>
      <p className="mt-1 text-sm text-fg-muted">{t(`seller.tour.${step}.body`)}</p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <Button size="sm" variant="ghost" onClick={() => setTourDone(true)}>
          {t('seller.tour.skip')}
        </Button>
        <Button size="sm" onClick={() => (last ? setTourDone(true) : setI(i + 1))}>
          {last ? t('seller.tour.finish') : t('seller.common.next')}
        </Button>
      </div>
    </div>
  );
}

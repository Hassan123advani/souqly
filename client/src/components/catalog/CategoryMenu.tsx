import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, ChevronDown, ChevronRight, LayoutGrid } from 'lucide-react';
import { ErrorState, IconButton, Sheet, Skeleton } from '@/components/ui';
import { useCategoryTree } from '@/api/catalog';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/cn';
import { useLocalized } from '@/lib/catalog';
import { CategoryIcon } from './CategoryIcon';
import { CategoryBrowser } from './CategoryBrowser';

/** Moves focus among `[data-menu-item]` links inside `root`. */
function focusSibling(root: HTMLElement | null, selector: string, current: Element, delta: number) {
  if (!root) return;
  const items = Array.from(root.querySelectorAll<HTMLElement>(selector));
  const i = items.indexOf(current as HTMLElement);
  const next = items[(i + delta + items.length) % items.length];
  next?.focus();
}

function MegaPanel({ id, onClose, buttonRef }: { id: string; onClose: () => void; buttonRef: React.RefObject<HTMLButtonElement> }) {
  const { t } = useTranslation();
  const localized = useLocalized();
  const { data, isLoading, error, refetch } = useCategoryTree();
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
  const into = rtl ? 'ArrowLeft' : 'ArrowRight';
  const back = rtl ? 'ArrowRight' : 'ArrowLeft';

  function onListKey(e: KeyboardEvent<HTMLUListElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      focusSibling(listRef.current, '[data-top]', document.activeElement!, e.key === 'ArrowDown' ? 1 : -1);
    } else if (e.key === into) {
      e.preventDefault();
      subRef.current?.querySelector<HTMLElement>('[data-sub]')?.focus();
    }
  }
  function onSubKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      focusSibling(subRef.current, '[data-sub]', document.activeElement!, e.key === 'ArrowDown' ? 1 : -1);
    } else if (e.key === back) {
      e.preventDefault();
      listRef.current?.querySelectorAll<HTMLElement>('[data-top]')[active]?.focus();
    }
  }

  const cat = data?.[active];
  return (
    <div
      id={id}
      className="absolute inset-x-0 top-full z-50 border-b border-border bg-surface shadow-pop animate-fade-in"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
          buttonRef.current?.focus();
        }
      }}
    >
      <div className="mx-auto grid w-full max-w-[1320px] grid-cols-[280px_1fr] px-8">
        {error ? (
          <ErrorState className="col-span-2" compact error={error} onRetry={() => refetch()} />
        ) : isLoading || !data ? (
          <>
            <div className="space-y-2 border-e border-border py-4 pe-4">
              {Array.from({ length: 9 }).map((_, i) => (
                <Skeleton key={i} className="h-9" />
              ))}
            </div>
            <div className="grid grid-cols-4 gap-4 p-6">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          </>
        ) : (
          <>
            <ul ref={listRef} onKeyDown={onListKey} className="max-h-[70vh] overflow-y-auto border-e border-border py-3 pe-3" aria-label={t('nav.categories')}>
              {data.map((c, i) => (
                <li key={c.id}>
                  <Link
                    data-top
                    to={`/c/${c.slug}`}
                    onClick={onClose}
                    onMouseEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    aria-current={i === active ? 'true' : undefined}
                    className={cn(
                      'flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors',
                      i === active ? 'bg-primary-50 text-primary-800' : 'text-fg hover:bg-surface-2',
                    )}
                  >
                    <CategoryIcon name={c.icon} className="size-4 shrink-0 opacity-80" />
                    <span className="flex-1 truncate">{localized(c.name)}</span>
                    {c.children.length > 0 && <ChevronRight className="flip-rtl size-4 opacity-50" aria-hidden />}
                  </Link>
                </li>
              ))}
            </ul>
            {cat && (
              <div ref={subRef} onKeyDown={onSubKey} className="min-h-[320px] p-6" aria-live="polite">
                <div className="mb-5 flex items-center justify-between gap-4">
                  <h2 className="flex items-center gap-3 text-lg font-extrabold text-fg">
                    <span
                      className="grid size-10 place-items-center rounded-t-[1.25rem] rounded-b-md text-white"
                      style={{ background: cat.color ?? 'rgb(var(--primary))' }}
                    >
                      <CategoryIcon name={cat.icon} className="size-5" />
                    </span>
                    {localized(cat.name)}
                  </h2>
                  <Link
                    data-sub
                    to={`/c/${cat.slug}`}
                    onClick={onClose}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:underline"
                  >
                    {t('catalog.viewAllIn', { name: localized(cat.name) })}
                    <ArrowRight className="flip-rtl size-4" aria-hidden />
                  </Link>
                </div>
                {cat.children.length ? (
                  <ul className="grid grid-cols-3 gap-2 xl:grid-cols-4">
                    {cat.children.map((s) => (
                      <li key={s.id}>
                        <Link
                          data-sub
                          to={`/c/${s.slug}`}
                          onClick={onClose}
                          className="group flex items-center gap-3 rounded-md border border-transparent p-2.5 text-sm text-fg transition-colors hover:border-border hover:bg-surface-2"
                        >
                          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-surface-2 text-fg-muted transition-colors group-hover:bg-surface group-hover:text-primary-700">
                            <CategoryIcon name={s.icon} className="size-4" />
                          </span>
                          <span className="line-clamp-2 font-medium">{localized(s.name)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-fg-muted">{t('catalog.noSubcategories')}</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Header "Categories" control: a hover/click mega-menu on desktop (keyboard: arrows move within a
 * column, inline-end arrow enters subcategories, Escape closes) and a full-screen sheet on mobile.
 */
export function CategoryMenu() {
  const { t } = useTranslation();
  const desktop = useMediaQuery('(min-width: 1024px)');
  const [open, setOpen] = useState(false);
  const { pathname, search } = useLocation();
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<number>();

  useEffect(() => setOpen(false), [pathname, search, desktop]);

  useEffect(() => {
    if (!open || !desktop) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open, desktop]);

  const hover = (next: boolean) => {
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => setOpen(next), next ? 120 : 220);
  };

  if (!desktop) {
    return (
      <>
        <IconButton label={t('nav.categories')} onClick={() => setOpen(true)}>
          <LayoutGrid className="size-[18px]" />
        </IconButton>
        <Sheet open={open} onOpenChange={setOpen} side="start" title={t('nav.categories')} className="w-full max-w-none">
          <CategoryBrowser onNavigate={() => setOpen(false)} className="h-full" />
        </Sheet>
      </>
    );
  }

  return (
    <div
      ref={wrapRef}
      onPointerEnter={(e) => e.pointerType === 'mouse' && hover(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && hover(false)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="true"
        onClick={() => {
          window.clearTimeout(hoverTimer.current);
          setOpen((o) => !o);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            requestAnimationFrame(() => document.getElementById(panelId)?.querySelector<HTMLElement>('[data-top]')?.focus());
          }
        }}
        className={cn(
          'ms-2 inline-flex h-11 shrink-0 items-center gap-2 rounded-pill border px-4 text-sm font-semibold transition',
          open ? 'border-primary-600 bg-primary-50 text-primary-800' : 'border-border bg-surface text-fg hover:border-border-strong hover:bg-surface-2',
        )}
      >
        <LayoutGrid className="size-4 text-primary-700" aria-hidden />
        {t('nav.categories')}
        <ChevronDown className={cn('size-4 opacity-60 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && <MegaPanel id={panelId} onClose={() => setOpen(false)} buttonRef={buttonRef} />}
    </div>
  );
}

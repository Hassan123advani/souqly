import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Clock, LayoutGrid, Search, Store, TrendingUp, X } from 'lucide-react';
import { useClearSearchHistory, useSearchHistory, useSearchSuggest, useTrendingSearches } from '@/api/catalog';
import { useDebounced } from '@/hooks/useDebounced';
import { cn } from '@/lib/cn';
import { money } from '@/lib/format';
import { useLocalized } from '@/lib/catalog';
import { clearRecentSearches, pushRecentSearch, readRecentSearches, removeRecentSearch } from '@/lib/recentSearches';
import { Spinner } from '@/components/ui';
import { MallBadge } from '@/components/product/ProductCard';

type Option =
  | { kind: 'query'; id: string; q: string; source: 'typed' | 'recent' | 'trending' }
  | { kind: 'product'; id: string; slug: string; title: string; image: string; price: number }
  | { kind: 'store'; id: string; slug: string; name: string; logo?: string; isMall: boolean }
  | { kind: 'category'; id: string; slug: string; name: string };

/** Bolds the part of `text` that matches `q` (case-insensitive). */
function Highlight({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-transparent font-bold text-fg">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

/**
 * Header search with autocomplete (WAI-ARIA 1.2 combobox + listbox). Arrow keys move the active
 * option, Enter opens it (or searches the typed text), Escape closes then clears.
 * `overlay` renders the results inline for the mobile full-screen search.
 */
export function SearchBox({ overlay, onDone, className }: { overlay?: boolean; onDone?: () => void; className?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const loc = useLocation();
  const [params] = useSearchParams();
  const localized = useLocalized();
  const uid = useId();
  const listId = `${uid}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const urlQ = loc.pathname === '/search' ? params.get('q') ?? '' : '';
  const [q, setQ] = useState(urlQ);
  const [open, setOpen] = useState(!!overlay);
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState<string[]>(() => readRecentSearches());
  const [dismissed, setDismissed] = useState<string[]>([]);

  // Keep the box in sync with the URL when navigating between searches.
  useEffect(() => setQ(urlQ), [urlQ]);

  const debounced = useDebounced(q.trim(), 200);
  const suggest = useSearchSuggest(open ? debounced : '');
  const trending = useTrendingSearches();
  const history = useSearchHistory();
  const clearHistory = useClearSearchHistory();

  const recentAll = useMemo(() => {
    const merged = [...recent, ...(history.data ?? [])];
    const seen = new Set<string>();
    return merged.filter((x) => {
      const k = x.toLowerCase();
      if (seen.has(k) || dismissed.includes(x)) return false;
      seen.add(k);
      return true;
    }).slice(0, 6);
  }, [recent, history.data, dismissed]);

  const term = q.trim();
  const groups = useMemo(() => {
    const out: { key: string; label: string; icon: ReactNode; options: Option[]; action?: ReactNode }[] = [];
    if (!term) {
      if (recentAll.length)
        out.push({
          key: 'recent',
          label: t('search.recent'),
          icon: <Clock className="size-3.5" />,
          options: recentAll.map((r) => ({ kind: 'query', id: `${uid}-r-${r}`, q: r, source: 'recent' })),
        });
      if (trending.data?.length)
        out.push({
          key: 'trending',
          label: t('search.trending'),
          icon: <TrendingUp className="size-3.5" />,
          options: trending.data.slice(0, 8).map((r) => ({ kind: 'query', id: `${uid}-t-${r}`, q: r, source: 'trending' })),
        });
      return out;
    }
    const s = suggest.data;
    out.push({ key: 'typed', label: '', icon: null, options: [{ kind: 'query', id: `${uid}-q`, q: term, source: 'typed' }] });
    if (s?.didYouMean && s.didYouMean.toLowerCase() !== term.toLowerCase())
      out.push({
        key: 'dym',
        label: t('search.didYouMean'),
        icon: null,
        options: [{ kind: 'query', id: `${uid}-dym`, q: s.didYouMean, source: 'typed' }],
      });
    if (s?.products.length)
      out.push({
        key: 'products',
        label: t('search.products'),
        icon: null,
        options: s.products.slice(0, 6).map((p) => ({ kind: 'product', id: `${uid}-p-${p.slug}`, ...p })),
      });
    if (s?.stores.length)
      out.push({
        key: 'stores',
        label: t('search.stores'),
        icon: null,
        options: s.stores.slice(0, 4).map((st) => ({ kind: 'store', id: `${uid}-s-${st.slug}`, ...st })),
      });
    if (s?.categories.length)
      out.push({
        key: 'categories',
        label: t('search.categories'),
        icon: null,
        options: s.categories.slice(0, 4).map((c) => ({ kind: 'category', id: `${uid}-c-${c.slug}`, slug: c.slug, name: localized(c.name) })),
      });
    return out;
  }, [term, recentAll, trending.data, suggest.data, t, uid, localized]);

  const flat = useMemo(() => groups.flatMap((g) => g.options), [groups]);
  useEffect(() => setActive(-1), [term, open]);

  // Close the dropdown on outside click (desktop only; the overlay owns the screen).
  useEffect(() => {
    if (overlay || !open) return;
    const on = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', on);
    return () => document.removeEventListener('pointerdown', on);
  }, [open, overlay]);

  function finish(to: string) {
    setOpen(!!overlay);
    inputRef.current?.blur();
    navigate(to);
    onDone?.();
  }

  function runSearch(text: string) {
    const v = text.trim();
    if (!v) return;
    pushRecentSearch(v);
    setRecent(readRecentSearches());
    setQ(v);
    finish(`/search?q=${encodeURIComponent(v)}`);
  }

  function choose(o: Option) {
    if (o.kind === 'query') return runSearch(o.q);
    if (term) {
      pushRecentSearch(term);
      setRecent(readRecentSearches());
    }
    if (o.kind === 'product') return finish(`/p/${o.slug}`);
    if (o.kind === 'store') return finish(`/store/${o.slug}`);
    return finish(`/c/${o.slug}`);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const opt = active >= 0 ? flat[active] : undefined;
    if (opt) choose(opt);
    else runSearch(q);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      else setActive((a) => (flat.length ? (a + 1) % flat.length : -1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (flat.length ? (a <= 0 ? flat.length - 1 : a - 1) : -1));
    } else if (e.key === 'Escape') {
      if (open && !overlay) {
        e.preventDefault();
        setOpen(false);
      } else if (q) {
        e.preventDefault();
        setQ('');
      } else if (overlay) onDone?.();
    } else if (e.key === 'Home' && open && active >= 0) {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End' && open && active >= 0) {
      e.preventDefault();
      setActive(flat.length - 1);
    }
  }

  useEffect(() => {
    if (active < 0) return;
    document.getElementById(flat[active]?.id ?? '')?.scrollIntoView({ block: 'nearest' });
  }, [active, flat]);

  function removeRecent(r: string) {
    setRecent(removeRecentSearch(r));
    setDismissed((d) => [...d, r]);
    inputRef.current?.focus();
  }

  function clearAllRecent() {
    clearRecentSearches();
    setRecent([]);
    if (history.data?.length) clearHistory.mutate();
    inputRef.current?.focus();
  }

  const showPanel = open && groups.length > 0;
  const activeId = active >= 0 ? flat[active]?.id : undefined;
  let index = -1;

  const panel = (
    <div
      className={cn(
        overlay
          ? 'flex-1 overflow-y-auto px-2 pb-8'
          : 'absolute inset-x-0 top-[calc(100%+8px)] z-50 max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-surface p-2 shadow-pop animate-zoom-in',
      )}
    >
      <ul id={listId} role="listbox" aria-label={t('search.suggestions')} className="flex flex-col">
        {groups.map((g) => (
          <li key={g.key} role="presentation" className={cn(g.label && 'mt-1 first:mt-0')}>
            {g.label && (
              <div className="flex items-center justify-between px-2.5 pb-1 pt-2">
                <span id={`${uid}-${g.key}`} className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-fg-subtle">
                  {g.icon}
                  {g.label}
                </span>
                {g.key === 'recent' && (
                  <button
                    type="button"
                    tabIndex={-1}
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={clearAllRecent}
                    className="text-xs font-semibold text-primary-700 hover:underline"
                  >
                    {t('search.clearAll')}
                  </button>
                )}
              </div>
            )}
            <ul role="group" aria-labelledby={g.label ? `${uid}-${g.key}` : undefined} className={cn(g.key === 'trending' && !overlay && 'flex flex-wrap gap-1.5 px-2 pb-1')}>
              {g.options.map((o) => {
                index++;
                const i = index;
                const isActive = i === active;
                const base = cn(
                  'flex w-full cursor-pointer items-center gap-3 rounded-md px-2.5 text-start text-sm text-fg',
                  isActive ? 'bg-surface-2' : 'hover:bg-surface-2',
                );
                const optProps = {
                  id: o.id,
                  role: 'option' as const,
                  'aria-selected': isActive,
                  onPointerDown: (e: React.PointerEvent) => e.preventDefault(),
                  onClick: () => choose(o),
                  onMouseMove: () => active !== i && setActive(i),
                };
                if (o.kind === 'query' && o.source === 'trending' && !overlay)
                  return (
                    <li
                      key={o.id}
                      {...optProps}
                      className={cn(
                        'cursor-pointer rounded-pill border px-3 py-1.5 text-xs font-medium',
                        isActive ? 'border-primary-600 bg-primary-50 text-primary-800' : 'border-border text-fg-muted hover:border-border-strong',
                      )}
                    >
                      {o.q}
                    </li>
                  );
                if (o.kind === 'query')
                  return (
                    <li key={o.id} {...optProps} className={cn(base, 'h-10')}>
                      {o.source === 'recent' ? (
                        <Clock className="size-4 shrink-0 text-fg-subtle" aria-hidden />
                      ) : o.source === 'trending' ? (
                        <TrendingUp className="size-4 shrink-0 text-fg-subtle" aria-hidden />
                      ) : (
                        <Search className="size-4 shrink-0 text-fg-subtle" aria-hidden />
                      )}
                      <span className="min-w-0 flex-1 truncate">
                        {o.source === 'typed' && g.key === 'typed' ? (
                          t('search.searchFor', { q: o.q })
                        ) : (
                          <Highlight text={o.q} q={term} />
                        )}
                      </span>
                      {o.source === 'recent' && (
                        <button
                          type="button"
                          tabIndex={-1}
                          onPointerDown={(e) => e.preventDefault()}
                          onClick={(e) => {
                            e.stopPropagation();
                            removeRecent(o.q);
                          }}
                          className="-me-1 grid size-8 place-items-center rounded-full text-fg-subtle hover:bg-surface-3 hover:text-fg"
                          aria-label={t('search.removeRecent', { q: o.q })}
                        >
                          <X className="size-4" />
                        </button>
                      )}
                    </li>
                  );
                if (o.kind === 'product')
                  return (
                    <li key={o.id} {...optProps} className={cn(base, 'py-1.5')}>
                      <img src={o.image} alt="" className="size-11 shrink-0 rounded-md border border-border bg-surface-2 object-cover" loading="lazy" />
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-1">
                          <Highlight text={o.title} q={term} />
                        </span>
                        <span className="latin block text-xs font-bold text-fg-muted tabular" dir="ltr">
                          {money(o.price)}
                        </span>
                      </span>
                    </li>
                  );
                if (o.kind === 'store')
                  return (
                    <li key={o.id} {...optProps} className={cn(base, 'py-1.5')}>
                      <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-surface-2">
                        {o.logo ? <img src={o.logo} alt="" className="size-full object-cover" /> : <Store className="size-4 text-fg-subtle" aria-hidden />}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">
                        <Highlight text={o.name} q={term} />
                      </span>
                      {o.isMall && <MallBadge />}
                    </li>
                  );
                return (
                  <li key={o.id} {...optProps} className={cn(base, 'h-10')}>
                    <LayoutGrid className="size-4 shrink-0 text-fg-subtle" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">
                      <Highlight text={o.name} q={term} />
                    </span>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div ref={wrapRef} className={cn('relative', overlay && 'flex h-full flex-col', className)}>
      <form role="search" onSubmit={onSubmit} className={cn(overlay && 'flex items-center gap-2 border-b border-border p-3')}>
        {overlay && (
          <button
            type="button"
            onClick={onDone}
            className="grid size-11 shrink-0 place-items-center rounded-full text-fg hover:bg-surface-2"
            aria-label={t('common.close')}
          >
            <ArrowLeft className="flip-rtl size-5" />
          </button>
        )}
        <label htmlFor={`${uid}-input`} className="sr-only">
          {t('header.searchLabel')}
        </label>
        <div className="group relative flex h-12 flex-1 items-center rounded-pill border border-border-strong bg-surface shadow-sm transition-[border-color,box-shadow] focus-within:border-primary-600 focus-within:ring-4 focus-within:ring-primary/15">
          <Search className="pointer-events-none ms-4 size-[18px] shrink-0 text-fg-subtle" aria-hidden />
          <input
            ref={inputRef}
            id={`${uid}-input`}
            type="search"
            role="combobox"
            aria-expanded={showPanel}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeId}
            value={q}
            autoFocus={overlay}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={t('header.searchPlaceholder')}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            maxLength={100}
            className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm text-fg placeholder:text-fg-subtle focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {suggest.isFetching && term && <Spinner className="me-2 size-4 text-fg-subtle" />}
          {q && (
            <button
              type="button"
              onClick={() => {
                setQ('');
                inputRef.current?.focus();
              }}
              className="me-1 grid size-8 place-items-center rounded-full text-fg-subtle hover:bg-surface-2 hover:text-fg"
              aria-label={t('search.clear')}
            >
              <X className="size-4" />
            </button>
          )}
          <button
            type="submit"
            className="me-1 inline-flex h-10 items-center gap-2 rounded-pill bg-primary px-4 text-sm font-semibold text-primary-fg transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:px-5"
          >
            <span className="hidden sm:inline">{t('header.search')}</span>
            <Search className="size-4 sm:hidden" aria-hidden />
            <span className="sr-only sm:hidden">{t('header.search')}</span>
          </button>
        </div>
      </form>
      {showPanel ? panel : overlay ? <div className="flex-1" /> : null}
    </div>
  );
}

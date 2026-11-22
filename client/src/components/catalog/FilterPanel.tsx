import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, Star } from 'lucide-react';
import { COUNTRIES, type AttributeDef, type ProductListMeta } from '@souqly/shared';
import { Button, Checkbox, Select, Switch } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useLocalized } from '@/lib/catalog';
import { isLightSwatch, swatchFor } from '@/lib/colors';
import { attrParam, readCsv, toggleCsvValue, withParam, type BoolFilter } from '@/lib/listingParams';

export type Facets = NonNullable<ProductListMeta['facets']>;
/** Filters a page can switch off (e.g. `mall` on /mall, `brand` on a brand page). */
export type HiddenFilter = 'brand' | 'mall' | 'city' | 'price' | 'rating' | 'discount' | 'color' | 'size' | 'attributes';

const DISCOUNTS = [10, 20, 30, 50];
const RATINGS = [4, 3, 2];
const ALL_CITIES = [...new Set(COUNTRIES.flatMap((c) => c.cities as readonly string[]))];

function Section({ title, children, defaultOpen = true, count }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean; count?: number }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-border py-4 last:border-b-0">
      <h3>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-2 text-start text-sm font-bold text-fg"
        >
          <span className="inline-flex items-center gap-2">
            {title}
            {count ? <span className="grid size-5 place-items-center rounded-full bg-primary text-[10px] text-primary-fg tabular">{count}</span> : null}
          </span>
          <ChevronDown className={cn('size-4 text-fg-subtle transition-transform', open && 'rotate-180')} aria-hidden />
        </button>
      </h3>
      {open && <div className="mt-3 animate-fade-in">{children}</div>}
    </section>
  );
}

function PriceFilter({ sp, setSp, range }: { sp: URLSearchParams; setSp: (n: URLSearchParams) => void; range?: Facets['priceRange'] }) {
  const { t } = useTranslation();
  const [min, setMin] = useState(sp.get('priceMin') ?? '');
  const [max, setMax] = useState(sp.get('priceMax') ?? '');
  useEffect(() => {
    setMin(sp.get('priceMin') ?? '');
    setMax(sp.get('priceMax') ?? '');
  }, [sp]);
  function apply(e: FormEvent) {
    e.preventDefault();
    let lo = min ? Math.max(0, Math.floor(Number(min))) : NaN;
    let hi = max ? Math.max(0, Math.floor(Number(max))) : NaN;
    if (Number.isFinite(lo) && Number.isFinite(hi) && lo > hi) [lo, hi] = [hi, lo];
    let next = withParam(sp, 'priceMin', Number.isFinite(lo) ? String(lo) : null);
    next = withParam(next, 'priceMax', Number.isFinite(hi) ? String(hi) : null);
    setSp(next);
  }
  const field =
    'h-10 w-full min-w-0 rounded-md border border-border-strong bg-surface px-3 text-sm text-fg tabular placeholder:text-fg-subtle focus:border-primary-600 focus:outline-none focus:ring-4 focus:ring-primary/15';
  return (
    <form onSubmit={apply} className="flex items-end gap-2">
      <label className="min-w-0 flex-1">
        <span className="mb-1 block text-xs text-fg-muted">{t('listing.min')}</span>
        <input
          inputMode="numeric"
          pattern="[0-9]*"
          value={min}
          onChange={(e) => setMin(e.target.value.replace(/\D/g, '').slice(0, 9))}
          placeholder={range ? String(Math.floor(range.min / 100)) : '0'}
          className={field}
          dir="ltr"
        />
      </label>
      <span className="pb-2.5 text-fg-subtle" aria-hidden>
        –
      </span>
      <label className="min-w-0 flex-1">
        <span className="mb-1 block text-xs text-fg-muted">{t('listing.max')}</span>
        <input
          inputMode="numeric"
          pattern="[0-9]*"
          value={max}
          onChange={(e) => setMax(e.target.value.replace(/\D/g, '').slice(0, 9))}
          placeholder={range ? String(Math.ceil(range.max / 100)) : '∞'}
          className={field}
          dir="ltr"
        />
      </label>
      <Button type="submit" size="sm" variant="secondary" className="h-10" aria-label={t('listing.applyPrice')}>
        {t('listing.go')}
      </Button>
    </form>
  );
}

function CheckList({
  items,
  selected,
  onToggle,
  limit = 6,
}: {
  items: { value: string; label: ReactNode; count?: number }[];
  selected: string[];
  onToggle: (v: string) => void;
  limit?: number;
}) {
  const { t } = useTranslation();
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, limit);
  return (
    <div className="space-y-2.5">
      {shown.map((it) => (
        <Checkbox
          key={it.value}
          checked={selected.includes(it.value)}
          onChange={() => onToggle(it.value)}
          label={
            <span className="inline-flex items-center gap-1.5">
              {it.label}
              {it.count !== undefined && <span className="text-xs font-normal text-fg-subtle tabular">({it.count})</span>}
            </span>
          }
        />
      ))}
      {items.length > limit && (
        <button type="button" onClick={() => setAll((a) => !a)} className="text-xs font-semibold text-primary-700 hover:underline">
          {all ? t('listing.showLess') : t('listing.showMore', { n: items.length - limit })}
        </button>
      )}
    </div>
  );
}

/** Union of facet values and currently selected values (so a selection never disappears). */
function withSelected(values: { value: string; count?: number }[], selected: string[]) {
  const have = new Set(values.map((v) => v.value));
  return [...values, ...selected.filter((s) => !have.has(s)).map((value) => ({ value }))];
}

export function FilterPanel({
  sp,
  setSp,
  facets,
  attributes = [],
  hidden = [],
  className,
}: {
  sp: URLSearchParams;
  setSp: (next: URLSearchParams) => void;
  facets?: Facets;
  attributes?: AttributeDef[];
  hidden?: HiddenFilter[];
  className?: string;
}) {
  const { t } = useTranslation();
  const localized = useLocalized();
  const show = (k: HiddenFilter) => !hidden.includes(k);
  const bool = (k: BoolFilter) => sp.get(k) === '1';
  const setBool = (k: BoolFilter, v: boolean) => setSp(withParam(sp, k, v ? '1' : null));

  const brands = readCsv(sp, 'brand');
  const colors = readCsv(sp, 'color');
  const sizes = readCsv(sp, 'size');
  const rating = Number(sp.get('rating') ?? 0);
  const discount = Number(sp.get('discount') ?? 0);
  const extraAttrs = attributes.filter((a) => a.filterable && a.key !== 'color' && a.key !== 'size' && a.options?.length);

  const brandItems = withSelected(
    (facets?.brands ?? []).map((b) => ({ value: b.slug, count: b.count, label: b.name })),
    brands,
  ).map((b) => ({ ...b, label: (b as { label?: string }).label ?? b.value }));
  const colorItems = withSelected(facets?.colors ?? [], colors);
  const sizeItems = withSelected(facets?.sizes ?? [], sizes);

  return (
    <div className={cn('text-sm', className)}>
      {show('price') && (
        <Section title={t('listing.price')} count={sp.get('priceMin') || sp.get('priceMax') ? 1 : 0}>
          <PriceFilter sp={sp} setSp={setSp} range={facets?.priceRange} />
        </Section>
      )}

      <Section title={t('listing.services')}>
        <div className="space-y-3">
          {show('mall') && <Switch label={t('listing.mallOnly')} checked={bool('mall')} onCheckedChange={(v) => setBool('mall', v)} />}
          <Switch label={t('product.freeShipping')} checked={bool('freeShipping')} onCheckedChange={(v) => setBool('freeShipping', v)} />
          <Switch label={t('product.cod')} checked={bool('cod')} onCheckedChange={(v) => setBool('cod', v)} />
          <Switch label={t('listing.inStock')} checked={bool('inStock')} onCheckedChange={(v) => setBool('inStock', v)} />
        </div>
      </Section>

      {show('brand') && brandItems.length > 0 && (
        <Section title={t('listing.brand')} count={brands.length}>
          <CheckList items={brandItems} selected={brands} onToggle={(v) => setSp(toggleCsvValue(sp, 'brand', v))} />
        </Section>
      )}

      {show('rating') && (
        <Section title={t('listing.rating')} count={rating ? 1 : 0}>
          <div className="space-y-1" role="radiogroup" aria-label={t('listing.rating')}>
            {RATINGS.map((r) => {
              const on = rating === r;
              const c = facets?.ratings.find((x) => x.min === r)?.count;
              return (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setSp(withParam(sp, 'rating', on ? null : String(r)))}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start transition-colors',
                    on ? 'bg-primary-50 text-primary-800' : 'hover:bg-surface-2',
                  )}
                >
                  <span className="flex" aria-hidden>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Star key={i} className={cn('size-4', i <= r ? 'fill-accent text-accent' : 'fill-ink-200 text-ink-200')} />
                    ))}
                  </span>
                  <span className="text-xs font-medium">{t('listing.andUp')}</span>
                  {c !== undefined && <span className="ms-auto text-xs text-fg-subtle tabular">({c})</span>}
                  {on && <Check className="ms-1 size-4" aria-hidden />}
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {show('discount') && (
        <Section title={t('listing.discount')} count={discount ? 1 : 0} defaultOpen={false}>
          <div className="flex flex-wrap gap-2">
            {DISCOUNTS.map((d) => {
              const on = discount === d;
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setSp(withParam(sp, 'discount', on ? null : String(d)))}
                  className={cn(
                    'rounded-pill border px-3 py-1.5 text-xs font-semibold transition-colors',
                    on ? 'border-sale bg-sale text-sale-fg' : 'border-border text-fg hover:border-border-strong',
                  )}
                >
                  {t('listing.discountMin', { n: d })}
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {show('color') && colorItems.length > 0 && (
        <Section title={t('listing.color')} count={colors.length}>
          <div className="flex flex-wrap gap-2.5">
            {colorItems.map((c) => {
              const on = colors.includes(c.value);
              const sw = swatchFor(c.value);
              return (
                <button
                  key={c.value}
                  type="button"
                  aria-pressed={on}
                  title={c.value}
                  onClick={() => setSp(toggleCsvValue(sp, 'color', c.value))}
                  className="group flex w-14 flex-col items-center gap-1"
                >
                  <span
                    className={cn(
                      'grid size-9 place-items-center rounded-full ring-offset-2 ring-offset-surface transition',
                      on ? 'ring-2 ring-primary-600' : 'group-hover:ring-2 group-hover:ring-border-strong',
                      (!sw || isLightSwatch(c.value)) && 'border border-border-strong',
                    )}
                    style={{ background: sw ?? 'rgb(var(--surface-2))' }}
                  >
                    {on && <Check className={cn('size-4', sw && !isLightSwatch(c.value) ? 'text-white' : 'text-ink-900')} aria-hidden />}
                  </span>
                  <span className="line-clamp-1 text-[11px] text-fg-muted">{c.value}</span>
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {show('size') && sizeItems.length > 0 && (
        <Section title={t('listing.size')} count={sizes.length}>
          <div className="flex flex-wrap gap-2">
            {sizeItems.map((s) => {
              const on = sizes.includes(s.value);
              return (
                <button
                  key={s.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setSp(toggleCsvValue(sp, 'size', s.value))}
                  className={cn(
                    'latin min-w-11 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors',
                    on ? 'border-primary-600 bg-primary text-primary-fg' : 'border-border-strong text-fg hover:border-primary-500',
                  )}
                >
                  {s.value}
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {show('attributes') &&
        extraAttrs.map((a) => {
          const key = attrParam(a.key);
          const sel = readCsv(sp, key);
          return (
            <Section key={a.key} title={localized(a.label)} count={sel.length} defaultOpen={false}>
              <CheckList
                items={(a.options ?? []).map((o) => ({ value: o, label: o }))}
                selected={sel}
                onToggle={(v) => setSp(toggleCsvValue(sp, key, v))}
              />
            </Section>
          );
        })}

      {show('city') && (
        <Section title={t('listing.city')} count={sp.get('city') ? 1 : 0} defaultOpen={false}>
          <Select
            aria-label={t('listing.city')}
            value={sp.get('city') ?? 'any'}
            onValueChange={(v) => setSp(withParam(sp, 'city', v === 'any' ? null : v))}
            options={[{ value: 'any', label: t('listing.anyCity') }, ...ALL_CITIES.map((c) => ({ value: c, label: c }))]}
          />
          <p className="mt-2 text-xs text-fg-subtle">{t('listing.cityHint')}</p>
        </Section>
      )}
    </div>
  );
}

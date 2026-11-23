import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, XCircle } from 'lucide-react';
import type { SlugAvailability } from '@souqly/shared';
import { checkSlug } from '@/api/seller';
import { Button, FormField, Input, Spinner } from '@/components/ui';
import { useDebounced } from '@/hooks/useDebounced';

/** Live cleanup while typing (keeps a trailing dash so words can be joined). */
function cleanSlugInput(v: string): string {
  return v.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-/, '').slice(0, 40);
}

export type SlugState = 'idle' | 'checking' | 'available' | 'unavailable' | 'error';

/** Store URL field with a debounced live availability check and a one-click suggestion. */
export function SlugField({
  value,
  onChange,
  onState,
  error,
  current,
}: {
  value: string;
  onChange: (slug: string) => void;
  onState: (s: SlugState) => void;
  error?: string;
  /** The store's own slug (settings page): treated as available. */
  current?: string;
}) {
  const { t } = useTranslation();
  const debounced = useDebounced(value, 400);
  const [result, setResult] = useState<SlugAvailability | null>(null);
  const [state, setState] = useState<SlugState>('idle');
  const report = useRef(onState);
  report.current = onState;

  useEffect(() => {
    let alive = true;
    const s = debounced.trim();
    const update = (st: SlugState, r: SlugAvailability | null = null) => {
      if (!alive) return;
      setState(st);
      setResult(r);
      report.current(st);
    };
    if (!s) return update('idle');
    if (current && s === current) return update('available', { available: true });
    update('checking');
    checkSlug(s)
      .then((r) => update(r.available ? 'available' : 'unavailable', r))
      .catch(() => update('error'));
    return () => {
      alive = false;
    };
  }, [debounced, current]);

  const status =
    state === 'checking' ? (
      <span className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
        <Spinner className="size-3.5" /> {t('seller.slug.checking')}
      </span>
    ) : state === 'available' ? (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-success">
        <CheckCircle2 className="size-3.5" /> {t('seller.slug.available')}
      </span>
    ) : state === 'unavailable' ? (
      <span className="inline-flex flex-wrap items-center gap-1.5 text-xs font-semibold text-danger">
        <XCircle className="size-3.5" /> {t(`seller.slug.reasons.${result?.reason ?? 'taken'}`)}
        {result?.suggestion && (
          <Button type="button" size="sm" variant="link" className="h-auto p-0" onClick={() => onChange(result.suggestion!)}>
            {t('seller.slug.use', { slug: result.suggestion })}
          </Button>
        )}
      </span>
    ) : state === 'error' ? (
      <span className="text-xs text-danger">{t('seller.slug.error')}</span>
    ) : null;

  return (
    <FormField
      label={t('seller.slug.label')}
      hint={
        <>
          <span dir="ltr" className="font-semibold text-fg">
            {window.location.host}/store/{value || '…'}
          </span>{' '}
          · {t('seller.slug.hint')}
        </>
      }
      error={error}
      required
      labelAside={status}
    >
      <Input
        dir="ltr"
        value={value}
        onChange={(e) => onChange(cleanSlugInput(e.target.value))}
        autoComplete="off"
        spellCheck={false}
      />
    </FormField>
  );
}

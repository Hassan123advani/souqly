import type { ReactNode } from 'react';
import { useFormContext } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Pencil } from 'lucide-react';
import type { OnboardingInput } from '@souqly/shared';
import { Button, Checkbox } from '@/components/ui';
import { maskTail } from './draft';

function Section({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <section className="rounded-lg border border-border p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-fg">{title}</h3>
        <Button type="button" size="sm" variant="ghost" leftIcon={<Pencil className="size-3.5" />} onClick={onEdit}>
          {t('seller.common.edit')}
        </Button>
      </div>
      <div className="grid gap-1 text-sm text-fg-muted">{children}</div>
    </section>
  );
}

/** Read-only summary of every step + seller terms acceptance. */
export function StepReview({ goTo }: { goTo: (step: number) => void }) {
  const { t } = useTranslation();
  const { register, watch, formState } = useFormContext<OnboardingInput>();
  const v = watch();
  return (
    <div className="grid gap-3">
      <Section title={t('seller.wizard.steps.basics')} onEdit={() => goTo(1)}>
        <p className="font-semibold text-fg">{v.name}</p>
        <p dir="ltr" className="text-start">
          {window.location.host}/store/{v.slug}
        </p>
        {v.tagline && <p>{v.tagline}</p>}
        <p>{t('seller.categories.count', { n: v.categoryIds?.length ?? 0, max: 10 })}</p>
      </Section>
      <Section title={t('seller.wizard.steps.branding')} onEdit={() => goTo(2)}>
        <p>
          {t('seller.branding.logo')}: {v.logo ? t('seller.review.added') : t('seller.review.skipped')} · {t('seller.branding.banner')}:{' '}
          {v.banner ? t('seller.review.added') : t('seller.review.skipped')}
        </p>
      </Section>
      <Section title={t('seller.wizard.steps.contact')} onEdit={() => goTo(3)}>
        <p dir="ltr" className="text-start">
          {v.contact?.email} · {v.contact?.phone}
        </p>
        <p>{[v.pickupAddress?.line1, v.pickupAddress?.area, v.pickupAddress?.city].filter(Boolean).join(', ')}</p>
      </Section>
      <Section title={t('seller.wizard.steps.business')} onEdit={() => goTo(4)}>
        <p>
          {v.business?.legalName} · {t(`seller.business.types.${v.business?.type ?? 'individual'}`)}
        </p>
        <p dir="ltr" className="text-start">
          {maskTail(v.business?.cnicOrRegNo)}
        </p>
      </Section>
      <Section title={t('seller.wizard.steps.payout')} onEdit={() => goTo(5)}>
        <p>
          {t(`seller.payout.methods.${v.payout?.method ?? 'bank'}`)} · {v.payout?.accountTitle}
        </p>
        <p dir="ltr" className="text-start">
          {maskTail(v.payout?.accountNumber)}
        </p>
      </Section>
      <Section title={t('seller.wizard.steps.policies')} onEdit={() => goTo(6)}>
        <p>
          {(['shipping', 'returns', 'warranty'] as const)
            .filter((k) => v.policies?.[k])
            .map((k) => t(`seller.policies.${k}`))
            .join(' · ') || t('seller.review.skipped')}
        </p>
      </Section>
      <div className="mt-2 rounded-lg bg-surface-2 p-4">
        <Checkbox
          {...register('acceptTerms')}
          invalid={!!formState.errors.acceptTerms}
          label={
            <span>
              {t('seller.review.accept')}{' '}
              <Link to="/terms" target="_blank" className="font-semibold text-primary-700 underline">
                {t('seller.review.terms')}
              </Link>
            </span>
          }
          description={t('seller.review.acceptHint')}
        />
        {formState.errors.acceptTerms && <p className="mt-2 text-xs font-medium text-danger">{t('seller.review.acceptRequired')}</p>}
      </div>
    </div>
  );
}

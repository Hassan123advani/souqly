import { useEffect, useMemo, useState } from 'react';
import { FormProvider, useForm, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Pencil, Send } from 'lucide-react';
import { onboardingSchema, type OnboardingInput } from '@souqly/shared';
import { useMe } from '@/api/auth';
import { getErrorCode, getErrorDetails, getErrorMessage } from '@/api/client';
import { useSubmitOnboarding } from '@/api/seller';
import { Seo } from '@/components/layout/Seo';
import { Alert, Button, Card, Container, PageSpinner } from '@/components/ui';
import { BusinessFields } from '@/components/seller/forms/BusinessFields';
import { PayoutFields } from '@/components/seller/forms/PayoutFields';
import { PolicyFields } from '@/components/seller/PolicyFields';
import { clearDraft, maskTail, readDraft, writeDraft } from '@/components/seller/onboarding/draft';
import { OnboardingIntro } from '@/components/seller/onboarding/OnboardingIntro';
import { OnboardingStatus } from '@/components/seller/onboarding/OnboardingStatus';
import type { SlugState } from '@/components/seller/onboarding/SlugField';
import { StepBasics } from '@/components/seller/onboarding/StepBasics';
import { StepBranding } from '@/components/seller/onboarding/StepBranding';
import { StepContact } from '@/components/seller/onboarding/StepContact';
import { StepPlan } from '@/components/seller/onboarding/StepPlan';
import { StepReview } from '@/components/seller/onboarding/StepReview';
import { WizardProgress } from '@/components/seller/onboarding/WizardProgress';

type F = FieldPath<OnboardingInput>;
const STEPS: { key: string; fields: F[] }[] = [
  { key: 'intro', fields: [] },
  { key: 'basics', fields: ['name', 'slug', 'tagline', 'categoryIds', 'themeColor'] },
  { key: 'branding', fields: ['logo', 'banner'] },
  { key: 'contact', fields: ['contact', 'pickupAddress'] },
  { key: 'business', fields: ['business'] },
  { key: 'payout', fields: ['payout'] },
  { key: 'policies', fields: ['policies'] },
  { key: 'plan', fields: ['plan'] },
  { key: 'review', fields: ['acceptTerms'] },
];

export default function SellerOnboardingPage() {
  const { data: me, isLoading } = useMe();
  if (isLoading || !me) return <PageSpinner />;
  if (me.isSeller && me.stores.length > 0) return <OnboardingStatus status={me.stores[0]!.status} storeName={me.stores[0]!.name} />;
  return <Wizard userId={me.id} email={me.email ?? ''} phone={me.phone ?? ''} name={me.name} />;
}

function Wizard({ userId, email, phone, name }: { userId: string; email: string; phone: string; name: string }) {
  const { t } = useTranslation();
  const draft = useMemo(() => readDraft(userId), [userId]);
  const [step, setStep] = useState(draft?.step ?? 0);
  const [slugState, setSlugState] = useState<SlugState>('idle');
  const [payoutLocked, setPayoutLocked] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const submit = useSubmitOnboarding();

  const form = useForm<OnboardingInput>({
    resolver: zodResolver(onboardingSchema),
    mode: 'onTouched',
    defaultValues: {
      name: '',
      slug: '',
      categoryIds: [],
      themeColor: '#0E5E5A',
      contact: { email, phone },
      pickupAddress: { label: 'Pickup', fullName: name, phone, country: 'PK', city: '', line1: '', isDefault: false },
      business: { type: 'individual', legalName: '', cnicOrRegNo: '' },
      payout: { method: 'bank', accountTitle: '', accountNumber: '' },
      policies: {},
      plan: 'free',
      ...draft?.values,
      acceptTerms: undefined as unknown as true,
    },
  });

  // Persist progress whenever the step changes (secrets are stripped in writeDraft).
  useEffect(() => {
    if (!done) writeDraft(userId, step, form.getValues());
  }, [step, userId, form, done]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  async function next() {
    const ok = await form.trigger(STEPS[step]!.fields, { shouldFocus: true });
    if (!ok) return;
    if (step === 1 && slugState !== 'available') {
      form.setError('slug', { message: slugState === 'checking' ? t('seller.slug.wait') : t('seller.slug.pick') });
      return;
    }
    if (step === 5) setPayoutLocked(true);
    setStep((s) => s + 1);
  }

  const onSubmit = form.handleSubmit(
    (values) =>
      submit.mutate(values, {
        onSuccess: (store) => {
          clearDraft(userId);
          setDone(store?.name ?? values.name);
        },
        onError: (err) => {
          const code = getErrorCode(err);
          if (code === 'SLUG_UNAVAILABLE') {
            const sug = getErrorDetails(err)?.suggestion;
            setStep(1);
            form.setError('slug', { message: typeof sug === 'string' ? t('seller.slug.takenTry', { slug: sug }) : t('seller.slug.reasons.taken') });
          } else toast.error(getErrorMessage(err));
        },
      }),
    (errors) => {
      // Jump to the first step that has an error (e.g. secrets cleared after a reload).
      const first = STEPS.findIndex((s) => s.fields.some((f) => (errors as Record<string, unknown>)[f.split('.')[0]!]));
      if (first > 0) {
        if (first === 5) setPayoutLocked(false);
        setStep(first);
      }
    },
  );

  if (done) return <OnboardingStatus status="pending" storeName={done} />;
  if (step === 0) return <OnboardingIntro onStart={() => setStep(1)} />;

  const payout = form.getValues('payout');
  const last = step === STEPS.length - 1;
  return (
    <Container className="max-w-3xl py-6 sm:py-10">
      <Seo title={t('seller.wizard.title')} noindex />
      <WizardProgress step={step} steps={STEPS.slice(1).map((s) => t(`seller.wizard.steps.${s.key}`))} />
      <FormProvider {...form}>
        <form onSubmit={(e) => void onSubmit(e)} noValidate>
          <Card className="mt-6 p-5 sm:p-8">
            <h1 className="text-xl font-extrabold text-fg sm:text-2xl">{t(`seller.wizard.titles.${STEPS[step]!.key}`)}</h1>
            <p className="mb-6 mt-1 text-sm text-fg-muted">{t(`seller.wizard.subtitles.${STEPS[step]!.key}`)}</p>
            {step === 1 && <StepBasics onSlugState={setSlugState} />}
            {step === 2 && <StepBranding />}
            {step === 3 && <StepContact />}
            {step === 4 && <BusinessFields prefix="business." />}
            {step === 5 &&
              (payoutLocked && payout.accountNumber ? (
                <div className="grid gap-3">
                  <Alert tone="success" title={t('seller.payout.savedTitle')}>
                    <span dir="ltr">
                      {t(`seller.payout.methods.${payout.method}`)} · {payout.accountTitle} · {maskTail(payout.accountNumber)}
                    </span>
                  </Alert>
                  <Button type="button" variant="outline" size="sm" className="w-fit" leftIcon={<Pencil className="size-4" />} onClick={() => setPayoutLocked(false)}>
                    {t('seller.common.edit')}
                  </Button>
                </div>
              ) : (
                <PayoutFields prefix="payout." />
              ))}
            {step === 6 && <PolicyFields />}
            {step === 7 && <StepPlan />}
            {step === 8 && <StepReview goTo={setStep} />}
          </Card>
          <div className="sticky bottom-0 z-10 -mx-4 mt-4 flex items-center justify-between gap-2 border-t border-border bg-bg/90 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0">
            <Button type="button" variant="ghost" leftIcon={<ArrowLeft className="flip-rtl size-4" />} onClick={() => setStep((s) => s - 1)}>
              {t('seller.common.back')}
            </Button>
            <span className="text-xs text-fg-muted">{t('seller.wizard.saved')}</span>
            {last ? (
              <Button type="submit" loading={submit.isPending} leftIcon={<Send className="flip-rtl size-4" />}>
                {t('seller.wizard.submit')}
              </Button>
            ) : (
              <Button type="button" onClick={() => void next()} rightIcon={<ArrowRight className="flip-rtl size-4" />}>
                {step === 2 || step === 6 ? t('seller.wizard.nextOrSkip') : t('seller.common.next')}
              </Button>
            )}
          </div>
        </form>
      </FormProvider>
    </Container>
  );
}

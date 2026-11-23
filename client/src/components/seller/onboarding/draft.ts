import type { OnboardingInput } from '@souqly/shared';

/**
 * Wizard progress is kept in localStorage between steps. Sensitive values (CNIC / registration
 * number, account number, IBAN) are never written to storage; the seller re-enters them after a reload.
 */
export type OnboardingDraft = { step: number; values: Partial<OnboardingInput> };

const key = (userId: string) => `souqly-onboarding-${userId}`;

export function readDraft(userId: string): OnboardingDraft | null {
  try {
    const raw = localStorage.getItem(key(userId));
    return raw ? (JSON.parse(raw) as OnboardingDraft) : null;
  } catch {
    return null;
  }
}

export function writeDraft(userId: string, step: number, values: Partial<OnboardingInput>): void {
  const safe: Partial<OnboardingInput> = { ...values, acceptTerms: undefined as never };
  if (values.business) safe.business = { ...values.business, cnicOrRegNo: '' };
  if (values.payout) safe.payout = { ...values.payout, accountNumber: '', iban: undefined };
  try {
    localStorage.setItem(key(userId), JSON.stringify({ step, values: safe }));
  } catch {
    /* storage full or unavailable: the wizard still works in memory */
  }
}

export function clearDraft(userId: string): void {
  try {
    localStorage.removeItem(key(userId));
  } catch {
    /* ignore */
  }
}

/** `****1234` style mask used to show secrets once entered. */
export function maskTail(v?: string): string {
  if (!v) return '';
  const s = v.replace(/\s/g, '');
  return `****${s.slice(-4)}`;
}

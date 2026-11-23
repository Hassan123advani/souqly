import type { BusinessInput, MaskedBusiness, MaskedPayout, PayoutInput } from '@souqly/shared';
import { encrypt } from '../../lib/crypto';

/**
 * KYC / bank fields. Secrets are stored ONLY as AES-256-GCM ciphertext (`*Enc`) plus the last 4
 * characters (`*Last4`) used for masking, so DTOs never need to decrypt. Never log these objects.
 */
const last4 = (v: string) => v.replace(/[\s-]/g, '').slice(-4);
export const mask = (tail?: string) => (tail ? `****${tail}` : '****');

export type StoredBusiness = {
  type: 'individual' | 'company';
  legalName: string;
  cnicOrRegNoEnc: string;
  cnicOrRegNoLast4: string;
  ntn?: string;
  idDocument?: { url: string; key: string };
};
export type StoredPayout = {
  method: 'bank' | 'jazzcash' | 'easypaisa';
  accountTitle: string;
  accountNumberEnc: string;
  accountNumberLast4: string;
  bankName?: string;
  ibanEnc?: string;
  ibanLast4?: string;
  updatedAt: Date;
};

export function sealBusiness(b: BusinessInput): StoredBusiness {
  return {
    type: b.type,
    legalName: b.legalName,
    cnicOrRegNoEnc: encrypt(b.cnicOrRegNo),
    cnicOrRegNoLast4: last4(b.cnicOrRegNo),
    ...(b.ntn ? { ntn: b.ntn } : {}),
    ...(b.idDocument ? { idDocument: b.idDocument } : {}),
  };
}

export function sealPayout(p: PayoutInput): StoredPayout {
  return {
    method: p.method,
    accountTitle: p.accountTitle,
    accountNumberEnc: encrypt(p.accountNumber.replace(/\s/g, '')),
    accountNumberLast4: last4(p.accountNumber),
    ...(p.bankName ? { bankName: p.bankName } : {}),
    ...(p.iban ? { ibanEnc: encrypt(p.iban), ibanLast4: last4(p.iban) } : {}),
    updatedAt: new Date(),
  };
}

export function maskBusiness(b: Partial<StoredBusiness> | undefined | null): MaskedBusiness | undefined {
  if (!b?.type || !b.legalName) return undefined;
  return {
    type: b.type,
    legalName: b.legalName,
    cnicOrRegNo: mask(b.cnicOrRegNoLast4),
    ...(b.ntn ? { ntn: b.ntn } : {}),
    ...(b.idDocument?.url ? { idDocument: { url: b.idDocument.url } } : {}),
  };
}

export function maskPayout(p: Partial<StoredPayout> | undefined | null): MaskedPayout | undefined {
  if (!p?.method || !p.accountTitle) return undefined;
  return {
    method: p.method,
    accountTitle: p.accountTitle,
    accountNumber: mask(p.accountNumberLast4),
    ...(p.bankName ? { bankName: p.bankName } : {}),
    ...(p.ibanLast4 ? { iban: mask(p.ibanLast4) } : {}),
  };
}

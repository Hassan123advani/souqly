import type { CurrencyCode, PaymentMethod } from '@souqly/shared';
import { integrations } from '../../config/env';
import { AppError } from '../../lib/AppError';

export type CreatePaymentInput = {
  /** Our reference (checkout id). Used as the idempotency key with the provider. */
  reference: string;
  /** Minor units. */
  amountMinor: number;
  currency: CurrencyCode;
  customer: { name: string; email?: string; phone?: string };
  /** Where the provider sends the buyer back after paying. */
  returnUrl: string;
};

export type CreatePaymentResult = {
  status: 'pending' | 'requires_action' | 'paid';
  /** Hosted payment page, when the provider needs one. */
  redirectUrl?: string;
  providerRef?: string;
};

export interface PaymentProvider {
  readonly id: Exclude<PaymentMethod, 'wallet'>;
  isAvailable(): boolean;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
}

/** Cash on delivery: always available; payment is collected by the rider/seller. */
class CodProvider implements PaymentProvider {
  readonly id = 'cod' as const;
  isAvailable() {
    return true;
  }
  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    return { status: 'pending', providerRef: `cod_${input.reference}` };
  }
}

/** Placeholder for gateways that are not integrated yet. Reports availability from env. */
class NotConfiguredProvider implements PaymentProvider {
  constructor(
    readonly id: 'jazzcash' | 'easypaisa' | 'stripe',
    private readonly configured: boolean,
  ) {}
  isAvailable() {
    return this.configured;
  }
  async createPayment(): Promise<CreatePaymentResult> {
    // Even with keys present the gateway flow is not built yet (later phase).
    throw new AppError(503, 'PAYMENT_NOT_CONFIGURED', `${this.id} payments are coming soon`);
  }
}

const providers: Record<PaymentProvider['id'], PaymentProvider> = {
  cod: new CodProvider(),
  jazzcash: new NotConfiguredProvider('jazzcash', integrations.hasJazzCash),
  easypaisa: new NotConfiguredProvider('easypaisa', integrations.hasEasyPaisa),
  stripe: new NotConfiguredProvider('stripe', integrations.hasStripe),
};

export function getPaymentProvider(id: PaymentProvider['id']): PaymentProvider {
  const p = providers[id];
  if (!p || !p.isAvailable()) throw new AppError(400, 'PAYMENT_NOT_CONFIGURED', 'This payment method is not available');
  return p;
}

export function paymentAvailability(): Record<PaymentProvider['id'], boolean> {
  return {
    cod: true,
    jazzcash: providers.jazzcash.isAvailable(),
    easypaisa: providers.easypaisa.isAvailable(),
    stripe: providers.stripe.isAvailable(),
  };
}

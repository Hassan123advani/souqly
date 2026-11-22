import { describe, expect, it } from 'vitest';
import { applyBps, discountPercent, formatMoney, toMinor } from './money';
import { isValidStoreSlug, slugify } from './slug';
import { canTransition } from '../constants/orders';

describe('money', () => {
  it('formats PKR without decimals', () => expect(formatMoney(229900, 'PKR')).toBe('Rs. 2,299'));
  it('formats SAR and USD', () => {
    expect(formatMoney(9900, 'SAR')).toBe('SAR 99.00');
    expect(formatMoney(1999, 'USD')).toBe('$19.99');
  });
  it('computes discount percent', () => {
    expect(discountPercent(7500, 10000)).toBe(25);
    expect(discountPercent(10000, 9000)).toBe(0);
  });
  it('applies basis points without float drift', () => expect(applyBps(toMinor(1999), 1250)).toBe(24988));
});

describe('slug', () => {
  it('slugifies', () => expect(slugify("Ali's Fashion  Hub!")).toBe('ali-s-fashion-hub'));
  it('rejects reserved', () => expect(isValidStoreSlug('admin')).toBe(false));
  it('accepts valid', () => expect(isValidStoreSlug('zara-crafts')).toBe(true));
});

describe('order transitions', () => {
  it('allows placed -> confirmed', () => expect(canTransition('placed', 'confirmed')).toBe(true));
  it('blocks delivered -> placed', () => expect(canTransition('delivered', 'placed')).toBe(false));
});

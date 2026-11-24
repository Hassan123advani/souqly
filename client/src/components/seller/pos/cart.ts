import type { PosCatalogRow } from '@/api/growth';

export type CartLine = { row: PosCatalogRow; qty: number; /** Line discount, minor units. */ discount: number };
export type Payment = { method: 'cash' | 'card' | 'wallet'; amount: number };

/** Mirrors the server's `posTotals()` so the cashier sees exactly what will be saved. */
export function cartTotals(lines: CartLine[], cartDiscount: number) {
  const subtotal = lines.reduce((a, l) => a + l.row.price * l.qty, 0);
  const lineDiscounts = lines.reduce((a, l) => a + Math.min(l.discount, l.row.price * l.qty), 0);
  const discount = Math.min(subtotal, lineDiscounts + cartDiscount);
  return { subtotal, lineDiscounts, discount, total: subtotal - discount, units: lines.reduce((a, l) => a + l.qty, 0) };
}

/** Change is only given from cash; valid when payments cover the total. */
export function paymentCheck(total: number, payments: Payment[]) {
  const paid = payments.reduce((a, p) => a + p.amount, 0);
  const cash = payments.filter((p) => p.method === 'cash').reduce((a, p) => a + p.amount, 0);
  const change = Math.max(0, paid - total);
  return { paid, cash, change, due: Math.max(0, total - paid), valid: paid >= total && change <= cash };
}

export const optionText = (o: Record<string, string>) => Object.values(o).join(' / ');

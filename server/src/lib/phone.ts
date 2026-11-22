/** Stores phones in E.164 form with a leading '+' (spaces, dashes and brackets are removed). */
export function normalizePhone(phone: string): string {
  const p = phone.trim().replace(/[\s\-()]/g, '');
  return p.startsWith('+') ? p : `+${p}`;
}

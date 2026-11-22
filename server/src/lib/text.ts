/** Text helpers for search (D-008). */

/** Lowercase, strip diacritics and punctuation, collapse whitespace. Keeps Arabic/Urdu letters. */
export function normalizeText(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(input: string, minLength = 2): string[] {
  return normalizeText(input)
    .split(' ')
    .filter((t) => t.length >= minLength);
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Fuzzy pattern for one token: allows one optional extra character between consecutive letters,
 * e.g. "shrt" → s.?h.?r.?t which matches "shirt".
 */
export function fuzzyTokenPattern(token: string): string {
  return [...token].map(escapeRegex).join('.?');
}

/** Levenshtein distance with an early exit once every cell of a row exceeds `max`. */
export function levenshtein(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length]!;
}

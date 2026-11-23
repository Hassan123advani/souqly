/**
 * Small profanity list (English + Roman Urdu). Matching is on whole words after normalising
 * case, common leetspeak and repeated letters. Hits are masked (first letter kept) and the content is
 * sent to moderation (status `pending`). Extend in Phase 9 from admin settings.
 */
const WORDS = [
  // English
  'fuck', 'fucking', 'fucker', 'shit', 'bullshit', 'bitch', 'bastard', 'asshole', 'dick', 'cunt', 'slut', 'whore', 'motherfucker', 'retard',
  // Roman Urdu
  'chutiya', 'chutiye', 'kutta', 'kutti', 'kamina', 'kameena', 'kamine', 'harami', 'haramzada', 'haramzadi', 'gandu', 'bhenchod', 'behenchod', 'madarchod', 'bhosdi', 'bhosdike', 'lanat', 'ullu ka pattha', 'gadha',
];

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's' };
const normalise = (w: string) =>
  w
    .toLowerCase()
    .replace(/[013457@$]/g, (c) => LEET[c] ?? c)
    .replace(/(.)\1{2,}/g, '$1$1');

const single = new Set(WORDS.filter((w) => !w.includes(' ')).map((w) => w.toLowerCase()));
const phrases = WORDS.filter((w) => w.includes(' '));

const variants = (w: string) => {
  const n = normalise(w);
  return [n, n.replace(/(.)\1/g, '$1')];
};

export function findBadWords(text: string): string[] {
  const hits = new Set<string>();
  for (const token of text.split(/[^\p{L}\p{N}@$]+/u)) {
    if (!token) continue;
    if (variants(token).some((v) => single.has(v))) hits.add(token);
  }
  const lower = text.toLowerCase();
  for (const p of phrases) if (lower.includes(p)) hits.add(p);
  return [...hits];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Masks offending words: "shit" → "s***". */
export function maskBadWords(text: string): { text: string; flagged: boolean } {
  const hits = findBadWords(text);
  if (!hits.length) return { text, flagged: false };
  let out = text;
  for (const h of hits) {
    out = out.replace(new RegExp(`(^|[^\\p{L}\\p{N}])(${escape(h)})(?=$|[^\\p{L}\\p{N}])`, 'giu'), (_m, pre: string, word: string) => `${pre}${word[0]}${'*'.repeat(Math.max(1, word.length - 1))}`);
  }
  return { text: out, flagged: true };
}

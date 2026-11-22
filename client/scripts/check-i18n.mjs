// Verifies that en/ur/ar locale files have identical key sets and that every static
// t('...') key used in src exists in en.json. Run: node client/scripts/check-i18n.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = (l) => JSON.parse(fs.readFileSync(path.join(root, 'src/i18n/locales', `${l}.json`), 'utf8'));

function flatten(obj, prefix = '', out = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out.set(key, Array.isArray(v) ? `array:${v.length}` : 'string');
  }
  return out;
}

const en = flatten(load('en'));
let problems = 0;
for (const l of ['ur', 'ar']) {
  const other = flatten(load(l));
  for (const [k, kind] of en) {
    if (!other.has(k)) (problems++, console.log(`[${l}] missing ${k}`));
    else if (other.get(k) !== kind) (problems++, console.log(`[${l}] shape mismatch ${k}: ${other.get(k)} vs ${kind}`));
  }
  for (const k of other.keys()) if (!en.has(k)) (problems++, console.log(`[${l}] extra ${k}`));
}

function walk(dir, files = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p, files);
    else if (/\.(tsx?|mjs)$/.test(f.name)) files.push(p);
  }
  return files;
}
const used = new Set();
for (const f of walk(path.join(root, 'src'))) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/\bt\(\s*['"]([a-zA-Z0-9_.]+)['"]/g)) used.add(m[1]);
}
const hasPrefix = (k) => [...en.keys()].some((e) => e === k || e.startsWith(`${k}.`));
for (const k of used) if (!hasPrefix(k)) (problems++, console.log(`[src] key not in en.json: ${k}`));

console.log(problems ? `${problems} problem(s)` : `OK — ${en.size} keys, ${used.size} static keys used`);
process.exit(problems ? 1 : 0);

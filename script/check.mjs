// Smoke-check the built site: index.html exists and no referenced local asset 404s.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DEST = path.join(ROOT, '_site');
const BASE = '/github-slideshow';

if (!fs.existsSync(path.join(DEST, 'index.html'))) {
  console.error('Missing _site/index.html — run "npm run build" first.');
  process.exit(1);
}

const html = fs.readFileSync(path.join(DEST, 'index.html'), 'utf8');
const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)]
  .map((m) => m[1])
  .filter((u) => !/^(https?:)?\/\//.test(u) && !u.startsWith('data:') && !u.startsWith('#'));

const missing = [];
for (const ref of refs) {
  const rel = ref.startsWith(BASE) ? ref.slice(BASE.length) : ref;
  const file = path.join(DEST, rel.replace(/^\//, '').split('?')[0]);
  if (!fs.existsSync(file)) missing.push(ref);
}

if (missing.length) {
  console.error('Missing referenced assets:\n  ' + missing.join('\n  '));
  process.exit(1);
}

console.log(`OK: ${refs.length} local references resolve, ${html.length} bytes of HTML.`);

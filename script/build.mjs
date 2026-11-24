// Build the reveal.js slide deck into _site/ without needing Ruby/Jekyll.
//
// Implements the small subset of Jekyll this project relies on:
//   - YAML front matter on pages and posts (gray-matter)
//   - The Liquid tags/filters used by _layouts and _includes
//   - _config.yml, _layouts, _includes, _posts, _sass, assets/
//   - .scss compilation via the Dart Sass JS API
// Output is plain HTML/CSS/JS, servable by script/server.mjs.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import matter from 'gray-matter';
import yaml from 'js-yaml';
import { marked } from 'marked';
import * as sass from 'sass';

const ROOT = path.resolve(import.meta.dirname, '..');
const DEST = path.join(ROOT, '_site');

const SITE = yaml.load(fs.readFileSync(path.join(ROOT, '_config.yml'), 'utf8')) || {};

let BASEURL = SITE.baseurl == null ? '' : String(SITE.baseurl).replace(/\/$/, '');
if (BASEURL !== '' && BASEURL !== '.' && !BASEURL.startsWith('/')) BASEURL = '/' + BASEURL;

// ---------------------------------------------------------------------------
// Liquid (subset)
// ---------------------------------------------------------------------------

function isTruthy(v) {
  return !(v == null || v === false);
}

function get(ctx, pathStr) {
  const parts = pathStr.match(/[^.[\]]+|\[\d+\]/g) ?? [];
  let cur = ctx;
  for (const part of parts) {
    if (cur == null) return null;
    if (part.startsWith('[')) {
      cur = cur[Number(part.slice(1, -1))];
      continue;
    }
    const key = part in cur ? part : part.replace(/-/g, '_');
    cur = cur[key];
  }
  return cur == null ? null : cur;
}

// Split on `sep` while ignoring separators nested in (), {}, [] or quotes.
function splitTopLevel(str, sep) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (quote) {
      if (c === quote && str[i - 1] !== '\\') quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') depth--;
    else if (c === sep && depth === 0) {
      parts.push(str.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(str.slice(start));
  return parts;
}

function evalValue(expr, ctx) {
  const s = expr.trim();
  if (!s) return null;
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'nil' || s === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);
  if ((s.startsWith('(') && s.endsWith(')')) || (s.startsWith('{') && s.endsWith('}'))) {
    return evalValue(s.slice(1, -1), ctx);
  }
  if (s.startsWith('[') && s.endsWith(']')) {
    const inner = s.slice(1, -1).trim();
    return inner ? splitTopLevel(inner, ',').map((p) => evalValue(p, ctx)) : [];
  }

  const filters = splitTopLevel(s, '|');
  if (filters.length > 1) {
    let value = evalValue(filters[0], ctx);
    for (const f of filters.slice(1)) value = applyFilter(f, value, ctx);
    return value;
  }

  const value = get(ctx, s);
  if (value == null && s === 'site.posts') return ctx.site?.posts ?? [];
  return value;
}

function evalCondition(expr, ctx) {
  const s = expr.trim();

  // `or` / `and` bind loosest, so split those before looking at comparisons.
  const orParts = splitOnKeyword(s, ' or ');
  if (orParts.length > 1) return orParts.some((p) => evalCondition(p, ctx));
  const andParts = splitOnKeyword(s, ' and ');
  if (andParts.length > 1) return andParts.every((p) => evalCondition(p, ctx));

  const cmp = topLevelComparison(s);
  if (cmp) {
    const left = evalValue(cmp.left, ctx);
    const right = evalValue(cmp.right, ctx);
    switch (cmp.op) {
      case '==':
        return left === right;
      case '!=':
        return left !== right;
      case '>':
        return left > right;
      case '<':
        return left < right;
      case '>=':
        return left >= right;
      case '<=':
        return left <= right;
      case 'contains':
        return Array.isArray(left) ? left.includes(right) : String(left ?? '').includes(String(right ?? ''));
    }
  }

  // Liquid evaluates "x | filter" to the filter's result, then tests that.
  const filters = splitTopLevel(s, '|');
  if (filters.length > 1) {
    let value = evalValue(filters[0], ctx);
    for (const f of filters.slice(1)) value = applyFilter(f, value, ctx);
    return value !== false && (typeof value === 'number' ? value !== 0 : value != null && value !== '');
  }

  return isTruthy(evalValue(s, ctx));
}

// Finds a top-level comparison operator (ignoring brackets and quotes).
function topLevelComparison(str) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (quote) {
      if (c === quote && str[i - 1] !== '\\') quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') depth--;
    else if (depth === 0) {
      for (const op of ['==', '!=', '>=', '<=', '>', '<', 'contains']) {
        if (str.startsWith(op, i)) {
          const left = str.slice(0, i);
          const right = str.slice(i + op.length);
          if (left.trim() && right.trim()) return { left, op, right };
        }
      }
    }
  }
  return null;
}

// Split `str` on a whole-word ` and ` / ` or ` while ignoring nested brackets.
function splitOnKeyword(str, keyword) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (quote) {
      if (c === quote && str[i - 1] !== '\\') quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') depth--;
    else if (depth === 0 && str.startsWith(keyword, i)) {
      parts.push(str.slice(start, i));
      i += keyword.length;
      start = i;
      i--;
    }
  }
  parts.push(str.slice(start));
  return parts;
}

function applyFilter(raw, value, ctx) {
  const f = raw.trim();
  const idx = f.indexOf(':');
  const name = (idx === -1 ? f : f.slice(0, idx)).trim();
  const argStr = idx === -1 ? null : f.slice(idx + 1).trim();
  const arg = argStr === null ? null : evalValue(argStr, ctx);

  switch (name) {
    case 'size':
      return value == null ? 0 : value.length ?? 0;
    case 'default':
      return value == null || value === false || value === '' ? arg : value;
    case 'reverse':
      return Array.isArray(value) ? [...value].reverse() : value;
    case 'first':
      return Array.isArray(value) ? value[0] : value;
    case 'last':
      return Array.isArray(value) ? value[value.length - 1] : value;
    case 'join':
      return Array.isArray(value) ? value.join(argStr === null ? ' ' : String(arg)) : value;
    case 'upcase':
      return String(value ?? '').toUpperCase();
    case 'downcase':
      return String(value ?? '').toLowerCase();
    case 'strip':
      return String(value ?? '').trim();
    case 'escape':
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    case 'relative_url':
      return BASEURL ? BASEURL + String(value ?? '') : String(value ?? '');
    case 'jsval':
      // Render a config value as a JavaScript literal: numbers/booleans bare,
      // strings single-quoted. Prevents e.g. margin "0.1" from becoming the
      // string '0.1' (which reveal.js then adds to 1 -> "10.1" and blows up
      // the PDF page size by 10x).
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
      if (value == null) return 'null';
      return "'" + String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
    case 'absolute_url':
      return (SITE.url || '') + BASEURL + String(value ?? '');
    default:
      return value;
  }
}

function stringify(v) {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}

// Find the next `{% ... %}` or `{{ ... }}` starting at or after `from`.
function nextTag(tpl, from) {
  let best = null;
  for (const [open, close, kind] of [['{{', '}}', 'var'], ['{%', '%}', 'tag']]) {
    const at = tpl.indexOf(open, from);
    if (at === -1) continue;
    if (!best || at < best.index) {
      const end = tpl.indexOf(close, at + 2);
      if (end === -1) continue;
      best = { index: at, end: end + 2, kind, inner: tpl.slice(at + 2, end).trim() };
    }
  }
  return best;
}

// Scan tag tokens, tracking nested block depth.
function scanBlocks(tpl, from) {
  const tokens = [];
  let i = from;
  while (true) {
    const tok = nextTag(tpl, i);
    if (!tok) break;
    if (tok.kind === 'tag') tokens.push(tok);
    i = tok.end;
  }
  return tokens;
}

// Locate the matching `end*` token for the block whose opening tag ends at `from`.
// Returns the branch split points and the end token.
function findBlock(tpl, from) {
  const tokens = scanBlocks(tpl, from);
  let depth = 1;
  const splits = [];
  for (const tok of tokens) {
    const word = tok.inner.split(/\s+/)[0];
    if (['if', 'unless', 'for'].includes(word)) depth++;
    else if (word.startsWith('end')) {
      depth--;
      if (depth === 0) return { splits, end: tok };
    } else if ((word === 'else' || word === 'elsif') && depth === 1) {
      const condText = word === 'elsif' ? tok.inner.slice('elsif'.length).trim() : undefined;
      splits.push({ at: tok.index, end: tok.end, word, condText });
    }
  }
  return { splits, end: null };
}

export function renderTemplate(tpl, ctx) {
  const rawParts = [];
  tpl = tpl.replace(/{%\s*raw\s*%}([\s\S]*?){%\s*endraw\s*%}/g, (_, body) => {
    rawParts.push(body);
    return `\u0000${rawParts.length - 1}\u0000`;
  });

  let out = '';
  let i = 0;
  while (i < tpl.length) {
    const tok = nextTag(tpl, i);
    if (!tok) {
      out += tpl.slice(i);
      break;
    }
    out += tpl.slice(i, tok.index);

    if (tok.kind === 'var') {
      out += stringify(evalValue(tok.inner, ctx));
      i = tok.end;
      continue;
    }

    i = tok.end;
    const word = tok.inner.split(/\s+/)[0];

    if (word === 'if' || word === 'unless') {
      const negate = word === 'unless';
      const { splits, end } = findBlock(tpl, i);
      const endAt = end ? end.index : tpl.length;
      const afterEnd = end ? end.end : tpl.length;

      const branches = [];
      let cond = tok.inner.slice(word.length).trim();
      let start = i;
      for (const s of splits) {
        branches.push({ cond, text: tpl.slice(start, s.at) });
        start = s.end;
        cond = s.word === 'else' ? 'else' : s.condText;
      }
      branches.push({ cond, text: tpl.slice(start, endAt) });

      for (const b of branches) {
        const pass = b.cond === 'else' || (negate ? !evalCondition(b.cond, ctx) : evalCondition(b.cond, ctx));
        if (pass) {
          out += renderTemplate(b.text, ctx);
          break;
        }
      }
      i = afterEnd;
    } else if (word === 'for') {
      const { end } = findBlock(tpl, i);
      const endAt = end ? end.index : tpl.length;
      const afterEnd = end ? end.end : tpl.length;
      const m = tok.inner.match(/^for\s+(\w+)\s+in\s+([\s\S]+?)(?:\s+(reversed))?$/);
      if (m) {
        const coll = evalValue(m[2], ctx);
        let items = Array.isArray(coll)
          ? [...coll]
          : coll && typeof coll === 'object'
            ? Object.entries(coll)
            : [];
        if (m[3]) items = items.reverse();
        const body = tpl.slice(i, endAt);
        for (const item of items) out += renderTemplate(body, { ...ctx, [m[1]]: item });
      }
      i = afterEnd;
    } else if (word === 'assign') {
      const m = tok.inner.match(/^assign\s+(\w+)\s*=\s*([\s\S]+)$/);
      if (m) ctx[m[1]] = evalValue(m[2], ctx);
    } else if (word === 'include') {
      const name = tok.inner.slice('include'.length).trim();
      const file = path.join(ROOT, '_includes', name);
      if (fs.existsSync(file)) {
        // _includes/slide.html renders a post's Markdown body as HTML.
        let includeCtx = ctx;
        if (ctx.post && ctx.post.content != null && !name.endsWith('.md')) {
          const html = markdownToHtml(ctx.post.content);
          includeCtx = { ...ctx, post: { ...ctx.post, content: html } };
        }
        out += renderTemplate(fs.readFileSync(file, 'utf8'), includeCtx);
      }
    }
    // comment, end*, else etc. are consumed above or simply skipped.
  }

  return out.replace(/\u0000(\d+)\u0000/g, (_, n) => rawParts[Number(n)]);
}

// ---------------------------------------------------------------------------
// Jekyll-ish rendering
// ---------------------------------------------------------------------------

function readFrontMatter(file) {
  const parsed = matter(fs.readFileSync(file, 'utf8'));
  return { data: parsed.data || {}, content: parsed.content };
}

function markdownToHtml(md) {
  return marked.parse(md.trim()).replace(/\n$/, '');
}

function applyLayout(name, content, pageData) {
  const file = path.join(ROOT, '_layouts', `${name}.html`);
  if (!fs.existsSync(file)) return content;
  return renderTemplate(fs.readFileSync(file, 'utf8'), { site: SITE, page: pageData, content });
}

function loadPosts() {
  const dir = path.join(ROOT, '_posts');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => {
      const { data, content } = readFrontMatter(path.join(dir, f));
      const slug = f.replace(/^\d+-\d+-\d+-/, '').replace(/\.md$/, '');
      return { ...data, content, slug };
    });
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function copyStatic(from, to) {
  if (!fs.existsSync(from)) return;
  if (fs.statSync(from).isDirectory()) {
    for (const entry of fs.readdirSync(from)) copyStatic(path.join(from, entry), path.join(to, entry));
  } else {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
}

function compileScss(file, outFile) {
  // Sass cannot parse Jekyll's leading "---\n---" front matter.
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end !== -1) lines.splice(0, end + 1);
  }
  const { css } = sass.compileString(lines.join('\n'), {
    url: pathToFileURL(file),
    loadPaths: [path.join(ROOT, '_sass'), path.join(ROOT, 'node_modules'), path.join(ROOT, 'assets')],
    style: /compressed/.test(String(SITE.sass?.style ?? '')) ? 'compressed' : 'expanded',
    quietDeps: true,
    silenceDeprecations: ['import', 'global-builtin', 'color-functions', 'slash-div'],
  });
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, css);
}

function copyProjectAssets() {
  // Copy the whole assets/ tree, then rename the case-sensitive font dirs that
  // Jekyll used to emit lowercase. CI runs on Linux, where CSS url() case matters.
  for (const file of walk(path.join(ROOT, 'assets'))) {
    if (file.endsWith('.scss')) continue;
    const rel = path.relative(path.join(ROOT, 'assets'), file).replace(/\\/g, '/');
    const out = rel
      .replace(/\/FontAwesome\//i, '/fontawesome/')
      .replace(/\/OpenSans\//i, '/opensans/');
    const dest = path.join(DEST, 'assets', out);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(file, dest);
  }
  copyStatic(path.join(ROOT, 'node_modules', 'reveal.js', 'dist'), path.join(DEST, 'reveal.js'));

  // reveal.js v6 only ships print styles as SCSS; compile them alongside the deck.
  const revealPdf = path.join(DEST, 'reveal.js', 'css', 'print', 'pdf.css');
  fs.mkdirSync(path.dirname(revealPdf), { recursive: true });
  fs.writeFileSync(
    revealPdf,
    sass.compileString("@import 'reveal.js/css/print/pdf';", {
      loadPaths: [path.join(ROOT, 'node_modules')],
      quietDeps: true,
      silenceDeprecations: ['import'],
    }).css,
  );
  copyStatic(
    path.join(ROOT, 'node_modules', '@fortawesome', 'fontawesome-free', 'webfonts'),
    path.join(DEST, 'assets', 'fonts', 'fontawesome'),
  );
  copyStatic(
    path.join(ROOT, 'node_modules', 'open-sans-fontface', 'fonts'),
    path.join(DEST, 'assets', 'fonts', 'opensans'),
  );

  // Noto Serif: keep only the latin weights the theme references.
  const notoDest = path.join(DEST, 'assets', 'fonts', 'noto-serif');
  const notoSrc = path.join(ROOT, 'node_modules', '@fontsource', 'noto-serif', 'files');
  fs.mkdirSync(notoDest, { recursive: true });
  for (const f of fs.readdirSync(notoSrc)) {
    if (/^noto-serif-latin-(400|700)-(normal|italic)\.woff2?$/.test(f)) {
      fs.copyFileSync(path.join(notoSrc, f), path.join(notoDest, f));
    }
  }
}

export function build({ quiet = false } = {}) {
  const log = quiet ? () => {} : console.log;

  fs.rmSync(DEST, { recursive: true, force: true });
  fs.mkdirSync(DEST, { recursive: true });

  copyProjectAssets();
  log('Copied assets');

  for (const file of walk(path.join(ROOT, 'assets'))) {
    if (!file.endsWith('.scss')) continue;
    if (!fs.readFileSync(file, 'utf8').startsWith('---')) continue;
    const relative = path
      .relative(ROOT, file)
      .replace(/\\/g, '/')
      .replace(/\.scss$/, '.css')
      .toLowerCase();
    compileScss(file, path.join(DEST, relative));
    log(`Compiled ${relative.replace(/\\/g, '/')}`);
  }

  const posts = loadPosts();

  for (const entry of fs.readdirSync(ROOT)) {
    if (!/\.(html|md)$/.test(entry)) continue;
    const full = path.join(ROOT, entry);
    if (!fs.statSync(full).isFile()) continue;
    if (!fs.readFileSync(full, 'utf8').startsWith('---')) continue;

    const { data, content } = readFrontMatter(full);
    const site = { ...SITE, posts };
    let html = renderTemplate(content, { site, page: { ...data } });
    if (data.layout) html = applyLayout(data.layout, html, data);

    fs.writeFileSync(path.join(DEST, entry.replace(/\.md$/, '.html')), html);
    log(`Rendered ${entry.replace(/\.md$/, '.html')}`);
  }

  log('Build complete -> _site/');
  return DEST;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  build();
  if (process.argv.includes('--serve')) {
    const { startServer } = await import('./server.mjs');
    startServer();
  }
}

/**
 * verify-dist.mjs — the last step of `npm run build` (React migration, D-13):
 * structural checks on the BUILT artifact, which fail the build rather than a
 * review. "Read the built artifact, not the source" (CLAUDE.md): every check
 * here is about what a host would serve.
 *
 * 1. Every internal `href`/`src` in every HTML page resolves to a file in
 *    `dist/` (a page path ending in `/` to its `index.html`). This is the
 *    guarantee the retired portability pass used to back: no link leaves the
 *    deployment, and none points at nothing.
 * 2. Every page has exactly one `<h1>`, one `<main id="main">` and one
 *    `<link rel="canonical">`.
 * 3. No Astro remnant: no `data-astro`, `astro-island` or `/_astro/` string in
 *    any HTML, JS or CSS file.
 * 4. On a publishing builder (`WORKERS_CI`, `CF_PAGES`, `NETLIFY`, `VERCEL`),
 *    the unstamped `learndsa.invalid` sentinel appears nowhere.
 *
 * Reads `LDSA_OUT` like the build: `dist/` is `$LDSA_OUT/dist`, or the
 * repository's own `dist/` when unset. Dependency-free; `console` is banned
 * repo-wide, so it writes to stdout/stderr directly.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/* global URL -- Node has had a global WHATWG URL since 10. */

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = path.join(
  process.env.LDSA_OUT ? path.resolve(ROOT, process.env.LDSA_OUT) : ROOT,
  'dist',
);

/** The variables `src/render/site-url.ts` treats as publishing builders. */
const PUBLISHING_BUILDERS = ['CF_PAGES', 'WORKERS_CI', 'NETLIFY', 'VERCEL'];

/** Strings no file of the new build may contain. */
const REMNANTS = ['data-astro', 'astro-island', '/_astro/'];

/**
 * Every file under `dir`, as `/`-separated paths relative to it.
 *
 * @param {string} dir - Directory.
 * @returns {string[]} Sorted relative paths.
 */
function walk(dir) {
  /** @type {string[]} */
  const out = [];
  /** @param {string} rel */
  const visit = (rel) => {
    for (const name of readdirSync(path.join(dir, rel))) {
      const child = rel === '' ? name : `${rel}/${name}`;
      if (statSync(path.join(dir, child)).isDirectory()) visit(child);
      else out.push(child);
    }
  };
  visit('');
  return out.sort();
}

/**
 * The URL a `dist/`-relative HTML file is served at.
 *
 * @param {string} rel - e.g. `learn/arrays/index.html`.
 * @returns {string} e.g. `/learn/arrays/`.
 */
function urlFor(rel) {
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html'))
    return `/${rel.slice(0, -'index.html'.length)}`;
  return `/${rel}`;
}

/**
 * Whether a root-relative URL path resolves to a file in `dist/`.
 *
 * @param {string} pathname - Decoded path, e.g. `/learn/arrays/`.
 * @returns {boolean} A file exists.
 */
function resolves(pathname) {
  const rel = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
  const file = path.join(DIST, rel);
  return existsSync(file) && statSync(file).isFile();
}

/**
 * Counts matches of a pattern.
 *
 * @param {string} text - Haystack.
 * @param {RegExp} pattern - Global pattern.
 * @returns {number} Match count.
 */
const count = (text, pattern) => [...text.matchAll(pattern)].length;

/** @type {string[]} */
const problems = [];

if (!existsSync(path.join(DIST, 'index.html'))) {
  process.stderr.write(
    `verify-dist: ${DIST} has no index.html — build first.\n`,
  );
  process.exit(1);
}

const files = walk(DIST);
const html = files.filter((file) => file.endsWith('.html'));
const origin = 'https://verify.invalid';
const stamped = PUBLISHING_BUILDERS.some((key) => process.env[key]);

for (const file of files) {
  if (!/\.(html|js|css|xml|txt)$/.test(file)) continue;
  const text = readFileSync(path.join(DIST, file), 'utf8');
  for (const remnant of REMNANTS) {
    if (text.includes(remnant)) problems.push(`${file}: contains "${remnant}"`);
  }
  if (stamped && text.includes('learndsa.invalid')) {
    problems.push(`${file}: ships the unstamped sentinel learndsa.invalid`);
  }
}

for (const file of html) {
  const text = readFileSync(path.join(DIST, file), 'utf8');
  const page = urlFor(file);
  const h1 = count(text, /<h1[\s>]/g);
  if (h1 !== 1) problems.push(`${page}: ${h1} <h1> elements (want 1)`);
  const main = count(text, /<main\s[^>]*\bid="main"/g);
  const anyMain = count(text, /<main[\s>]/g);
  if (main !== 1 || anyMain !== 1) {
    problems.push(
      `${page}: ${anyMain} <main> (${main} with id="main"; want 1)`,
    );
  }
  const canonical = count(text, /<link\s[^>]*\brel="canonical"/g);
  if (canonical !== 1) {
    problems.push(`${page}: ${canonical} canonical links (want 1)`);
  }
  for (const match of text.matchAll(/\s(?:href|src)="([^"]*)"/g)) {
    const raw = (match[1] ?? '').replace(/&amp;/g, '&');
    if (raw === '' || raw.startsWith('#')) continue;
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//')) continue;
    const url = new URL(raw, `${origin}${page}`);
    if (!resolves(decodeURIComponent(url.pathname))) {
      problems.push(
        `${page}: internal URL ${raw} resolves to no file in dist/`,
      );
    }
  }
}

if (problems.length > 0) {
  process.stderr.write(
    `verify-dist: ${problems.length} problem(s) in ${DIST}\n${problems
      .map((p) => `  ${p}`)
      .join('\n')}\n`,
  );
  process.exit(1);
}
process.stdout.write(
  `verify-dist: ${html.length} HTML page(s), ${files.length} file(s) in ${DIST} — all internal URLs resolve\n`,
);

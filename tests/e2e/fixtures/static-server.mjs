/**
 * static-server.mjs — serves `dist/` under a SUB-PATH, so the portability claim
 * can be tested instead of asserted (Plan D §7, requirement R3).
 *
 * Started by `playwright.config.ts`'s second `webServer` entry:
 *
 *   node tests/e2e/fixtures/static-server.mjs <port> <prefix>
 *
 * WHY IT IS HAND-WRITTEN. Spec §4 forbids a new dependency, and `serve`/
 * `http-server` would be one for a job that is thirty lines of `node:http`. It
 * is also the more honest fixture: it deliberately behaves like the DUMBEST host
 * the site claims to support (a plain static server — an S3 website endpoint,
 * `python -m http.server`), so nothing here quietly rescues the artifact:
 *
 *   - `/x` is NOT resolved to `/x.html` and NOT redirected to `/x/`. Only the
 *     directory-format shape D1 ships (`x/index.html` at `/x/`) is served, which
 *     is exactly the R2 requirement that forced `build.format: 'directory'`.
 *   - anything outside the prefix is a 404, so a link that escaped the sub-path
 *     fails here rather than accidentally working.
 *
 * `dist/404.html` is served, with a 404 status, for anything unmatched under the
 * prefix — the same shape GitHub Pages and Cloudflare Pages give it, and the
 * reason its links stay root-absolute (plan §4.4).
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { join, normalize, resolve, sep } from 'node:path';
import process from 'node:process';

/* global URL -- Node has had a global WHATWG URL since 10; ESLint's `js.configs
   .recommended` env has no opinion about Node globals. */

const DIST = fileURLToPath(new URL('../../../dist', import.meta.url));

/** Extension → Content-Type. Everything the built site actually emits. */
const TYPES = new Map(
  Object.entries({
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
  }),
);

const port = Number(process.argv[2] ?? 0);
// Normalized to `/prefix` with no trailing slash, so `${prefix}/` is the site
// root. An empty argument means "mount at the origin root", which is what makes
// this fixture usable for the other half of the proof by hand.
const argument = (process.argv[3] ?? '').replace(/^\/+|\/+$/g, '');
const prefix = argument === '' ? '' : `/${argument}`;

/**
 * Maps a request path to a file under `dist/`, or `null`.
 *
 * @param {string} pathname - The request's decoded pathname.
 * @returns {string | null} An absolute path inside `dist/`, or `null`.
 */
function fileFor(pathname) {
  if (prefix && pathname !== prefix && !pathname.startsWith(`${prefix}/`)) {
    return null;
  }
  const withinSite = pathname.slice(prefix.length) || '/';
  // `normalize` collapses any `../` the artifact (or an attacker) produced; the
  // containment check below is what makes that a guarantee rather than a hope.
  const relative = normalize(
    withinSite.endsWith('/') ? `${withinSite}index.html` : withinSite,
  );
  const file = resolve(join(DIST, relative));
  if (file !== DIST && !file.startsWith(DIST + sep)) return null;
  return existsSync(file) && statSync(file).isFile() ? file : null;
}

createServer((request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(
      new URL(request.url ?? '/', 'http://localhost').pathname,
    );
  } catch {
    // A malformed escape sequence is a bad request, not a crash.
    response.writeHead(400).end();
    return;
  }

  const file = fileFor(pathname);
  const target = file ?? join(DIST, '404.html');
  const extension = target.slice(target.lastIndexOf('.'));
  response.writeHead(file ? 200 : 404, {
    'Content-Type': TYPES.get(extension) ?? 'application/octet-stream',
    // No caching: the suite rebuilds `dist/` between runs and a cached chunk
    // would be measured against the wrong build.
    'Cache-Control': 'no-store',
  });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  // A read error (a missing `dist/404.html`, a truncated file) must end the
  // response rather than take the whole fixture down mid-suite.
  createReadStream(target)
    .on('error', () => response.end())
    .pipe(response);
}).listen(port);

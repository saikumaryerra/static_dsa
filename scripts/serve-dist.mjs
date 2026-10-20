/**
 * serve-dist.mjs — `npm run preview`: serves a built `dist/` the way the
 * production host does, and no more kindly (React migration, D-13). Promoted
 * from the e2e sub-path fixture (`tests/e2e/fixtures/static-server.mjs`) when
 * portability was retired (D-01): the prefix argument is gone, the site is
 * served at the origin root.
 *
 *   PW_PORT=4440 PW_DIST=/tmp/ws/dist npm run preview
 *
 * - `PW_PORT` — port to bind (default 4321).
 * - `PW_DIST` — the `dist/` directory, absolute or relative to the repository
 *   root (default `dist`). Both exist so two implementers can serve their own
 *   builds side by side (plan §2.1).
 *
 * WHY IT IS HAND-WRITTEN. `serve`/`http-server` would be a dependency for a
 * job that is thirty lines of `node:http`. It is also the more honest fixture:
 * it deliberately behaves like the DUMBEST static host, so nothing here quietly
 * rescues the artifact:
 *
 *   - `/x` is NOT resolved to `/x.html` and NOT redirected to `/x/`. Only the
 *     directory-format shape the build ships (`x/index.html` at `/x/`) is
 *     served, so a slashless internal link is a hard 404 here — which is what
 *     gives `url-shape.spec.ts` its teeth (amendment U-1).
 *   - `dist/404.html` is served, with a 404 status, for anything unmatched —
 *     the shape Workers' `not_found_handling: "404-page"` gives it.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { isAbsolute, join, normalize, resolve, sep } from 'node:path';
import process from 'node:process';

/* global URL -- Node has had a global WHATWG URL since 10; ESLint's `js.configs
   .recommended` env has no opinion about Node globals. */

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const rawDist = process.env.PW_DIST || 'dist';
const DIST = resolve(isAbsolute(rawDist) ? rawDist : join(ROOT, rawDist));
const port = Number(process.env.PW_PORT || 4321);

// Fail loudly rather than serve a 404 for every request: a missing directory
// almost always means "build first" or a mistyped PW_DIST.
if (!existsSync(join(DIST, 'index.html'))) {
  process.stderr.write(
    `serve-dist: ${DIST} holds no built site (no index.html). Run \`npm run build\` (or \`LDSA_OUT=<dir> npm run build\` with PW_DIST=<dir>/dist) first.\n`,
  );
  process.exit(1);
}

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

/**
 * Maps a request path to a file under `dist/`, or `null`.
 *
 * @param {string} pathname - The request's decoded pathname.
 * @returns {string | null} An absolute path inside `dist/`, or `null`.
 */
function fileFor(pathname) {
  // `normalize` collapses any `../` the artifact (or an attacker) produced; the
  // containment check below is what makes that a guarantee rather than a hope.
  const relative = normalize(
    pathname.endsWith('/') ? `${pathname}index.html` : pathname,
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
  // response rather than take the whole server down mid-suite.
  createReadStream(target)
    .on('error', () => response.end())
    .pipe(response);
}).listen(port);

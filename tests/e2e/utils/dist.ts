/**
 * Where the e2e suite finds the build it is testing, and the port it is served on.
 *
 * Two overrides, both read by `playwright.config.ts` and by the specs that open
 * built files directly (`url-shape`, `js-budget`), so the server and the file
 * readers can never disagree about which `dist/` is under test:
 *
 * - `PW_DIST` — the `dist/` directory, absolute or relative to the repository
 *   root. Default `dist`. Its build metadata (`.build/page-manifest.json`) lives
 *   in the `.build/` SIBLING of that directory (react-migration-plan §2.1), so
 *   `LDSA_OUT=/tmp/ws npm run build` pairs with `PW_DIST=/tmp/ws/dist`.
 * - `PW_PORT` — the port `npm run preview` (`scripts/serve-dist.mjs`) binds.
 *   Default 4321, the port the suite has always used.
 *
 * They exist because the migration runs two implementers on one machine: each
 * builds into its own directory and runs a targeted spec on its own port
 * (plan §4) without clobbering the other's `dist/` or server. Unset, behaviour
 * is exactly the legacy suite's: `<repo>/dist` on `localhost:4321`.
 *
 * Pure and dependency-free so the Playwright config can import it.
 */
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

/** The repository root. `import.meta.url` is `<repo>/tests/e2e/utils/dist.ts`. */
export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/**
 * The port under test. A malformed value throws rather than falling back: a
 * typo that silently tested someone else's server on 4321 would be worse than
 * no run at all.
 */
export const PORT: number = (() => {
  const raw = process.env['PW_PORT'];
  if (raw === undefined || raw === '') return 4321;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(
      `PW_PORT must be a TCP port number, got ${JSON.stringify(raw)}`,
    );
  }
  return port;
})();

/** The origin the suite navigates against. */
export const BASE_URL = `http://localhost:${PORT}`;

const rawDist = process.env['PW_DIST'] ?? '';

/** Whether the caller pointed the suite at a specific, already-built `dist/`. */
export const DIST_OVERRIDDEN = rawDist !== '';

/** The built site under test, as an absolute path. */
export const DIST = resolve(REPO_ROOT, DIST_OVERRIDDEN ? rawDist : 'dist');

/** The build-metadata directory that belongs to {@link DIST} (its `.build/` sibling). */
export const BUILD_META = join(dirname(DIST), '.build');

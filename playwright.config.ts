// SPEC-GAP: @types/node was added as a devDependency (types-only, zero runtime
// bytes) so `astro check` can type `process.env` in this Node-executed config.
import { defineConfig, devices } from '@playwright/test';

/**
 * The sub-path the portability project mounts `dist/` at (Plan D §7, R3).
 *
 * TWO segments deep on purpose: a one-level prefix is satisfied by a pass that
 * gets the arithmetic half right, and `/deployments/learndsa` is not.
 *
 * FIXED rather than random, which is the opposite of what "prove nothing is
 * hardcoded" suggests — because this config file is re-imported by every worker
 * process. A random prefix would be generated once for the server command and
 * again, differently, for each worker's `baseURL`, and the suite would fail for
 * a reason that has nothing to do with portability. The spec itself never spells
 * the prefix: it navigates with relative URLs against `baseURL` and asserts only
 * that it is NOT at the origin root, so a hardcoded path in the artifact still
 * fails the test.
 */
const SUBPATH = '/deployments/learndsa';
/** Port for the sub-path fixture; `astro preview` owns 4321. */
const SUBPATH_PORT = 4322;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  // M7.1 Task 0: a missing baseline must FAIL CI, never silently become one.
  // Playwright defaults `updateSnapshots` to 'missing', which combines with the
  // retries above into a false green — attempt 1 writes the snapshot and fails,
  // attempt 2 passes against the file it just wrote, and the run exits 0. 'none'
  // makes CI compare only; locally 'missing' keeps the seed-then-review workflow.
  updateSnapshots: process.env['CI'] ? 'none' : 'missing',
  // On CI also emit the HTML report: it embeds the `on-first-retry` traces, so the
  // artifact the workflow uploads on failure is actually debuggable. Locally `list`
  // alone keeps the output terse (an html report would need a browser to read).
  reporter: process.env['CI']
    ? [['list'], ['html', { open: 'never' }]]
    : 'list',
  use: {
    baseURL: 'http://localhost:4321',
    trace: 'on-first-retry',
  },
  expect: {
    toHaveScreenshot: {
      // The site ships a pure system font stack (no self-hosted webfonts), so
      // glyph rasterization differs per machine. A small tolerance absorbs
      // antialiasing noise while still catching any real layout/color
      // regression — a shifted element dwarfs 0.2% of the page.
      maxDiffPixelRatio: 0.002,
      // Playwright's default template no longer includes {platform}, so a
      // baseline seeded on macOS would silently overwrite the CI-linux one and
      // red-line every subsequent run. Pin the platform into the filename; see
      // tests/e2e/baseline-visual.spec.ts for how baselines are seeded.
      pathTemplate:
        '{snapshotDir}/{testFileDir}/{testFileName}-snapshots/{arg}{-projectName}-{platform}{ext}',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      // The whole suite runs against the ROOT deployment, which is the other
      // half of the portability proof: the same `dist/` the sub-path project
      // walks is the one every other test here exercises at `/`.
      testIgnore: /portable\.spec\.ts/,
    },
    {
      // D2's requirement R3, served rather than argued: the same artifact under
      // `http://localhost:4322/deployments/learndsa/`.
      name: 'portable',
      testMatch: /portable\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${SUBPATH_PORT}${SUBPATH}/`,
      },
    },
  ],
  webServer: [
    {
      // e2e must exercise the real static output, so preview the built `dist/`.
      // Locally this is self-contained (build then preview). On CI the workflow has
      // already run `npm run build` as its own gate step, so rebuilding here would
      // run `astro check` + build a second time for no benefit. Skipping it is safe:
      // `astro preview` exits 1 with "The output directory ... does not exist" if
      // `dist/` is missing, so a mis-ordered pipeline fails loudly, never silently.
      command: process.env['CI']
        ? 'npm run preview'
        : 'npm run build && npm run preview',
      url: 'http://localhost:4321',
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
    },
    {
      // Second, and second for a reason: Playwright starts these in order, so
      // the build above has finished by the time this one is polled. It is a
      // deliberately dumb static server (no extension guessing, no redirects) —
      // the host class `build.format: 'directory'` exists to support.
      command: `node tests/e2e/fixtures/static-server.mjs ${SUBPATH_PORT} ${SUBPATH}`,
      url: `http://localhost:${SUBPATH_PORT}${SUBPATH}/`,
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
    },
  ],
});

// SPEC-GAP: @types/node was added as a devDependency (types-only, zero runtime
// bytes) so `astro check` can type `process.env` in this Node-executed config.
import { defineConfig, devices } from '@playwright/test';
import { BASE_URL, DIST, DIST_OVERRIDDEN, PORT } from './tests/e2e/utils/dist';

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
    // `PW_PORT` (default 4321) — see tests/e2e/utils/dist.ts for why it exists.
    baseURL: BASE_URL,
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
      // The sub-path `portable` project and its :4322 server are retired with
      // the portable artifact (react-migration D-01): the site deploys at one
      // origin. The spec file itself is deleted in migration phase P4 together
      // with `scripts/portablize.mjs`; until then it is ignored here so this
      // root-deployment project does not pick it up.
      testIgnore: /portable\.spec\.ts/,
    },
  ],
  webServer: {
    // e2e must exercise the real static output, so serve the built `dist/`
    // through `npm run preview` (`scripts/serve-dist.mjs`: no redirects,
    // `404.html` for anything unmatched — the host class Workers static assets
    // belongs to).
    //
    // Locally this is self-contained (build then preview). On CI the workflow
    // has already run `npm run build` as its own gate step, so rebuilding here
    // would typecheck and build a second time for no benefit. Skipping it is
    // safe because the server refuses to start without the directory, so a
    // mis-ordered pipeline fails loudly, never silently.
    //
    // An explicit `PW_DIST` also skips the build: it names a build the caller
    // already made (`LDSA_OUT=/tmp/ws npm run build`, then
    // `PW_DIST=/tmp/ws/dist`), and `npm run build` would write to a different
    // directory than the one being served, so building would only cost minutes.
    command:
      process.env['CI'] || DIST_OVERRIDDEN
        ? 'npm run preview'
        : 'npm run build && npm run preview',
    // The server's interface: it binds `PW_PORT` and serves `PW_DIST`. Passed
    // explicitly (absolute path, resolved port) so the server and the specs
    // that read `dist/` from disk resolve the same directory.
    env: { PW_PORT: String(PORT), PW_DIST: DIST },
    url: BASE_URL,
    reuseExistingServer: !process.env['CI'],
    // The local command includes the full build, measured at ~393 s on the
    // legacy stack; the old 120 s only fit because `reuseExistingServer` let a
    // developer start the server by hand. A timeout here is a failed run.
    timeout: 600_000,
  },
});

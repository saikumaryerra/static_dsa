// SPEC-GAP: @types/node was added as a devDependency (types-only, zero runtime
// bytes) so `astro check` can type `process.env` in this Node-executed config.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
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
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
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
});

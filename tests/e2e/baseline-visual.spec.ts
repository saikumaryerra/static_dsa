/**
 * M7.1 Task 0 — pixel half of the regression baseline. OPT-IN, and deliberately
 * skipped by default.
 *
 * STATUS AS OF M7.3: UNSEEDED — this file is a gate waiting for its baselines,
 * not coverage. No PNG has ever been committed under
 * `tests/e2e/baseline-visual.spec.ts-snapshots/` (the directory does not exist),
 * and the only place `VISUAL_BASELINE` is set is the manual seeding job in
 * `.github/workflows/ci.yml` — never on the DoD gate. So all 14 tests below skip
 * on every push, every PR, and every local run, and a green `npm run test:e2e`
 * says nothing whatsoever about pixels. M7.3 repainted every surface on the site
 * and went through review with this half of Task 0 inert; the two steps that fix
 * that are below, and the first of them is a one-click workflow dispatch.
 *
 * WHY SKIPPED: the site ships a pure system font stack with no self-hosted
 * webfonts (tokens.css `--font-sans`), so the fonts that resolve — and their
 * hinting and subpixel rasterization — differ between a developer machine and
 * CI's ubuntu-latest runner. A PNG generated locally and committed would fail
 * every CI run forever, which trains everyone to ignore the visual gate. So the
 * baselines live only where they can be compared like-for-like.
 *
 * TURNING IT ON — two steps, in this order, both in the CI environment:
 *
 *   1. SEED. Run the `Seed visual baselines` job (Actions → CI → Run workflow)
 *      in `.github/workflows/ci.yml`, which does exactly:
 *        VISUAL_BASELINE=1 npx playwright test tests/e2e/baseline-visual.spec.ts \
 *          --update-snapshots
 *      on the same `ubuntu-latest` image the e2e job uses, and uploads the PNGs
 *      as the `visual-baselines` artifact. Review them, then commit them to
 *      `tests/e2e/baseline-visual.spec.ts-snapshots/`.
 *      Equivalent locally — the official image pinned to the installed
 *      Playwright version, which is what the runner uses:
 *        docker run --rm -v "$PWD":/w -w /w -e VISUAL_BASELINE=1 \
 *          mcr.microsoft.com/playwright:v1.61.1-noble \
 *          npx playwright test tests/e2e/baseline-visual.spec.ts --update-snapshots
 *   2. GATE. Only once those PNGs are committed, set `VISUAL_BASELINE: '1'` on
 *      the e2e step of the `DoD gate` job so the comparison actually runs there.
 *      `updateSnapshots: 'none'` on CI (playwright.config.ts) then makes a
 *      missing or stale baseline a failure rather than a silent regeneration,
 *      and `maxDiffPixelRatio` absorbs antialiasing noise only. Flipping the
 *      gate BEFORE step 1 red-lines every run, which is why the flag is not set
 *      on that job today.
 *
 * THEME FORCING: every other spec forces the theme with
 * `page.addInitScript(localStorage.setItem('theme', …))`. That is unusable here,
 * because init scripts never execute under `javaScriptEnabled: false` — a
 * "dark + JS off" capture would silently record the LIGHT theme as the dark
 * reference. Context-level `colorScheme` emulation works in both modes and is
 * exactly equivalent for this site: with JS the pre-paint script resolves the OS
 * preference to `data-theme`, and without JS tokens.css's
 * `prefers-color-scheme: dark` mirror — asserted byte-for-byte equal to the
 * `[data-theme="dark"]` block in tests/unit/tokens-contrast.test.ts — paints the
 * identical palette.
 */
import { expect, test, type Page } from '@playwright/test';

// One flag gates the whole file: without a baseline generated in the CI
// environment these tests can only produce false failures (see above).
test.skip(
  !process.env['VISUAL_BASELINE'],
  'Visual baselines are generated and compared in the CI environment only — set VISUAL_BASELINE=1 (see the file header).',
);

const THEMES = ['light', 'dark'] as const;

/** Routes captured with JS enabled (the full, hydrated page). */
const ROUTES: { name: string; path: string; hydrates: boolean }[] = [
  { name: 'home', path: '/', hydrates: false },
  { name: 'learn-index', path: '/learn', hydrates: false },
  {
    name: 'lesson-binary-search',
    path: '/learn/binary-search',
    hydrates: true,
  },
  { name: 'glossary', path: '/glossary', hydrates: false },
  { name: 'not-found', path: '/404', hydrates: false },
];

/**
 * Routes captured with JS disabled. Home covers the shared chrome degradation
 * (the theme toggle's noscript kill-switch); the lesson covers the one that
 * matters most — the visualizer's build-time static still standing in for the
 * live player. The three remaining routes are static prose whose JS-off
 * rendering is identical to the captures above.
 */
const NOJS_ROUTES = ROUTES.filter(
  (route) => route.name === 'home' || route.name === 'lesson-binary-search',
);

/** Hydrates every visualizer on the page (both of them on the lesson route). */
async function hydrateAllViz(page: Page): Promise<void> {
  const roots = page.locator('[data-viz]');
  const count = await roots.count();
  for (let i = 0; i < count; i += 1) {
    const root = roots.nth(i);
    await root.scrollIntoViewIfNeeded();
    await expect(root).toHaveAttribute('data-viz-ready', 'true', {
      timeout: 15_000,
    });
  }
}

/**
 * Returns the page to the top and waits for the scroll to land. Hydration
 * scrolls the page, and the ToC scroll-spy derives `aria-current` from what is
 * in view — so capturing without resetting would bake an arbitrary rail
 * highlight into the baseline.
 */
async function settleAtTop(page: Page): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
}

for (const theme of THEMES) {
  test.describe(`${theme} theme`, () => {
    test.use({ colorScheme: theme });

    for (const { name, path, hydrates } of ROUTES) {
      test(`${name} renders unchanged`, async ({ page }) => {
        await page.goto(path);
        if (hydrates) {
          await hydrateAllViz(page);
          await settleAtTop(page);
        }
        await expect(page).toHaveScreenshot(`${name}-${theme}.png`, {
          fullPage: true,
        });
      });
    }
  });

  test.describe(`${theme} theme, JavaScript disabled`, () => {
    test.use({ colorScheme: theme, javaScriptEnabled: false });

    for (const { name, path } of NOJS_ROUTES) {
      test(`${name} degrades unchanged`, async ({ page }) => {
        await page.goto(path);
        await expect(page).toHaveScreenshot(`${name}-${theme}-nojs.png`, {
          fullPage: true,
        });
      });
    }
  });
}

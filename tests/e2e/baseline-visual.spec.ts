/**
 * M7.1 Task 0 — pixel half of the regression baseline. OPT-IN, and deliberately
 * skipped by default.
 *
 * STATUS: UNSEEDED — this file is a gate waiting for its baselines, not
 * coverage. No PNG has ever been committed under
 * `tests/e2e/baseline-visual.spec.ts-snapshots/` (the directory does not exist),
 * and the only place `VISUAL_BASELINE` is set is the manual seeding job in
 * `.github/workflows/ci.yml` — never on the DoD gate. So the 14 captures below
 * skip on every push, every PR, and every local run, and a green
 * `npm run test:e2e` says nothing whatsoever about pixels. M7.3 repainted every
 * surface on the site and went through review with this half of Task 0 inert;
 * the two steps that fix that are below, and the first of them is a one-click
 * workflow dispatch.
 *
 * SO THE SKIP SAYS SO OUT LOUD. Fourteen silently-skipped tests read as coverage
 * in a green run; that is how three repaint phases passed over an inert gate.
 * Three things make the state legible instead:
 *   - every capture DECLARES an annotation naming the gate it sits behind, and
 *     `test.skip`'s own reason rides along as a second one when it skips (both
 *     verified present in the reporter's output, skipped and not);
 *   - the always-running test below PRINTS the state on every run — how many
 *     baselines exist for this platform, how many captures were skipped, and the
 *     next action;
 *   - and that test FAILS if the two-step flow was left half-done, i.e. if
 *     baselines exist for this platform and nothing compares them. That is the
 *     guard the flow actually needs: step 1 ends in a reviewable artifact, so
 *     nobody forgets it, while step 2 is one line in a workflow file.
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
 *      That command works despite `updateSnapshots: 'none'` in the config, and
 *      the job ends GREEN — both verified against the installed Playwright
 *      (1.61.1): the CLI option wins over the config value, a bare
 *      `--update-snapshots` means `changed`, and in that mode a MISSING snapshot
 *      is written and the assertion passes. So a red seeding run means something
 *      actually broke, not "it wrote the files".
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
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/** Whether the pixel comparison is switched on for this run. */
const BASELINE_ON = !!process.env['VISUAL_BASELINE'];

/**
 * The skip message, written once for both describes. Playwright turns it into a
 * `skip` annotation on every capture it skips, so it reaches the report as well
 * as this constant's two call sites.
 */
const SKIP_REASON =
  'Visual baselines are generated and compared in the CI environment only — no PNG is committed yet, and VISUAL_BASELINE is unset. Seed them with the "Seed visual baselines" workflow job, then set VISUAL_BASELINE on the DoD gate (see the file header).';

/**
 * The annotation every capture declares, skipped or not.
 *
 * Worded for BOTH states on purpose: a declared annotation is attached whatever
 * the run does, so repeating the skip reason here would ship a sentence that is
 * false in exactly the run that matters — the one where the gate is finally
 * armed.
 */
const GATE_NOTE = {
  type: 'visual-baseline',
  description:
    'Pixel comparison. Runs only when VISUAL_BASELINE is set, against baselines seeded in the CI environment — see the header of tests/e2e/baseline-visual.spec.ts.',
};

/**
 * Where `playwright.config.ts`'s `toHaveScreenshot.pathTemplate` writes this
 * file's PNGs: `{snapshotDir}/{testFileDir}/{testFileName}-snapshots/…`, and
 * `snapshotDir` defaults to `testDir`, which is this directory.
 */
const SNAPSHOT_DIR = fileURLToPath(
  new URL('./baseline-visual.spec.ts-snapshots', import.meta.url),
);

/**
 * The committed baselines that THIS run could actually compare against.
 *
 * Filtered by platform because the same template pins `{platform}` into every
 * filename: a set seeded on CI's `linux` is invisible to a `darwin` run, and
 * counting it there would report a gate as armed when it is not.
 */
function committedBaselines(): string[] {
  if (!existsSync(SNAPSHOT_DIR)) return [];
  return readdirSync(SNAPSHOT_DIR)
    .filter((name) => name.endsWith(`-${process.platform}.png`))
    .sort();
}

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

/** How many pixel comparisons this file declares (14 today: 10 + 4). */
const CAPTURES = THEMES.length * (ROUTES.length + NOJS_ROUTES.length);

/**
 * The one test in this file that never skips: it reports the gate's own state.
 *
 * A skipped test is an absence, and absences are invisible in a green run — which
 * is exactly how this baseline stayed inert through three repaint phases. So the
 * state is printed on every run, and the one configuration that would silently
 * waste the work is a failure.
 */
test('the pixel baseline reports which of its two states it is in', async () => {
  const baselines = committedBaselines();
  const seeded = baselines.length > 0;
  // Four states, and each one names the next action rather than the situation.
  // "Two states" in the title is the intent; these are the ways the two-step
  // flow can be caught mid-stride.
  let state: string;
  if (BASELINE_ON && seeded) {
    state = `ARMED — comparing ${CAPTURES} captures against ${baselines.length} committed ${process.platform} baselines.`;
  } else if (BASELINE_ON) {
    state = `SEEDING — VISUAL_BASELINE is set and no ${process.platform} baseline is committed yet, so a run started with --update-snapshots WRITES the PNGs and passes. Review them, then commit them to tests/e2e/baseline-visual.spec.ts-snapshots/.`;
  } else if (seeded) {
    state = `HALF-DONE — ${baselines.length} ${process.platform} baselines are committed but nothing compares them, so all ${CAPTURES} captures skipped. Next action: step 2, below.`;
  } else {
    state = `OFF — ${CAPTURES} pixel comparisons are skipped and this run says nothing about pixels. No ${process.platform} baseline is committed. Next action: run the "Seed visual baselines" job in .github/workflows/ci.yml (Actions → CI → Run workflow), review and commit the artifact, then set VISUAL_BASELINE on the DoD gate's e2e step.`;
  }

  const line = `visual baseline: ${state}`;
  // `process.stdout.write`, not `console` — eslint bans every console method
  // repo-wide (§18). Playwright captures this per test, so the list reporter
  // prints it on every run; the annotation carries the same words into the HTML
  // report the CI workflow uploads on failure.
  process.stdout.write(`${line}\n`);
  test.info().annotations.push({ type: 'visual-baseline', description: state });

  // THE HALF-DONE STATE. Step 1 (seeding) ends in a reviewable artifact, so
  // nobody forgets it; step 2 is one line in a workflow file, so everybody does.
  // Baselines committed with nothing comparing them is the outcome that looks
  // finished and is not.
  expect(
    baselines.length === 0 || BASELINE_ON,
    `${baselines.length} ${process.platform} baseline PNGs are committed, but VISUAL_BASELINE is unset, so all ${CAPTURES} comparisons skipped. Finish step 2 of the flow: add VISUAL_BASELINE: '1' to the "npm run test:e2e" step of the DoD gate in .github/workflows/ci.yml.`,
  ).toBe(true);
});

for (const theme of THEMES) {
  test.describe(`${theme} theme`, () => {
    test.use({ colorScheme: theme });
    // Gated per describe rather than per file: the status test above has to run
    // even — especially — when the comparisons do not.
    test.skip(!BASELINE_ON, SKIP_REASON);

    for (const { name, path, hydrates } of ROUTES) {
      test(
        `${name} renders unchanged`,
        { annotation: GATE_NOTE },
        async ({ page }) => {
          await page.goto(path);
          if (hydrates) {
            await hydrateAllViz(page);
            await settleAtTop(page);
          }
          await expect(page).toHaveScreenshot(`${name}-${theme}.png`, {
            fullPage: true,
          });
        },
      );
    }
  });

  test.describe(`${theme} theme, JavaScript disabled`, () => {
    test.use({ colorScheme: theme, javaScriptEnabled: false });
    test.skip(!BASELINE_ON, SKIP_REASON);

    for (const { name, path } of NOJS_ROUTES) {
      test(
        `${name} degrades unchanged`,
        { annotation: GATE_NOTE },
        async ({ page }) => {
          await page.goto(path);
          await expect(page).toHaveScreenshot(`${name}-${theme}-nojs.png`, {
            fullPage: true,
          });
        },
      );
    }
  });
}

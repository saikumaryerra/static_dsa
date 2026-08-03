/**
 * M7.1 Task 0 — the committed regression baseline.
 *
 * WHAT THIS IS, EXACTLY: a FORWARD baseline. The snapshots were recorded at the
 * END of M7.1, against the repaired site, so they encode M7.1's output — they
 * are not, and never were, a record of M6 that M7.1 was diffed against (the repo
 * had no structural baseline before this file, so that comparison is not
 * available to anyone). Their job starts now: M7.2, M7.3 and M8 regress against
 * them, and any diff a later phase produces is either a bug or an intentional
 * change re-approved in the same PR.
 *
 * Each snapshot captures the accessibility tree of the whole page — every
 * heading level, landmark, control name, link text and list structure it
 * exposes. `<body>` and not `<main>`: the skip link, the header (its nav and the
 * theme toggle) and the footer sit OUTSIDE `main`, and M7.1 changed exactly that
 * chrome (IA-9 / VD-9 nav state, THM-1 theme toggle), so a `main`-scoped
 * baseline would have been structurally blind to it. Unlike the pixel baselines
 * in `baseline-visual.spec.ts` an aria snapshot is plain text, so it is
 * machine-independent and safe to commit and to review in a diff.
 *
 * What it CANNOT see: the aria snapshot format renders roles, names and
 * structure only — `aria-current` is not serialized at all. The nav-state
 * assertions at the bottom of this file are the compensating direct check.
 *
 * SEEDING (required once, after any INTENTIONAL structural change, and after any
 * change to the snapshot ROOT above):
 *
 *     npx playwright test tests/e2e/baseline-aria.spec.ts --update-snapshots
 *
 * writes `tests/e2e/baseline-aria.spec.ts-snapshots/*.aria.yml`. Those files must
 * be reviewed like source and committed in the same PR as the change that moved
 * them. CI runs with `updateSnapshots: 'none'` (playwright.config.ts), so a
 * missing or stale baseline fails the run instead of quietly regenerating it.
 *
 * `.prettierignore` excludes `tests/e2e/*-snapshots/`: Prettier parses
 * `.aria.yml` as YAML and re-indents Playwright's nested sequences, so a
 * formatted snapshot would fail `npm run format:check` (DoD §18) while being
 * unfixable — reformatting it changes bytes Playwright regenerates verbatim on
 * every update.
 *
 * Snapshot matching is subset-based by default ("contain"), so a NEW element is
 * not a failure but a removed/renamed one is — the right sensitivity for a
 * milestone that is adding UI on purpose.
 */
import { expect, test, type Page } from '@playwright/test';

/** The five key routes, with the snapshot name each writes. */
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
 * Hydrates EVERY visualizer on the page and waits for each to report ready.
 *
 * The binary-search lesson hosts two array visualizers, and each mounts through
 * its own IntersectionObserver. Waiting for only the first one would snapshot a
 * page whose second viz is mid-upgrade — a race that shows up as a flaky diff in
 * the still-vs-live canvas. Mirrors the `hydrateViz` helper in
 * binary-search.spec.ts, widened to all roots.
 */
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

for (const { name, path, hydrates } of ROUTES) {
  test(`aria baseline: ${name}`, async ({ page }) => {
    await page.goto(path);
    if (hydrates) await hydrateAllViz(page);
    // Now that the chrome is in scope, the theme toggle is too — and it ships
    // with the SSR name "Toggle theme", which its island rewrites to the action
    // it performs. Deferred module scripts run before the `load` event `goto`
    // awaits, so this has already happened; assert it anyway rather than trust
    // the ordering, because a snapshot that caught the pre-hydration name would
    // be a baseline nobody could reproduce.
    await expect(
      page.getByRole('button', { name: /^Switch to (dark|light) theme$/ }),
    ).toBeVisible();

    // `body`, not `main` — the documented whole-page form of this assertion, and
    // the only one that reaches the shared chrome (see the file header).
    await expect(page.locator('body')).toMatchAriaSnapshot({
      name: `${name}.aria.yml`,
    });
  });
}

/**
 * Nav location cues (M7.1 IA-9 + VD-9) — the part no snapshot above can express.
 *
 * `aria-current` never appears in an aria snapshot, so a regression that stopped
 * marking the current nav item would leave all five baselines byte-identical and
 * green. Hence a direct assertion — and it belongs against the BUILT site, which
 * is what `playwright.config.ts` previews: `build.format: 'file'` emits `/learn`
 * as `learn.html`, so a nav that matches on `Astro.url.pathname` verbatim marks
 * the item correctly in `astro dev` and marks NOTHING in production. That is the
 * exact bug M7.1 fixed, and only a built-site assertion can catch its return.
 */
test.describe('nav location cues', () => {
  /** The header nav's own "Learn" link — `exact` so "LearnDSA" can't match. */
  function headerLearn(page: Page) {
    return page
      .locator('.site-nav')
      .getByRole('link', { name: 'Learn', exact: true });
  }

  test('a lesson marks its section as the current item, visibly', async ({
    page,
  }) => {
    await page.goto('/learn/binary-search');

    // "true" (current item in its set), not "page": the URL is a descendant of
    // /learn, not /learn itself.
    await expect(headerLearn(page)).toHaveAttribute('aria-current', 'true');
    // VD-9: colour alone made "current" byte-identical to "hover", so the state
    // also carries a 2px inset brand underline. Matching /inset/ asserts both
    // that a shadow exists at all and that it is that rule.
    await expect(headerLearn(page)).toHaveCSS('box-shadow', /inset/);

    // Control: an unrelated nav item is neither marked nor underlined, so the
    // two assertions above cannot pass through a blanket rule.
    const glossary = page
      .locator('.site-nav')
      .getByRole('link', { name: 'Glossary', exact: true });
    await expect(glossary).not.toHaveAttribute('aria-current');
    await expect(glossary).toHaveCSS('box-shadow', 'none');
  });

  test('the /learn index marks itself as the current page', async ({
    page,
  }) => {
    await page.goto('/learn');

    await expect(headerLearn(page)).toHaveAttribute('aria-current', 'page');
    await expect(headerLearn(page)).toHaveCSS('box-shadow', /inset/);
  });

  test('the footer repeat of the nav never claims to be current', async ({
    page,
  }) => {
    await page.goto('/learn');

    const footer = page.getByRole('contentinfo');
    const links = footer.locator('.nav-link');
    // Non-vacuous: fail loudly if the footer nav is ever renamed away from
    // `.nav-link` rather than silently asserting nothing about zero elements.
    expect(await links.count()).toBeGreaterThan(0);
    await expect(footer.locator('.nav-link[aria-current]')).toHaveCount(0);
    // The underline rule is deliberately scoped to `.site-nav`; the duplicate
    // footer link to the very page we are on must stay unstyled.
    await expect(
      footer.getByRole('link', { name: 'Learn', exact: true }),
    ).toHaveCSS('box-shadow', 'none');
  });
});

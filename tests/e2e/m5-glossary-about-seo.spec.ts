import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
// M7.2: the anchor-settle helper moved to a shared module so the new glossary
// and wayfinding specs use the SAME definition rather than a third copy of it.
// It cannot live in a spec file: importing one spec from another makes
// Playwright register the imported tests twice.
import { waitForAnchorScroll } from './utils/scroll';
import { linkTarget, resolveFrom } from './utils/urls';

/**
 * M5 independent QA (spec §17 M5 acceptance + §14 SEO + §12 a11y; arch/design docs
 * m5-architecture.md §1/§7 and m5-design.md §1–§3).
 *
 * These exercise the REAL static output (playwright.config builds + previews). They
 * cover the surfaces M5 newly puts in scope and that the M1/M4 suites do not reach:
 *   - the axe gate on /glossary, /about, /404 in BOTH themes (M5 hard gate: the four
 *     axe-tested pages are home + one lesson + glossary + 404; about hosts an island
 *     and is spot-checked too — design §4);
 *   - glossary jump-bar behavior (present links vs non-focusable empty letters, the
 *     scroll-margin offset that lands headings below the sticky chrome, xref links
 *     resolving, full JS-off operation);
 *   - the home curriculum block being DATA-DRIVEN (design §3.5), never hardcoded;
 *   - the About live demo hydrating and degrading gracefully with JS off;
 *   - SEO artifacts served by the build (sitemap.xml reachable from robots.txt).
 */

// ---------------------------------------------------------------------------
// 1. axe gate — glossary + about + 404, both themes. Hard M5 gate: zero critical.
//    We additionally enforce zero SERIOUS: none of these three pages ship Shiki
//    code blocks (the one tracked color-contrast debt lives only inside lesson
//    code blocks — m4-lessons.spec.ts), so anything serious here is a real defect.
// ---------------------------------------------------------------------------
const AXE_PAGES: { path: string; name: string }[] = [
  { path: '/glossary/', name: 'glossary' },
  { path: '/about/', name: 'about' },
  // `/404/` — the slashless form does not reach this site's 404 document under
  // `trailingSlash: 'always'`, so axe would scan Astro's error page instead.
  { path: '/404/', name: '404' },
];

for (const { path, name } of AXE_PAGES) {
  for (const theme of ['light', 'dark'] as const) {
    test(`axe: ${name} (${theme} theme) — zero critical, zero serious`, async ({
      page,
    }) => {
      await page.addInitScript((value) => {
        localStorage.setItem('theme', value);
      }, theme);
      await page.goto(path);

      // About embeds the binary-search island; let it hydrate so axe scans the
      // real rendered viz, not just the static fallback.
      if (name === 'about') {
        const viz = page.locator('[data-viz]').first();
        await viz.scrollIntoViewIfNeeded();
        await expect(viz).toHaveAttribute('data-viz-ready', 'true', {
          timeout: 15_000,
        });
      }

      const results = await new AxeBuilder({ page }).analyze();
      const blocking = results.violations
        .filter((v) => v.impact === 'critical' || v.impact === 'serious')
        .map((v) => `${v.impact} ${v.id}: ${v.help}`);
      expect(blocking).toEqual([]);
    });
  }
}

// ---------------------------------------------------------------------------
// 2. Glossary structure + jump bar (design §1).
// ---------------------------------------------------------------------------
test.describe('glossary page', () => {
  test('renders all terms grouped A–Z with a labelled jump nav', async ({
    page,
  }) => {
    await page.goto('/glossary/');

    // Exactly one h1; every present letter has an <h2> section.
    await expect(page.locator('h1')).toHaveCount(1);
    const terms = page.locator('.glossary__term');
    expect(await terms.count()).toBeGreaterThanOrEqual(40);

    // The jump nav is a real labelled landmark.
    const jump = page.getByRole('navigation', { name: 'Jump to letter' });
    await expect(jump).toBeVisible();

    // Present letters are links; empty letters are non-link, non-focusable spans
    // carrying aria-disabled (a structural signal, not color-only) — design §1.3/§1.8.
    const emptyChips = page.locator('.glossary__chip--empty');
    expect(await emptyChips.count()).toBeGreaterThan(0);
    for (const chip of await emptyChips.all()) {
      expect(await chip.evaluate((el) => el.tagName)).toBe('SPAN');
      await expect(chip).toHaveAttribute('aria-disabled', 'true');
      // A <span> with no href/tabindex is never a tab stop.
      expect(await chip.getAttribute('href')).toBeNull();
      expect(await chip.getAttribute('tabindex')).toBeNull();
    }
  });

  test('every "Introduced in …" xref resolves to a real lesson page', async ({
    page,
    request,
  }) => {
    await page.goto('/glossary/');
    const hrefs = await page
      .locator('.glossary__xref')
      .evaluateAll((els) =>
        Array.from(
          new Set(
            els.map((el) => (el as HTMLAnchorElement).getAttribute('href')),
          ),
        ),
      );
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      // Resolved against the glossary page, because D2 made the attribute
      // document-relative (`../learn/graphs/`). Anchored on the trailing slash
      // (D1): `trailingSlash: 'always'` makes the slashless form a 404, so a
      // glossary cross-link that lost its slash must fail HERE, on the shape,
      // rather than as a confusing 404 two lines down.
      const target = resolveFrom(page.url(), href!);
      expect(target).toMatch(/^\/learn\/[a-z0-9-]+\/$/);
      const res = await request.get(target);
      expect(res.status(), `${target} should be reachable`).toBe(200);
    }
  });

  // Jump-anchor offset: clicking a letter must land its <h2> BELOW the sticky
  // chrome, in both breakpoints (scroll-margin-top 4.5rem mobile / 7.75rem desktop,
  // design §1.4). Geometry is theme-independent, so one theme per breakpoint proves
  // the offset; the axe block above covers both themes for contrast.
  for (const bp of [
    { name: 'mobile', width: 375, height: 720 },
    { name: 'desktop', width: 1280, height: 900 },
  ] as const) {
    test(`jumping to a letter lands its heading below the sticky header (${bp.name})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await page.goto('/glossary/');

      // Jump to "S" (always populated — Stack, Sort, Search, …).
      await page.locator('a.glossary__chip[href="#letter-s"]').click();

      const heading = page.locator('#letter-s-h');
      await expect(heading).toBeVisible();

      // M7.1 MOT-1 gave the site `scroll-behavior: smooth`, so the anchor jump is
      // now animated: measuring straight after the click samples the scroll
      // mid-flight. Wait for it to land, keeping this assertion about the RESTING
      // offset (what scroll-margin-top governs), reduced motion or not.
      await waitForAnchorScroll(page);

      const headerBottom = await page
        .getByRole('banner')
        .evaluate((el) => el.getBoundingClientRect().bottom);
      const headingTop = await heading.evaluate(
        (el) => el.getBoundingClientRect().top,
      );

      // The heading clears the sticky header — the whole point of scroll-margin-top.
      expect(headingTop).toBeGreaterThanOrEqual(headerBottom - 1);
      // …and it is not pushed absurdly far down the viewport.
      expect(headingTop).toBeLessThan(bp.height / 2);
    });
  }
});

// JS-OFF: the glossary is a static, island-free page — anchors + xref links must
// work with JavaScript disabled (design §1.6).
test.describe('glossary with JavaScript disabled', () => {
  test.use({ javaScriptEnabled: false });

  test('renders terms and working anchor/xref links without JS', async ({
    page,
  }) => {
    await page.goto('/glossary/');
    expect(
      await page.locator('.glossary__term').count(),
    ).toBeGreaterThanOrEqual(40);
    // Jump anchors are native fragment links (no JS needed).
    await expect(
      page.locator('a.glossary__chip[href="#letter-a"]'),
    ).toHaveAttribute('href', '#letter-a');
    // A cross-link is a real <a href> into a lesson.
    const firstXref = page.locator('.glossary__xref').first();
    await linkTarget(page, firstXref).toMatch(/^\/learn\/[a-z0-9-]+\/$/);
  });
});

// ---------------------------------------------------------------------------
// 3. Home — the curriculum block is data-driven (design §3.5), never hardcoded.
// ---------------------------------------------------------------------------
test('home curriculum + heading reflect the real catalogue', async ({
  page,
}) => {
  await page.goto('/');

  // Every number here is derived from the published collection, so this test
  // reads the catalogue and checks the page against it rather than against a
  // count typed twice. Since the course expansion (decision D-05) the home page
  // names the COURSES and their modules: a hundred-odd lesson links on a landing
  // page is a directory, not an answer.
  const catalogue = await page.evaluate(async () => {
    const res = await fetch('/learn/');
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const host = doc.querySelector('[data-lessons]');
    return JSON.parse(host?.getAttribute('data-lessons') ?? '[]') as {
      slug: string;
      track: string;
      course: string;
    }[];
  });
  expect(catalogue.length, 'the catalogue must be non-empty').toBeGreaterThan(
    15,
  );
  const courseIds = [...new Set(catalogue.map((l) => l.course))];

  await expect(
    page.getByRole('heading', {
      name: `${catalogue.length} lessons, ${courseIds.length} courses`,
    }),
  ).toBeVisible();

  const metaText = await page
    .locator('.curriculum .course-block__meta')
    .allInnerTexts();
  expect(metaText).toHaveLength(courseIds.length);
  const joined = metaText.join(' | ');
  // Each course states its own lesson count and a difficulty spread in WORDS
  // (never a colour-only chip — §3.8, WCAG 1.4.1).
  for (const course of courseIds) {
    const n = catalogue.filter((l) => l.course === course).length;
    expect(joined, `${course} states its lesson count`).toContain(
      `${n} lesson`,
    );
  }
  expect(joined).toMatch(/beginner|intermediate/);

  // Each course heading links to that course's page. Matched on the RESOLVED
  // target rather than on the attribute: D2 made these relative
  // (`./learn/kubernetes/` from home), and the path surviving the rewrite is
  // half of what this assertion is worth.
  const courseTargets = (
    await page
      .locator('.curriculum .course-block__title a')
      .evaluateAll((links) =>
        links.map((a) => (a as HTMLAnchorElement).getAttribute('href') ?? ''),
      )
  ).map((href) => resolveFrom(page.url(), href));
  expect(courseTargets).toEqual(courseIds.map((id) => `/learn/${id}/`));

  // The strongest form of "never hardcoded": the module rows are the SAME
  // modules the course pages render, in the same order, because both derive
  // from the published collection. A hand-typed list here would have to be
  // edited twice to keep this passing, which is the drift the derivation exists
  // to prevent.
  const moduleTargets = (
    await page
      .locator('.curriculum .course-block__item')
      .evaluateAll((links) =>
        links.map((a) => (a as HTMLAnchorElement).getAttribute('href') ?? ''),
      )
  ).map((href) => resolveFrom(page.url(), href));
  const expected = courseIds.flatMap((course) => {
    const seen: string[] = [];
    for (const lesson of catalogue) {
      if (lesson.course === course && !seen.includes(lesson.track))
        seen.push(lesson.track);
    }
    return seen.map((track) => `/learn/${course}/#track-${track}`);
  });
  expect(moduleTargets).toEqual(expected);
});

// ---------------------------------------------------------------------------
// 4. About — the trimmed live demo hydrates and is keyboard-reachable.
// ---------------------------------------------------------------------------
test('about live demo hydrates and is operable', async ({ page }) => {
  await page.goto('/about/');
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('h2')).toHaveCount(3);

  const viz = page.locator('[data-viz]').first();
  await viz.scrollIntoViewIfNeeded();
  await expect(viz).toHaveAttribute('data-viz-ready', 'true', {
    timeout: 15_000,
  });

  // The trimmed demo omits the custom-input form (allowCustomInput={false}).
  await expect(viz.locator('[data-viz-form]')).toHaveCount(0);

  // Step-forward advances the step counter (proves the island is live).
  const counter = viz.locator('[data-viz-counter]');
  const before = await counter.textContent();
  await viz.locator('[data-viz-forward]').click();
  await expect(counter).not.toHaveText(before ?? '');
});

test.describe('about with JavaScript disabled', () => {
  test.use({ javaScriptEnabled: false });

  test('prose renders and the viz degrades to its static fallback', async ({
    page,
  }) => {
    await page.goto('/about/');
    await expect(page.locator('h1')).toHaveCount(1);
    // The Visualizer root is still present (SSR), just never hydrates.
    await expect(page.locator('[data-viz]').first()).toBeVisible();
    await expect(page.locator('[data-viz]').first()).not.toHaveAttribute(
      'data-viz-ready',
      'true',
    );
  });
});

// ---------------------------------------------------------------------------
// 5. SEO artifacts served by the build (spec §14).
// ---------------------------------------------------------------------------
test('sitemap.xml + robots.txt are served and cross-referenced', async ({
  request,
}) => {
  const robots = await request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  const robotsBody = await robots.text();
  expect(robotsBody).toMatch(/Allow: \//);
  const sitemapLine = robotsBody.match(/Sitemap:\s*(\S+)/);
  expect(sitemapLine, 'robots.txt lists a Sitemap').not.toBeNull();

  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  const xml = await sitemap.text();
  // Static routes + every published lesson; no /404, no /dev. Counted as a floor
  // rather than pinned: `url-shape.spec.ts` checks the exact set of non-lesson
  // routes, which is the part a regression could silently drop.
  const locs = xml.match(/<loc>/g) ?? [];
  expect(locs.length).toBeGreaterThanOrEqual(20);
  expect(xml).toContain('/learn/kubernetes/</loc>');
  expect(xml).toContain('/learn/system-design/</loc>');
  // D1: the <loc>s carry the trailing slash, because that is the URL the site
  // actually serves. A slashless <loc> would point every crawler at a redirect
  // (a 404 under `astro preview`), which is the defect D1 exists to close —
  // tests/e2e/url-shape.spec.ts asserts it for every entry, not just these two.
  expect(xml).toContain('/glossary/</loc>');
  expect(xml).toContain('/learn/binary-search/</loc>');
  expect(xml).not.toContain('/404');
  expect(xml).not.toContain('/dev');
});

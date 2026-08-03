import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
// M7.2: the anchor-settle helper moved to a shared module so the new glossary
// and wayfinding specs use the SAME definition rather than a third copy of it.
// It cannot live in a spec file: importing one spec from another makes
// Playwright register the imported tests twice.
import { waitForAnchorScroll } from './utils/scroll';

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
 *   - the home track cards being DATA-DRIVEN (design §3.5), never hardcoded;
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
  { path: '/glossary', name: 'glossary' },
  { path: '/about', name: 'about' },
  { path: '/404', name: '404' },
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
    await page.goto('/glossary');

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
    await page.goto('/glossary');
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
      expect(href).toMatch(/^\/learn\/[a-z-]+$/);
      const res = await request.get(href!);
      expect(res.status(), `${href} should be reachable`).toBe(200);
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
      await page.goto('/glossary');

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
    await page.goto('/glossary');
    expect(
      await page.locator('.glossary__term').count(),
    ).toBeGreaterThanOrEqual(40);
    // Jump anchors are native fragment links (no JS needed).
    await expect(
      page.locator('a.glossary__chip[href="#letter-a"]'),
    ).toHaveAttribute('href', '#letter-a');
    // A cross-link is a real <a href> into a lesson.
    const firstXref = page.locator('.glossary__xref').first();
    await expect(firstXref).toHaveAttribute('href', /^\/learn\/[a-z-]+$/);
  });
});

// ---------------------------------------------------------------------------
// 3. Home — track cards are data-driven (design §3.5), never hardcoded.
// ---------------------------------------------------------------------------
test('home track cards + heading reflect the real 15-lesson curriculum', async ({
  page,
}) => {
  await page.goto('/');

  // Data-driven heading: two tracks, 15 published lessons (M6 adds DP → 15).
  await expect(
    page.getByRole('heading', { name: 'Two tracks, 15 lessons' }),
  ).toBeVisible();

  const cardText = await page.locator('.track-card').allInnerTexts();
  const joined = cardText.join(' | ');
  // Foundations 9 (all beginner) + Algorithms 6 (mixed difficulty) — spread as text.
  expect(joined).toMatch(/9 lessons/);
  expect(joined).toMatch(/6 lessons/);
  expect(joined).toMatch(/All beginner/);
  expect(joined).toMatch(/beginner · \d+ intermediate|intermediate/);
  // Both cards link into the /learn track anchors.
  await expect(
    page.locator('a.track-card[href="/learn#track-foundations"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('a.track-card[href="/learn#track-algorithms"]'),
  ).toHaveCount(1);
});

// ---------------------------------------------------------------------------
// 4. About — the trimmed live demo hydrates and is keyboard-reachable.
// ---------------------------------------------------------------------------
test('about live demo hydrates and is operable', async ({ page }) => {
  await page.goto('/about');
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
    await page.goto('/about');
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
  // Four static routes + the 15 published lessons = 19 <loc> entries; no /404, /dev.
  const locs = xml.match(/<loc>/g) ?? [];
  expect(locs.length).toBe(19);
  expect(xml).toContain('/glossary</loc>');
  expect(xml).toContain('/learn/binary-search</loc>');
  expect(xml).not.toContain('/404');
  expect(xml).not.toContain('/dev');
});

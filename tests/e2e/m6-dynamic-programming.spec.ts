import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * M6 (stretch) independent QA — Lesson 15 "Intro to Dynamic Programming"
 * (spec §5 L15, §7 seven sections, §12 a11y, §18 per-lesson DoD; m6-design.md).
 *
 * The M4 sweep (m4-lessons.spec.ts) intentionally scopes to the 14 required v1
 * lessons and does NOT include `dynamic-programming`, so the published DP lesson
 * has NO end-to-end coverage. This spec fills that gap against the same §18 bar
 * every other lesson clears: two `renderer="table"` visualizers hydrate with no
 * console errors, all seven sections in order, three-language code tabs, axe in
 * both themes, a full keyboard walkthrough of a table viz, and — the teaching
 * point — the memoization ✓ cache-hit being distinguishable WITHOUT colour (a ✓
 * glyph in the canvas plus the aria-live / <desc> wording).
 */

const LESSON = '/learn/dynamic-programming';

/** Scroll every visualizer into view and wait for it to hydrate; returns count. */
async function hydrateAllViz(page: Page): Promise<number> {
  const roots = page.locator('[data-viz]');
  const count = await roots.count();
  for (let i = 0; i < count; i += 1) {
    const root = roots.nth(i);
    await root.scrollIntoViewIfNeeded();
    await expect(root).toHaveAttribute('data-viz-ready', 'true', {
      timeout: 15_000,
    });
  }
  return count;
}

test.describe('DP lesson: clean, hydrating page', () => {
  test('two table visualizers hydrate, single h1, no console errors', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    page.on('pageerror', (e) => consoleErrors.push(e.message));

    await page.goto(LESSON);

    await expect(page.locator('h1')).toHaveCount(1);

    // The design ships TWO independently-steppable table islands (tabulation +
    // memoization); both must hydrate. Each canvas holds an SVG still at build.
    const vizCount = await hydrateAllViz(page);
    expect(vizCount).toBe(2);
    await expect(page.locator('[data-viz-canvas] svg')).toHaveCount(2);
    await expect(page.locator('[data-viz-forward]')).toHaveCount(2);

    // Each viz exposes a polite live region + a working transport.
    await expect(page.locator('[data-viz-explain]').first()).toHaveAttribute(
      'aria-live',
      'polite',
    );
    for (const btn of await page.locator('[data-viz-forward]').all()) {
      await expect(btn).toBeEnabled();
    }

    expect(consoleErrors).toEqual([]);
  });
});

test('all seven authored sections are present in order', async ({ page }) => {
  await page.goto(LESSON);
  const REQUIRED_H2 = [
    'Intuition',
    'How it works',
    'Visualizer',
    'Complexity',
    'Code',
    'Common pitfalls',
    'Practice',
  ];
  // Read the actual h2 text in document order and assert the canonical sequence
  // appears as a subsequence (h3 approach labels sit between them).
  const headings = await page
    .getByRole('heading', { level: 2 })
    .allInnerTexts();
  const trimmed = headings.map((h) => h.trim());
  for (const name of REQUIRED_H2) {
    await expect(page.getByRole('heading', { level: 2, name })).toBeVisible();
  }
  // Exact order check: the required headings appear in this relative order.
  const positions = REQUIRED_H2.map((n) => trimmed.indexOf(n));
  expect(positions).toEqual([...positions].sort((a, b) => a - b));
  expect(positions.every((p) => p >= 0)).toBe(true);
});

test('both tabulation and memoization code ship Python/JavaScript/Java, unmangled', async ({
  page,
}) => {
  await page.goto(LESSON);
  // Two CodeTabs groups → at least two tabs per language label.
  for (const lang of ['Python', 'JavaScript', 'Java']) {
    expect(
      await page.getByRole('tab', { name: lang }).count(),
    ).toBeGreaterThanOrEqual(2);
  }
  // The memoization cache guard identifier survives markdown/Shiki intact — the
  // §15 spot-check that the code was not mangled into prose. Multiple memo code
  // blocks (Python/JS/Java) carry the `memo` identifier.
  expect(
    await page.locator('pre.astro-code', { hasText: 'memo' }).count(),
  ).toBeGreaterThanOrEqual(2);
  // The tabulation recurrence identifier survives in its own block.
  await expect(
    page.locator('pre.astro-code', { hasText: 'dp[i - 1]' }).first(),
  ).toBeVisible();
});

test('complexity table renders O(n) time and O(n) space', async ({ page }) => {
  await page.goto(LESSON);
  const table = page.getByRole('heading', { level: 2, name: 'Complexity' });
  await expect(table).toBeVisible();
  // The ComplexityTable is auto-rendered from frontmatter (time+space all O(n)).
  const complexitySection = page.locator('table').first();
  await expect(complexitySection).toContainText('O(n)');
});

// §12 / §18: axe on the DP lesson in both themes. Hard gate zero critical; we
// also enforce zero serious except the one KNOWN, TRACKED Shiki code-comment
// contrast debt (same carve-out as m4-lessons.spec.ts — lives only inside code
// blocks, never in a renderer or page chrome).
const CODE_BLOCK_TARGET = /astro-code|data-language|\.line/;

for (const theme of ['light', 'dark'] as const) {
  test(`axe: DP lesson (${theme} theme) — no critical, no serious outside code-comment debt`, async ({
    page,
  }) => {
    await page.addInitScript((value) => {
      localStorage.setItem('theme', value);
    }, theme);
    await page.goto(LESSON);
    await hydrateAllViz(page);

    const results = await new AxeBuilder({ page }).analyze();

    const critical = results.violations.filter((v) => v.impact === 'critical');
    expect(critical.map((v) => `critical ${v.id}: ${v.help}`)).toEqual([]);

    const seriousOffenders: string[] = [];
    for (const v of results.violations) {
      if (v.impact !== 'serious') continue;
      for (const n of v.nodes) {
        const inCodeBlock = n.target.every((t) =>
          CODE_BLOCK_TARGET.test(String(t)),
        );
        const isTrackedDebt = v.id === 'color-contrast' && inCodeBlock;
        if (!isTrackedDebt) {
          seriousOffenders.push(`serious ${v.id}: ${n.target.join(' ')}`);
        }
      }
    }
    expect(seriousOffenders).toEqual([]);
  });
}

test('a table visualizer is fully keyboard-operable', async ({ page }) => {
  await page.goto(LESSON);
  const viz = page.locator('[data-viz]').first();
  await viz.scrollIntoViewIfNeeded();
  await expect(viz).toHaveAttribute('data-viz-ready', 'true', {
    timeout: 15_000,
  });

  const counter = viz.locator('[data-viz-counter]');
  const start = await counter.textContent();

  const forward = viz.locator('[data-viz-forward]');
  await forward.focus();
  await expect(forward).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(counter).not.toHaveText(start ?? '');

  const back = viz.locator('[data-viz-back]');
  await back.focus();
  await page.keyboard.press('Enter');
  await expect(counter).toHaveText(start ?? '');

  // The scrub slider is operable with Home/End.
  const slider = viz.locator('[data-viz-slider]');
  await slider.focus();
  await page.keyboard.press('End');
  const last = await slider.getAttribute('max');
  await expect(slider).toHaveValue(last ?? '');
  await page.keyboard.press('Home');
  await expect(slider).toHaveValue('0');
});

test('memoization cache-hit is distinguishable WITHOUT colour (✓ glyph + words)', async ({
  page,
}) => {
  await page.goto(LESSON);

  // Second viz is the memoization (top-down) island (design §2.2 order).
  const memoViz = page.locator('[data-viz]').nth(1);
  await memoViz.scrollIntoViewIfNeeded();
  await expect(memoViz).toHaveAttribute('data-viz-ready', 'true', {
    timeout: 15_000,
  });

  const explain = memoViz.locator('[data-viz-explain]');
  const canvas = memoViz.locator('[data-viz-canvas]');
  const forward = memoViz.locator('[data-viz-forward]');

  // Step forward (bounded) until the explanation announces a cache hit. This is
  // the whole teaching point: a value is REUSED, not recomputed.
  let reachedCacheHit = false;
  for (let i = 0; i < 40; i += 1) {
    const text = (await explain.textContent()) ?? '';
    if (/reusing the cached value/i.test(text)) {
      reachedCacheHit = true;
      break;
    }
    await forward.click();
  }
  expect(reachedCacheHit, 'a cache-hit step is reachable by stepping').toBe(
    true,
  );

  // Non-colour cue #1: the ✓ badge glyph is present in the SVG at the cache hit.
  await expect(canvas.locator('text', { hasText: '✓' }).first()).toBeVisible();
  // Non-colour cue #2: the SR/aria-live wording carries the same insight, so the
  // distinction never depends on hue (compare-amber vs visited-violet).
  await expect(explain).toContainText(/reusing the cached value/i);

  // The SVG <desc> mirrors the explanation (design §1.6 / §3): same sentence.
  const descText = await canvas.locator('svg desc').first().textContent();
  expect(descText ?? '').toMatch(/reusing the cached value/i);
});

test.describe('DP lesson with JavaScript disabled', () => {
  test.use({ javaScriptEnabled: false });

  test('prose + both viz stills render; islands never hydrate', async ({
    page,
  }) => {
    await page.goto(LESSON);
    await expect(page.locator('h1')).toHaveCount(1);
    // Both Visualizer roots are SSR'd with a static SVG still (design §1.5).
    const roots = page.locator('[data-viz]');
    await expect(roots).toHaveCount(2);
    await expect(page.locator('[data-viz-canvas] svg')).toHaveCount(2);
    // With JS off, no island hydrates.
    await expect(roots.first()).not.toHaveAttribute('data-viz-ready', 'true');
  });
});

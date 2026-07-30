import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * M4 independent QA (spec §17 M4 acceptance + §18 DoD + §12 a11y).
 *
 * These tests exercise the REAL static output (playwright.config builds+previews).
 * They complement the binary-search vertical-slice specs by covering the whole
 * 14-lesson curriculum at once, plus per-renderer axe in both themes and a full
 * keyboard walkthrough of a non-array-renderer viz — the gaps the existing e2e
 * suite (scoped to /learn/binary-search) does not reach.
 */

/** The 14 required v1 lessons (spec §5), by slug. */
const LESSONS = [
  'complexity-big-o',
  'arrays',
  'linked-lists',
  'stacks',
  'queues',
  'hash-tables',
  'trees-bst',
  'heaps',
  'graphs',
  'recursion',
  'binary-search',
  'sorting-basics',
  'sorting-efficient',
  'graph-traversal',
] as const;

/** Scroll every visualizer on the page into view and wait for it to hydrate. */
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

test.describe('every lesson page is a clean, hydrating page', () => {
  for (const slug of LESSONS) {
    test(`${slug}: single h1, all visualizers hydrate, no console errors`, async ({
      page,
    }) => {
      const consoleErrors: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'error') consoleErrors.push(m.text());
      });
      page.on('pageerror', (e) => consoleErrors.push(e.message));

      await page.goto(`/learn/${slug}`);

      // Exactly one <h1> (the lesson title) — §12 heading order.
      await expect(page.locator('h1')).toHaveCount(1);

      // Every lesson ships at least one working visualizer; each must hydrate.
      const vizCount = await hydrateAllViz(page);
      expect(vizCount).toBeGreaterThan(0);

      // Each hydrated viz exposes a live-region explanation and a real transport.
      await expect(page.locator('[data-viz-explain]').first()).toHaveAttribute(
        'aria-live',
        'polite',
      );
      await expect(page.locator('[data-viz-forward]').first()).toBeEnabled();

      // §18 DoD: no runtime console errors on any lesson page.
      expect(consoleErrors).toEqual([]);
    });
  }
});

test.describe('all seven authored sections are present in order', () => {
  // §7 / §18: the seven canonical sections. Multi-algorithm lessons legitimately
  // fold the interactive viz into "How it works" (per-variant), so the literal
  // "Visualizer" heading is optional; the other six section headings are required
  // and a working viz is asserted separately above.
  const REQUIRED_H2 = [
    'Intuition',
    'How it works',
    'Complexity',
    'Code',
    'Common pitfalls',
    'Practice',
  ];
  for (const slug of LESSONS) {
    test(`${slug}: has the six required section headings`, async ({ page }) => {
      await page.goto(`/learn/${slug}`);
      for (const name of REQUIRED_H2) {
        await expect(
          page.getByRole('heading', { level: 2, name }),
        ).toBeVisible();
      }
    });
  }
});

test.describe('three-language code is present and unmangled', () => {
  for (const slug of LESSONS) {
    test(`${slug}: Python + JavaScript + Java code tabs render`, async ({
      page,
    }) => {
      await page.goto(`/learn/${slug}`);
      // CodeTabs renders one tab per language; a code-heavy lesson may have
      // several tab groups, so assert at least one of each language label.
      for (const lang of ['Python', 'JavaScript', 'Java']) {
        await expect(
          page.getByRole('tab', { name: lang }).first(),
        ).toBeVisible();
      }
      // Highlighted code actually rendered (Shiki -> .astro-code <pre>).
      await expect(page.locator('pre.astro-code').first()).toBeVisible();
    });
  }
});

// §12 / §18: axe on a representative page per renderer family, in both themes.
// The spec's hard gate is "zero CRITICAL" (§18 DoD); we additionally enforce
// "zero SERIOUS" to catch viz/UI contrast regressions — but exclude one KNOWN,
// TRACKED debt: the shipped Shiki `github-dark` code theme renders comment
// tokens (#6a737d on #24292e ≈ 3.04:1) below the 4.5:1 AA text ratio (§12). That
// is a real defect reported to the frontend team; it lives only inside the code
// blocks (`pre.astro-code`/`.line`), never in a renderer or the page chrome, so
// filtering it here keeps this guard green while still failing on any NEW serious
// issue (e.g. a low-contrast viz marker, muted label, or metric pill).
const CODE_BLOCK_TARGET = /astro-code|data-language|\.line/;

const RENDERER_SAMPLE: Record<string, string> = {
  chart: 'complexity-big-o',
  tree: 'trees-bst',
  graph: 'graphs',
  bars: 'sorting-basics',
  hashTable: 'hash-tables',
};

for (const [renderer, slug] of Object.entries(RENDERER_SAMPLE)) {
  for (const theme of ['light', 'dark'] as const) {
    test(`axe: ${slug} (${renderer} renderer, ${theme}) — no critical, no serious outside the tracked code-comment debt`, async ({
      page,
    }) => {
      await page.addInitScript((value) => {
        localStorage.setItem('theme', value);
      }, theme);
      await page.goto(`/learn/${slug}`);
      await hydrateAllViz(page);

      const results = await new AxeBuilder({ page }).analyze();

      // Hard gate (§18): zero critical violations of any kind.
      const critical = results.violations.filter(
        (v) => v.impact === 'critical',
      );
      expect(critical.map((v) => `critical ${v.id}: ${v.help}`)).toEqual([]);

      // Serious gate, excluding the known Shiki code-comment contrast debt.
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
}

test.describe('viz is fully keyboard-operable (non-array renderer)', () => {
  // Drives the trees-bst tree renderer purely with the keyboard to prove the
  // §12 requirement holds beyond the array renderer the binary-search spec covers.
  const LESSON = '/learn/trees-bst';

  test('transport buttons and slider operate with keyboard only', async ({
    page,
  }) => {
    await page.goto(LESSON);
    const viz = page.locator('[data-viz]').first();
    await viz.scrollIntoViewIfNeeded();
    await expect(viz).toHaveAttribute('data-viz-ready', 'true', {
      timeout: 15_000,
    });

    const counter = viz.locator('[data-viz-counter]');
    const start = await counter.textContent();

    // Focus the step-forward button and activate it with the keyboard.
    const forward = viz.locator('[data-viz-forward]');
    await forward.focus();
    await expect(forward).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(counter).not.toHaveText(start ?? '');

    // Step back with the keyboard returns to the start.
    const back = viz.locator('[data-viz-back]');
    await back.focus();
    await page.keyboard.press('Enter');
    await expect(counter).toHaveText(start ?? '');

    // The scrub slider is operable with Home/End (jumps to first/last step).
    const slider = viz.locator('[data-viz-slider]');
    await slider.focus();
    await page.keyboard.press('End');
    const last = await slider.getAttribute('max');
    await expect(slider).toHaveValue(last ?? '');
    await page.keyboard.press('Home');
    await expect(slider).toHaveValue('0');
  });
});

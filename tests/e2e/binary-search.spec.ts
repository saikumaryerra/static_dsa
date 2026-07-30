import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const LESSON = '/learn/binary-search';

// M4 lesson-11 expansion: the page now hosts TWO array visualizers (binary
// search + a linear-search contrast). Every viz assertion below is scoped to the
// binary-search visualizer via this wrapper id (added in the .mdx) so the second
// viz's duplicate controls/cells can't satisfy or break a binary-search
// assertion. The original assertions are otherwise unchanged.
const VIZ = '#viz-binary-search';

/** Scrolls the binary-search visualizer into view and waits for it to hydrate. */
async function hydrateViz(page: import('@playwright/test').Page) {
  const viz = page.locator(`${VIZ} [data-viz]`);
  await viz.scrollIntoViewIfNeeded();
  await expect(viz).toHaveAttribute('data-viz-ready', 'true', {
    timeout: 15_000,
  });
  return viz;
}

test.describe('Binary Search lesson', () => {
  test('renders all seven lesson sections', async ({ page }) => {
    await page.goto(LESSON);
    for (const heading of [
      'Intuition',
      'How it works',
      'Visualizer',
      'Complexity',
      'Code',
      'Common pitfalls',
      'Practice',
    ]) {
      await expect(
        page.getByRole('heading', { level: 2, name: heading }),
      ).toBeVisible();
    }
    // Exactly one h1 (the lesson title).
    await expect(page.locator('h1')).toHaveCount(1);
  });

  test('transport controls move the state and update the live region', async ({
    page,
  }) => {
    await page.goto(LESSON);
    await hydrateViz(page);

    const explain = page.locator(`${VIZ} [data-viz-explain]`);
    await expect(explain).toHaveAttribute('aria-live', 'polite');
    const counter = page.locator(`${VIZ} [data-viz-counter]`);

    // Step 0 baseline.
    await expect(counter).toHaveText('1 / 4');
    const firstText = await explain.textContent();

    // Step forward advances the counter and the explanation.
    await page.locator(`${VIZ} [data-viz-forward]`).click();
    await expect(counter).toHaveText('2 / 4');
    await expect(explain).not.toHaveText(firstText ?? '');

    // Step back returns.
    await page.locator(`${VIZ} [data-viz-back]`).click();
    await expect(counter).toHaveText('1 / 4');

    // Scrub to the end via the slider.
    const slider = page.locator(`${VIZ} [data-viz-slider]`);
    await slider.fill('3');
    await expect(counter).toHaveText('4 / 4');

    // Reset returns to the start and disables back/reset.
    await page.locator(`${VIZ} [data-viz-reset]`).click();
    await expect(counter).toHaveText('1 / 4');
    await expect(page.locator(`${VIZ} [data-viz-back]`)).toBeDisabled();

    // Speed control is operable.
    await page.locator(`${VIZ} [data-viz-speed]`).selectOption('2');
    await expect(page.locator(`${VIZ} [data-viz-speed]`)).toHaveValue('2');
  });

  test('play advances then auto-pauses at the end', async ({ page }) => {
    await page.goto(LESSON);
    await hydrateViz(page);
    await page.locator(`${VIZ} [data-viz-speed]`).selectOption('3');
    await page.locator(`${VIZ} [data-viz-play]`).click();
    // At the end, play is disabled (auto-paused) and the counter is at the last step.
    await expect(page.locator(`${VIZ} [data-viz-play]`)).toBeDisabled({
      timeout: 10_000,
    });
    await expect(page.locator(`${VIZ} [data-viz-counter]`)).toHaveText('4 / 4');
  });

  test('valid custom input recomputes and ends in a found cell', async ({
    page,
  }) => {
    await page.goto(LESSON);
    await hydrateViz(page);

    await page.locator(`${VIZ} [data-viz-array]`).fill('[1,3,5,7]');
    await page.locator(`${VIZ} [data-viz-target]`).fill('5');
    await page.locator(`${VIZ} [data-viz-run]`).click();

    // Walk to the end of the new trace.
    const forward = page.locator(`${VIZ} [data-viz-forward]`);
    for (let i = 0; i < 10 && (await forward.isEnabled()); i += 1) {
      await forward.click();
    }

    await expect(page.locator(`${VIZ} [data-viz-explain]`)).toContainText(
      'Found 5 at index 2',
    );
    await expect(page.locator(`${VIZ} #i2`)).toHaveClass(/is-found/);
  });

  test('invalid custom input shows an inline error and keeps the previous viz', async ({
    page,
  }) => {
    await page.goto(LESSON);
    await hydrateViz(page);

    await page.locator(`${VIZ} [data-viz-array]`).fill('[3,1,2]');
    await page.locator(`${VIZ} [data-viz-target]`).fill('2');
    await page.locator(`${VIZ} [data-viz-run]`).click();

    const error = page.locator(`${VIZ} [data-viz-error]`);
    await expect(error).toBeVisible();
    await expect(error).toContainText('sorted');
    // The previous trace's cells are still rendered (viz not blanked).
    await expect(page.locator(`${VIZ} #i0`)).toBeVisible();
    await expect(page.locator(`${VIZ} [data-viz-array]`)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });
});

test.describe('JS disabled', () => {
  test.use({ javaScriptEnabled: false });

  test('prose and code are readable; viz shows a static still with the enable-JS note; controls hidden', async ({
    page,
  }) => {
    await page.goto(LESSON);

    // Prose readable.
    await expect(
      page.getByRole('heading', { level: 2, name: 'Intuition' }),
    ).toBeVisible();

    // Code readable — the noscript fallback reveals every language panel.
    await expect(page.locator('pre').first()).toBeVisible();
    await expect(page.locator('body')).toContainText('binary_search'); // Python
    await expect(page.locator('body')).toContainText('binarySearch'); // JS/Java

    // Viz: static SVG present with real cells.
    await expect(page.locator(`${VIZ} [data-viz-canvas] > svg`)).toBeVisible();
    await expect(page.locator(`${VIZ} [data-viz] #i0`)).toBeVisible();

    // Enable-JS note visible; interactive controls hidden.
    await expect(page.locator(`${VIZ} .viz-nojs-note`)).toBeVisible();
    await expect(page.locator(`${VIZ} .viz-controls`)).toBeHidden();
  });
});

for (const theme of ['light', 'dark'] as const) {
  test(`lesson page (${theme}) has no critical axe violations`, async ({
    page,
  }) => {
    await page.addInitScript((value) => {
      localStorage.setItem('theme', value);
    }, theme);
    await page.goto(LESSON);
    await hydrateViz(page);

    const results = await new AxeBuilder({ page }).analyze();
    const critical = results.violations.filter((v) => v.impact === 'critical');
    expect(critical.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
}

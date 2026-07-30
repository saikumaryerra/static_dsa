/**
 * QA-added M2 gap coverage for the Binary Search visualizer.
 *
 * These tests target behaviours the delivered suite (`binary-search.spec.ts`)
 * does not assert end-to-end, all mandated by the spec / M2 design:
 *  - absent target renders an empty-range "not found" state with NO found cue;
 *  - the scrub slider jumps to an arbitrary step and the aria-live explanation,
 *    aria-valuetext, and rendered SVG state all agree;
 *  - stepping back after a full play run shows the historically-correct state
 *    (deep-copy integrity proven through the real renderer, not just the unit);
 *  - reduced-motion still emits every step and snaps (near-zero transitions);
 *  - every --hl-* highlight is paired with a NON-COLOR cue (lo/hi/mid labels,
 *    dimmed eliminated cells, ✓ on found) per design §3.4 / spec §10/§12;
 *  - keyboard-only operation of every control including the range slider;
 *  - the metrics readout updates as the trace advances.
 *
 * Author: qa-engineer. Scope: tests/ only.
 *
 * M4 lesson-11 expansion: the page now hosts TWO array visualizers (binary
 * search + a linear-search contrast). Every viz locator below is scoped to the
 * binary-search visualizer via the `#viz-binary-search` wrapper (added in the
 * .mdx) so the second viz's duplicate controls/cells can't satisfy or break a
 * binary-search assertion. The assertions themselves are unchanged.
 */
import { expect, test, type Page } from '@playwright/test';

const LESSON = '/learn/binary-search';
const VIZ = '#viz-binary-search';

/** Scrolls the binary-search visualizer into view and waits for it to hydrate. */
async function hydrateViz(page: Page) {
  const viz = page.locator(`${VIZ} [data-viz]`);
  await viz.scrollIntoViewIfNeeded();
  await expect(viz).toHaveAttribute('data-viz-ready', 'true', {
    timeout: 15_000,
  });
  return viz;
}

/** Loads a custom array + target through the real custom-input form. */
async function runCustom(page: Page, array: string, target: string) {
  await page.locator(`${VIZ} [data-viz-array]`).fill(array);
  await page.locator(`${VIZ} [data-viz-target]`).fill(target);
  await page.locator(`${VIZ} [data-viz-run]`).click();
}

/** Clicks Step forward until it is disabled (reached the end of the trace). */
async function walkToEnd(page: Page) {
  const forward = page.locator(`${VIZ} [data-viz-forward]`);
  for (let i = 0; i < 40 && (await forward.isEnabled()); i += 1) {
    await forward.click();
  }
}

test.describe('Binary Search — absent target (empty-range "not found")', () => {
  test('ends with a "not in the array" explanation and NO found cue anywhere', async ({
    page,
  }) => {
    await page.goto(LESSON);
    await hydrateViz(page);

    // [1,3,5,7,9] target 4 — a value that is not present (spec §11.4 case).
    await runCustom(page, '[1,3,5,7,9]', '4');
    await walkToEnd(page);

    const explain = page.locator(`${VIZ} [data-viz-explain]`);
    await expect(explain).toContainText('not in the array');

    // No cell may carry the found state, and no ✓ marker may exist.
    await expect(page.locator(`${VIZ} .is-found`)).toHaveCount(0);
    await expect(page.locator(`${VIZ} .viz-found-mark`)).toHaveCount(0);

    // The terminal window is empty, so every cell reads as eliminated (dimmed).
    await expect(page.locator(`${VIZ} .viz-cell`)).toHaveCount(5);
    await expect(page.locator(`${VIZ} .viz-cell.is-eliminated`)).toHaveCount(5);
  });
});

test.describe('Binary Search — scrub to an arbitrary step', () => {
  test('slider jump syncs explanation, aria-valuetext, counter, and SVG state', async ({
    page,
  }) => {
    await page.goto(LESSON);
    await hydrateViz(page);

    // Default trace [1,3,5,7,9,11] target 7 has 4 steps; index 1 checks mid=2 (5).
    const slider = page.locator(`${VIZ} [data-viz-slider]`);
    await slider.fill('1');

    await expect(page.locator(`${VIZ} [data-viz-counter]`)).toHaveText('2 / 4');
    await expect(slider).toHaveAttribute('aria-valuetext', 'Step 2 of 4');
    await expect(page.locator(`${VIZ} [data-viz-explain]`)).toContainText(
      'index 2 holds 5',
    );

    // Rendered state must match the step: i2 is the active mid, with a mid caret.
    await expect(page.locator(`${VIZ} #i2`)).toHaveClass(/is-active/);
    await expect(page.locator(`${VIZ} .viz-mid-label`)).toHaveText('mid');
  });
});

test.describe('Binary Search — step-back after play (deep-copy integrity)', () => {
  test('stepping back from the found end restores the earlier window exactly', async ({
    page,
  }) => {
    await page.goto(LESSON);
    await hydrateViz(page);

    // Play to the end (found at index 3), then auto-pause.
    await page.locator(`${VIZ} [data-viz-speed]`).selectOption('3');
    await page.locator(`${VIZ} [data-viz-play]`).click();
    await expect(page.locator(`${VIZ} [data-viz-counter]`)).toHaveText(
      '4 / 4',
      {
        timeout: 10_000,
      },
    );
    await expect(page.locator(`${VIZ} #i3`)).toHaveClass(/is-found/);

    // Step back once → step index 2 ("check index 4, value 9"). If snapshots
    // were aliased, the earlier window would be corrupted by the found step.
    await page.locator(`${VIZ} [data-viz-back]`).click();
    await expect(page.locator(`${VIZ} [data-viz-counter]`)).toHaveText('3 / 4');
    await expect(page.locator(`${VIZ} [data-viz-explain]`)).toContainText(
      'index 4 holds 9',
    );
    // The found highlight must be gone and the historical mid restored on i4.
    await expect(page.locator(`${VIZ} .is-found`)).toHaveCount(0);
    await expect(page.locator(`${VIZ} #i4`)).toHaveClass(/is-active/);
  });
});

test.describe('Binary Search — reduced motion', () => {
  test('emits every step, auto-pauses at the end, and snaps (near-zero transition)', async ({
    page,
  }) => {
    // Emulate the OS reduced-motion preference before load so the media query
    // is active at first paint (mirrors the M1 reduced-motion test).
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(LESSON);
    await hydrateViz(page);

    // Sanity: the preference is actually in effect for this context.
    const reduced = await page.evaluate(
      () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    );
    expect(reduced).toBe(true);

    // Cell transitions must be collapsed to near-zero (snap, not tween).
    const durationsMs = await page
      .locator(`${VIZ} #i2 .viz-cell__rect`)
      .evaluate((el) =>
        getComputedStyle(el)
          .transitionDuration.split(',')
          .map((d) => {
            const v = d.trim();
            return v.endsWith('ms') ? parseFloat(v) : parseFloat(v) * 1000;
          }),
      );
    for (const ms of durationsMs) expect(ms).toBeLessThan(50);

    // Playback still walks the whole trace and auto-pauses at the last step.
    await page.locator(`${VIZ} [data-viz-speed]`).selectOption('3');
    await page.locator(`${VIZ} [data-viz-play]`).click();
    await expect(page.locator(`${VIZ} [data-viz-counter]`)).toHaveText(
      '4 / 4',
      {
        timeout: 10_000,
      },
    );
    await expect(page.locator(`${VIZ} #i3`)).toHaveClass(/is-found/);
  });
});

test.describe('Binary Search — non-color cues (design §3.4)', () => {
  test('range/active/found each pair color with a label, dim, or ✓ glyph', async ({
    page,
  }) => {
    await page.goto(LESSON);
    await hydrateViz(page);

    // Step to index 2: window is 3..5, mid=4, cells 0..2 eliminated.
    await page.locator(`${VIZ} [data-viz-slider]`).fill('2');

    // lo / hi text markers present for the range window (not color-only).
    const markerTexts = await page
      .locator(`${VIZ} .viz-marker`)
      .allTextContents();
    expect(markerTexts).toContain('lo');
    expect(markerTexts).toContain('hi');
    // mid caret labels the active probe cell.
    await expect(page.locator(`${VIZ} .viz-mid-label`)).toHaveText('mid');

    // Eliminated cells are dimmed via opacity (a non-hue cue), not color alone.
    await expect(page.locator(`${VIZ} #i0`)).toHaveClass(/is-eliminated/);
    const opacity = await page
      .locator(`${VIZ} #i0`)
      .evaluate((el) => getComputedStyle(el).opacity);
    expect(parseFloat(opacity)).toBeLessThan(0.6);

    // Advance to the found end → ✓ glyph accompanies the found color.
    await page.locator(`${VIZ} [data-viz-slider]`).fill('3');
    await expect(page.locator(`${VIZ} .viz-found-mark`)).toHaveText('✓');
    await expect(page.locator(`${VIZ} #i3`)).toHaveClass(/is-found/);
  });
});

test.describe('Binary Search — keyboard-only operation', () => {
  test('the range slider is fully operable with Home/End/Arrow keys', async ({
    page,
  }) => {
    await page.goto(LESSON);
    await hydrateViz(page);

    const slider = page.locator(`${VIZ} [data-viz-slider]`);
    const counter = page.locator(`${VIZ} [data-viz-counter]`);

    await slider.focus();
    await page.keyboard.press('End');
    await expect(counter).toHaveText('4 / 4');
    await expect(slider).toHaveAttribute('aria-valuetext', 'Step 4 of 4');

    await page.keyboard.press('Home');
    await expect(counter).toHaveText('1 / 4');

    await page.keyboard.press('ArrowRight');
    await expect(counter).toHaveText('2 / 4');
    await expect(slider).toHaveAttribute('aria-valuetext', 'Step 2 of 4');
  });

  test('transport buttons activate with the keyboard (focus + Enter)', async ({
    page,
  }) => {
    await page.goto(LESSON);
    await hydrateViz(page);

    const forward = page.locator(`${VIZ} [data-viz-forward]`);
    await forward.focus();
    await expect(forward).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator(`${VIZ} [data-viz-counter]`)).toHaveText('2 / 4');

    // Reset is reachable and operable by keyboard too.
    const reset = page.locator(`${VIZ} [data-viz-reset]`);
    await reset.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator(`${VIZ} [data-viz-counter]`)).toHaveText('1 / 4');
    await expect(page.locator(`${VIZ} [data-viz-back]`)).toBeDisabled();
  });
});

test.describe('Binary Search — metrics readout', () => {
  test('the comparisons metric increases as the trace advances', async ({
    page,
  }) => {
    await page.goto(LESSON);
    await hydrateViz(page);

    const metrics = page.locator(`${VIZ} [data-viz-metrics]`);
    await expect(metrics).toContainText('Comparisons');
    await expect(metrics.locator('b')).toHaveText('0');

    await page.locator(`${VIZ} [data-viz-forward]`).click();
    await expect(metrics.locator('b')).toHaveText('1');

    await page.locator(`${VIZ} [data-viz-forward]`).click();
    await expect(metrics.locator('b')).toHaveText('2');

    // Stepping back rewinds the cumulative metric too (historically correct).
    await page.locator(`${VIZ} [data-viz-back]`).click();
    await expect(metrics.locator('b')).toHaveText('1');
  });
});

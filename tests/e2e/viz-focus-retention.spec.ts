/**
 * Focus retention across the trace bounds (audit A11Y-1).
 *
 * Ships in M7.1 as `test.fixme` because it CANNOT pass against the current
 * player: `updateButtons()` sets `disabled` on the transport button at each
 * bound, and disabling the element that currently has focus makes the browser
 * drop focus to `<body>`. Two things break at once for a keyboard user — they
 * lose their place in the page, and the island's Space/←/→ shortcuts stop
 * working, because that keydown listener is bound to the viz root and only sees
 * events from inside it.
 *
 * M7.2's A11Y-1 fix (runtime `aria-disabled` + a styled state instead of the
 * `disabled` property; the Player already clamps every method, so a click at a
 * bound is a harmless no-op) is what makes this pass. Flip `test.fixme` to
 * `test` in that PR — do not weaken the assertions to land it earlier.
 */
import { expect, test, type Page } from '@playwright/test';

const LESSON = '/learn/binary-search';
// Same wrapper the other binary-search specs scope to: the page hosts two array
// visualizers, so an unscoped locator could resolve to the wrong transport.
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

test.fixme('stepping to the end of the trace with the keyboard keeps focus inside the visualizer', async ({
  page,
}) => {
  await page.goto(LESSON);
  await hydrateViz(page);

  const counter = page.locator(`${VIZ} [data-viz-counter]`);
  const forward = page.locator(`${VIZ} [data-viz-forward]`);
  await expect(counter).toHaveText('1 / 4');

  // Walk to the last step using ONLY the keyboard, exactly as a keyboard user
  // would: focus Step forward once, then activate it in place.
  await forward.focus();
  await expect(forward).toBeFocused();
  for (const step of ['2 / 4', '3 / 4', '4 / 4']) {
    await page.keyboard.press('Enter');
    await expect(counter).toHaveText(step);
  }

  // The regression: at the last step the button disables itself, focus falls
  // to <body>, and the user is dumped to the top of the tab order.
  const focus = await page.evaluate((selector) => {
    const root = document.querySelector(selector);
    const active = document.activeElement;
    return {
      tag: active?.tagName ?? null,
      insideViz: !!root && !!active && root.contains(active),
    };
  }, `${VIZ} [data-viz]`);
  expect(focus.tag).not.toBe('BODY');
  expect(focus.insideViz).toBe(true);

  // …and because focus left the viz root, its ←/→ shortcuts stop firing. This
  // second assertion is the one that proves the fix is real rather than
  // cosmetic: the shortcut only works while focus is still inside the island.
  await page.keyboard.press('ArrowLeft');
  await expect(counter).toHaveText('3 / 4');
});

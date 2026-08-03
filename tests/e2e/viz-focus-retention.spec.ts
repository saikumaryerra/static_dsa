/**
 * Focus retention across the trace bounds (audit A11Y-1).
 *
 * Shipped in M7.1 as `test.fixme` because it could not pass against that
 * player: `updateButtons()` set `disabled` on the transport button at each
 * bound, and disabling the element that currently has focus makes the browser
 * drop focus to `<body>`. Two things broke at once for a keyboard user — they
 * lost their place in the page, and the island's Space/←/→ shortcuts stopped
 * working, because that keydown listener is bound to the viz root and only sees
 * events from inside it.
 *
 * M7.2's A11Y-1 fix — runtime `aria-disabled` plus a styled state instead of the
 * `disabled` property, with the Player already clamping every method so an
 * activation at a bound is a harmless no-op — is what makes it pass, so the
 * `fixme` is flipped here. The assertions were STRENGTHENED rather than
 * loosened when it went live:
 *
 *  - the mechanism is asserted directly (`aria-disabled="true"` while the DOM
 *    `disabled` property stays false), because a "fix" that simply stopped
 *    marking the bound at all would otherwise pass the focus assertions while
 *    losing the state signal assistive tech reads;
 *  - both bounds are covered, not just the end — `reset`/`back` at step 1 have
 *    exactly the same failure mode;
 *  - activation AT a bound is asserted to be a no-op, which is what earns the
 *    right to leave the control enabled in the first place.
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

/** Where focus is right now, relative to the visualizer island. */
async function focusReport(page: Page) {
  return page.evaluate((selector) => {
    const root = document.querySelector(selector);
    const active = document.activeElement;
    return {
      tag: active?.tagName ?? null,
      insideViz: !!root && !!active && root.contains(active),
      // Which control, so a test failure names the element instead of just
      // reporting "not BODY".
      hook:
        active instanceof HTMLElement
          ? (Object.keys(active.dataset).find((k) => k.startsWith('viz')) ??
            null)
          : null,
    };
  }, `${VIZ} [data-viz]`);
}

test('stepping to the end of the trace with the keyboard keeps focus inside the visualizer', async ({
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

  // The regression: at the last step the button used to disable itself, focus
  // fell to <body>, and the user was dumped to the top of the tab order.
  const focus = await focusReport(page);
  expect(focus.tag).not.toBe('BODY');
  expect(focus.insideViz).toBe(true);
  expect(focus.hook).toBe('vizForward');
  await expect(forward).toBeFocused();

  // The mechanism, asserted directly: the bound is announced through
  // `aria-disabled`, and the element is NOT natively disabled — that pairing is
  // the entire fix, and each half is invisible to the other assertions.
  await expect(forward).toHaveAttribute('aria-disabled', 'true');
  expect(await forward.evaluate((el: HTMLButtonElement) => el.disabled)).toBe(
    false,
  );

  // Activating a bound control does nothing (Player clamps, and the handler
  // declines) — the reason it is safe to leave it focusable and enabled.
  await page.keyboard.press('Enter');
  await expect(counter).toHaveText('4 / 4');
  await expect(forward).toBeFocused();

  // …and because focus never left the viz root, its ←/→ shortcuts still fire.
  // This is the assertion that proves the fix is real rather than cosmetic:
  // the shortcut only works while focus is inside the island.
  await page.keyboard.press('ArrowLeft');
  await expect(counter).toHaveText('3 / 4');
  await expect(forward).toHaveAttribute('aria-disabled', 'false');

  // Space is the island's other shortcut and is bound to the same listener;
  // from a focused BUTTON it must fall through to that button's own activation
  // rather than starting playback, so stepping forward is what happens here.
  await page.keyboard.press('Space');
  await expect(counter).toHaveText('4 / 4');
});

test('the start of the trace holds focus the same way the end does', async ({
  page,
}) => {
  await page.goto(LESSON);
  await hydrateViz(page);

  const counter = page.locator(`${VIZ} [data-viz-counter]`);
  const back = page.locator(`${VIZ} [data-viz-back]`);
  const reset = page.locator(`${VIZ} [data-viz-reset]`);

  // Step 1 is where the page LOADS, so both controls start at their bound: a
  // reader who tabs onto "Step back" first meets this state before any other.
  await expect(counter).toHaveText('1 / 4');
  for (const control of [back, reset]) {
    await control.focus();
    await expect(control).toBeFocused();
    await expect(control).toHaveAttribute('aria-disabled', 'true');
    expect(await control.evaluate((el: HTMLButtonElement) => el.disabled)).toBe(
      false,
    );
    await page.keyboard.press('Enter');
    await expect(counter).toHaveText('1 / 4');
    await expect(control).toBeFocused();
  }

  // Arriving at the bound from the other direction is the harder case: focus is
  // on Step back, the step it performs is the one that binds it, and the old
  // player dropped focus at exactly that moment.
  await page.locator(`${VIZ} [data-viz-forward]`).click();
  await expect(counter).toHaveText('2 / 4');
  await back.focus();
  await page.keyboard.press('Enter');
  await expect(counter).toHaveText('1 / 4');
  await expect(back).toBeFocused();
  await expect(back).toHaveAttribute('aria-disabled', 'true');

  const focus = await focusReport(page);
  expect(focus.tag).not.toBe('BODY');
  expect(focus.insideViz).toBe(true);

  // The shortcut still reaches the island from here too.
  await page.keyboard.press('ArrowRight');
  await expect(counter).toHaveText('2 / 4');
});

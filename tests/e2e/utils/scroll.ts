/**
 * Scroll helpers shared by the e2e specs.
 *
 * Lives OUTSIDE the `*.spec.ts` pattern on purpose: importing one spec file from
 * another makes Playwright register the imported file's tests inside the
 * importing file as well, so shared code has to sit in a plain module. Both
 * helpers exist because of M7.1's MOT-1 (`scroll-behavior: smooth` under
 * `prefers-reduced-motion: no-preference`), which turned every anchor jump —
 * and every programmatic scroll — into an animation that assertions can race.
 */
import { expect, type Page } from '@playwright/test';

/** Options for {@link waitForAnchorScroll}. */
export interface AnchorScrollOptions {
  /**
   * How long to keep waiting for the scroll to stop, in ms. The default is
   * deliberately generous: this helper waits for a condition that WILL arrive,
   * so a tighter budget buys nothing except a failure on a loaded CI machine
   * (the suite runs `fullyParallel`, and a rounded `scrollY` sample costs one
   * round-trip each).
   */
  timeout?: number;
  /**
   * How many consecutive identical samples count as "at rest". Two is not
   * enough — see the note on plateaus below.
   */
  samples?: number;
}

/**
 * Waits until an animated scroll has come to rest.
 *
 * Two things make a naive check lie, and both are guarded here:
 *
 * 1. Comparing two consecutive animation FRAMES is not enough: the frames right
 *    after a click can still read the pre-scroll offset, which is
 *    indistinguishable from "already settled". Samples are therefore >=100ms
 *    apart.
 * 2. One matching pair is not enough either. A long eased scroll can move less
 *    than half a device pixel between two samples — `Math.round` then reports
 *    the same offset twice mid-flight, and the caller measures a layout that is
 *    still moving. Requiring N CONSECUTIVE identical samples turns that plateau
 *    into ~(N-1) x 100ms of provable stillness, which no in-flight smooth scroll
 *    sustains.
 *
 * @param page - The page whose window scroll is settling.
 * @param options - Optional budget/strictness overrides ({@link AnchorScrollOptions}).
 */
export async function waitForAnchorScroll(
  page: Page,
  options: AnchorScrollOptions = {},
): Promise<void> {
  const { timeout = 15_000, samples = 3 } = options;
  let previous = Number.NaN;
  let stable = 0;
  await expect
    .poll(
      async () => {
        const current = await page.evaluate(() => Math.round(window.scrollY));
        stable = current === previous ? stable + 1 : 0;
        previous = current;
        return stable;
      },
      // The last interval repeats for the rest of the budget, so the cadence
      // stays at 250ms rather than stretching out — the run must not get slower
      // the longer it waits, or the extra budget above turns into extra runtime
      // on every call.
      { intervals: [100, 100, 150, 250], timeout },
    )
    .toBeGreaterThanOrEqual(samples - 1);
}

/**
 * Jumps to an absolute document offset with NO animation.
 *
 * `window.scrollTo(0, y)` inherits `scroll-behavior: smooth` and would animate,
 * so a test that scrolls somewhere to measure something would be measuring the
 * flight. `behavior: 'instant'` opts that one call out; what the callers assert
 * is the state at a resting offset.
 *
 * @param page - The page to scroll.
 * @param y - Document-space offset in CSS pixels.
 */
export async function scrollToInstant(page: Page, y: number): Promise<void> {
  await page.evaluate((top) => {
    window.scrollTo({ top, behavior: 'instant' });
  }, y);
}

/**
 * Jumps to the very bottom of the document with no animation.
 *
 * @param page - The page to scroll.
 */
export async function scrollToBottom(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' });
  });
}

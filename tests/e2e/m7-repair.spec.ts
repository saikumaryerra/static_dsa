/**
 * M7.1 behaviour guards — the DOM/storage half of the repair batch.
 *
 * Every assertion here covers a behaviour M7.1 CHANGED and that had no e2e
 * coverage before (a grep for "Completed", the mark-complete label, "Show
 * answer" and `aria-pressed` across tests/e2e returned nothing), so without this
 * file the reconciliation pass would have silently left the changes unguarded.
 * The Vitest harness cannot reach any of it: `environment: 'node'`, no DOM, no
 * localStorage.
 *
 *  - VIZ-9 / A11Y-7: Play/Pause carries NO `aria-pressed` — its accessible name
 *    is the whole state signal.
 *  - CMP-12: MarkComplete keeps `aria-pressed` with a CONSTANT visible label
 *    ("Mark as complete"); renaming it to "Completed" double-encoded the state,
 *    and an sr-only rename would fail WCAG 2.5.3 Label in Name. Freezing the
 *    label makes the icon swap the only NON-COLOR visible state signal, so the
 *    check/circle glyphs are asserted here too — without that, deleting the two
 *    `display` rules would leave a colour-only control (WCAG 1.4.1) and every
 *    remaining assertion would still pass.
 *  - CNT-8: Practice disclosure summaries are unique per page, so "Show answer"
 *    is never ambiguous in a screen reader's element list.
 */
import { expect, test, type Page } from '@playwright/test';

const LESSON = '/learn/binary-search';
const SLUG = 'binary-search';
// The lesson hosts two array visualizers; scope to the binary-search one, as
// the other binary-search specs do.
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

test.describe('ARIA toggle hygiene', () => {
  test('the play button never carries aria-pressed, in any state', async ({
    page,
  }) => {
    await page.goto(LESSON);
    await hydrateViz(page);

    const play = page.locator(`${VIZ} [data-viz-play]`);

    // Idle: name only, no pressed state.
    await expect(play).toHaveAccessibleName('Play');
    await expect(play).not.toHaveAttribute('aria-pressed');

    // Playing: the name flips, the attribute must still be absent. 0.5× leaves
    // ~1.8s per step (BASE_DELAY / speed), so this window is not a race.
    await page.locator(`${VIZ} [data-viz-speed]`).selectOption('0.5');
    await play.click();
    await expect(play).toHaveAccessibleName('Pause');
    await expect(play).not.toHaveAttribute('aria-pressed');

    // Paused again: a resting name, still no pressed state. The name is matched
    // loosely because a long enough stall between the two clicks would let the
    // trace finish and legitimately rename the button to "Replay from start";
    // what this test guards is the ABSENCE of aria-pressed in every state.
    await play.click();
    await expect(play).toHaveAccessibleName(/^(Play|Replay from start)$/);
    await expect(play).not.toHaveAttribute('aria-pressed');
  });

  test('mark-complete keeps one label and reports state through aria-pressed', async ({
    page,
  }) => {
    await page.goto(LESSON);

    const button = page.locator('[data-mark-complete]');
    const label = button.locator('.mark-complete__label');
    // The two glyphs are mutually exclusive by CSS, driven off aria-pressed.
    const emptyCircle = button.locator('.mark-complete__icon--incomplete');
    const checkMark = button.locator('.mark-complete__icon--complete');
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await expect(label).toHaveText('Mark as complete');
    await expect(emptyCircle).toBeVisible();
    await expect(checkMark).toBeHidden();

    await button.click();

    // State moved to aria-pressed; the visible label did NOT move with it.
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(label).toHaveText('Mark as complete');
    await expect(button).not.toContainText('Completed');
    // With the label frozen, the glyph swap is the state's only non-colour
    // visible cue — assert BOTH halves so neither rule can be dropped.
    await expect(checkMark).toBeVisible();
    await expect(emptyCircle).toBeHidden();
    expect(
      await page.evaluate(
        (slug) => localStorage.getItem(`lesson:${slug}:complete`),
        SLUG,
      ),
    ).toBe('1');

    // Reload re-applies the stored state to the same constant label — and to
    // the same glyph, which is what a returning reader actually sees first.
    await page.reload();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(label).toHaveText('Mark as complete');
    await expect(checkMark).toBeVisible();
    await expect(emptyCircle).toBeHidden();

    // Toggling off clears the key rather than storing a falsy value, so the
    // /learn index's `=== '1'` read and the M7.2 reset control agree.
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await expect(emptyCircle).toBeVisible();
    await expect(checkMark).toBeHidden();
    expect(
      await page.evaluate(
        (slug) => localStorage.getItem(`lesson:${slug}:complete`),
        SLUG,
      ),
    ).toBeNull();
  });
});

test('every disclosure summary on the lesson page is unique (CNT-8)', async ({
  page,
}) => {
  await page.goto(LESSON);

  // Practice answers used to ship three identical "Show answer" summaries, which
  // are indistinguishable in a screen reader's list of controls. Assert page-wide
  // uniqueness rather than Practice-only: the same ambiguity would be a defect in
  // Common pitfalls, the "On this page" bar or an instrument's own disclosures —
  // and the 2026-08 redesign proved that by putting a SECOND `<details>` inside
  // every instrument (amendment C-2 folded custom input behind one), so a lesson
  // with two visualizers offered two identical "Run it on your own input"
  // controls until each was made to name its own algorithm, exactly as the
  // ledger's summary already did.
  // textContent, not innerText: innerText reports '' for anything the layout is
  // not currently rendering, so a summary hidden at this viewport would be read
  // as an empty string and two of them would look like a duplicate. That once
  // bit here for real (the ToC was display:none at desktop widths before
  // amendment L-3 retired the rail); textContent never depended on it, and
  // still does not now that these summaries sit inside a sticky bar and inside
  // instrument panes whose CSS is free to move again.
  const summaries = (
    await page.locator('details > summary').allTextContents()
  ).map((text) => text.trim().replace(/\s+/g, ' '));
  expect(summaries.length).toBeGreaterThan(0);
  expect(summaries).toEqual([...new Set(summaries)]);
  // …and the generic label is gone entirely, not merely deduplicated.
  expect(summaries).not.toContain('Show answer');
});

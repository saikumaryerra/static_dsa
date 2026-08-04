/**
 * M8.1 — the two states the gamification layer must survive without a trace:
 * **JavaScript disabled** and **`localStorage` blocked** (`docs/m8-gamification.md`
 * acceptance: "every M8 component carries its own `<noscript>` kill-switch so no
 * gamification affordance appears without JS … pips/ring/milestone absent — not
 * broken — when storage is blocked").
 *
 * These are the tests that have to assert ABSENCE, which is the hard direction:
 * a page that renders nothing because its island crashed passes every "is it
 * gone?" check. So each block below carries a DISCRIMINATOR — a marker that only
 * exists once the island has actually run — before it asserts what is missing:
 *
 * - JS off: there is no island, and the requirement is that the page is exactly
 *   what M7 shipped. The discriminator is the M7 surface itself (the disclosure
 *   still opens, the answer is still readable, the lesson still navigates), plus
 *   the fact that no element anywhere carries the `data-stage` attribute the
 *   whole pip contract hangs off.
 * - Storage blocked: the islands DO run, and must degrade instead of throwing.
 *   The discriminators are the grade buttons (shipped `disabled`, enabled only
 *   by the script) and, on `/learn`, a control pass through the SAME page with
 *   the store working before it is blocked — so "degraded" is provably
 *   distinguishable from "died", even though the honest degraded state for the
 *   track arc is now to stay hidden.
 *
 * Every block also fails on any uncaught page error: spec §6 requires each
 * storage access to be `try/catch`-guarded, and a single unguarded one takes the
 * rest of the island's script down with it.
 */
import { expect, test, type Page } from '@playwright/test';
import {
  blockStorage,
  gradeQuestion,
  masteryKey,
  openQuestion,
  readKey,
  seedStorage,
  trackArc,
  trackPageErrors,
} from './utils/mastery';

const LESSON = 'arrays';
const LESSON_URL = `/learn/${LESSON}`;
const LEARN = '/learn';

/** Accessible names of every button a reader can actually see and press. */
async function visibleButtonNames(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .filter((button) => button.getClientRects().length > 0)
      .map((button) => (button.textContent ?? '').replace(/\s+/g, ' ').trim()),
  );
}

test.describe('JavaScript disabled — the page is M7, plus one line of static copy', () => {
  test.use({ javaScriptEnabled: false });

  test('a lesson shows no pip, no grade button, no tally and no milestone', async ({
    page,
  }) => {
    await page.goto(LESSON_URL);

    // The whole pip contract is one attribute, written by an island. With no
    // island, no element on the page may carry it — asserted globally rather
    // than per-component, so a future M8 surface cannot quietly opt out.
    await expect(page.locator('[data-stage]')).toHaveCount(0);
    await expect(page.locator('[data-mastery-pips]:visible')).toHaveCount(0);
    await expect(page.locator('[data-lesson-stage]')).toBeHidden();
    // The stage label ships EMPTY, so even an engine that ignored the
    // kill-switch could not paint a claim about a device the build never saw.
    await expect(page.locator('[data-mastery-label]')).toHaveText('');

    // The self-grade affordances are hidden by PracticeCheck's own kill-switch
    // (`Collapsible` has none — it needs no JS, so it has nothing to switch off).
    await expect(page.locator('[data-practice-grade]:visible')).toHaveCount(0);
    await expect(page.locator('[data-practice-footer]:visible')).toHaveCount(0);
    await expect(page.locator('[data-practice-tally]:visible')).toHaveCount(0);
    await expect(page.locator('[data-practice-status]')).toBeHidden();

    // MarkComplete's group goes whole — button, saved note and the milestone
    // line inside it. A visible button that cannot save is worse than none.
    await expect(page.locator('[data-mark-complete-group]')).toBeHidden();
    await expect(page.locator('[data-milestone]')).toBeHidden();
    await expect(page.locator('[data-milestone]')).toHaveText('');

    // Nothing pressable that a reader can reach belongs to M8.
    const names = await visibleButtonNames(page);
    for (const banned of ['I had it', 'Not yet', 'Mark as complete']) {
      expect(
        names,
        `"${banned}" must not be reachable with JS off`,
      ).not.toContain(banned);
    }
    // …and no CLAIM about this device is rendered anywhere on the page. Static
    // copy that explains the vocabulary is fine (the design permits exactly
    // that difference from M7); a stage, a tally or a saved-note is not,
    // because the build cannot see the device it would be describing.
    const text = await page.locator('body').innerText();
    for (const claim of [
      'Learned on this device',
      'Practiced on this device',
      'Mastered on this device',
      'Saved on this device only',
    ]) {
      expect(text, `"${claim}" must not appear with JS off`).not.toContain(
        claim,
      );
    }
    // The tally's shape, whatever its wording: "N of M …" about this reader.
    expect(text, 'no tally may be rendered with JS off').not.toMatch(
      /\b\d+ of \d+ (answered|checked|complete|done)\b/i,
    );
  });

  test('the Practice answers still open, and still read as answers', async ({
    page,
  }) => {
    await page.goto(LESSON_URL);
    const roots = page.locator('[data-practice-check]');
    const count = await roots.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i += 1) {
      const root = roots.nth(i);
      // The retrieval prompt is static copy that needs no script — the one
      // difference from M7 the design permits, and it is readable here.
      await expect(root.locator('.practice-check__prompt')).toHaveText(
        'Answer it in your head or on paper first.',
      );

      const content = root.locator('.collapsible__content');
      await expect(content).toBeHidden();
      // A native <details>: the browser opens it with no script at all.
      // `openQuestion` settles the layout first — opening the answer above
      // this one is a 300ms `block-size` animation, and clicking into it is
      // the flake `settle()` exists to remove (see `utils/mastery.ts`).
      await openQuestion(page, i);
      await expect(content).toBeVisible();
      expect((await content.innerText()).trim().length).toBeGreaterThan(20);
      // Opening it reveals the ANSWER and nothing else — the footer stays gone.
      await expect(root.locator('[data-practice-footer]')).toBeHidden();
    }
  });

  test('the curriculum index shows no ring, no pips and no reset control', async ({
    page,
  }) => {
    await page.goto(LEARN);

    await expect(page.locator('[data-stage]')).toHaveCount(0);
    await expect(page.locator('[data-mastery-pips]:visible')).toHaveCount(0);
    await expect(page.locator('[data-track-progress]:visible')).toHaveCount(0);
    await expect(page.locator('[data-reset-toggle]:visible')).toHaveCount(0);
    await expect(page.locator('[data-lesson-card][data-complete]')).toHaveCount(
      0,
    );

    // The counters are hidden rather than reporting "0 of 9" about a device the
    // build cannot see, and no earned count is claimed either. Only the NUMBERS
    // are banned: the currency legend is static copy that names the three
    // stages and must survive with JS off (see `m8-decisions.spec.ts`), so a
    // blanket ban on the words would forbid the one M8 surface that is allowed
    // here — and would have to be deleted the moment it landed.
    const text = await page.locator('body').innerText();
    expect(text).not.toContain('done on this device');
    expect(text).not.toMatch(/\bPracticed \d/);
    expect(text).not.toMatch(/\bMastered \d/);

    // The M7 page underneath is fully usable: every card is still a real link.
    const cards = page.locator('[data-lesson-card]');
    expect(await cards.count()).toBeGreaterThanOrEqual(15);
    await expect(cards.first()).toHaveAttribute('href', /^\/learn\//);
    await expect(page.locator('[data-resume-link]')).toBeVisible();
  });
});

test.describe('storage blocked (private mode) — absent, never broken', () => {
  test('a lesson still answers every click, and promises nothing it cannot keep', async ({
    page,
  }) => {
    const errors = trackPageErrors(page);
    await blockStorage(page);
    await page.goto(LESSON_URL);

    const root = page.locator('[data-practice-check]').first();
    const had = root.locator('[data-practice-grade="had"]');
    // DISCRIMINATOR: the buttons ship `disabled` and are enabled only by the
    // island. Enabled here proves the script ran to completion with the store
    // throwing under it — the difference between "degraded" and "died".
    await expect(had).toBeEnabled();

    await openQuestion(page, 0);
    await had.click();
    // The view responds for this visit — the reader pressed a button, so it
    // must do something…
    await expect(had).toHaveAttribute('aria-pressed', 'true');
    // …but nothing claims a save that never happened, and nothing is announced
    // about a tally that does not exist.
    await expect(root.locator('[data-practice-saved]')).toBeHidden();
    await expect(page.locator('[data-practice-status]')).toHaveText('');

    // No stage is shown: `none` is the honest answer when the store cannot be
    // read, and an absent pip row is exactly how a JS-off page looks.
    await expect(page.locator('[data-lesson-stage]')).toBeHidden();
    await expect(
      page.locator('[data-lesson-stage] [data-mastery-pips]'),
    ).not.toHaveAttribute('data-stage');

    // The completion toggle keeps its M7 behaviour beside it.
    const mark = page.locator('[data-mark-complete]');
    await mark.click();
    await expect(mark).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-mark-complete-note]')).toBeHidden();
    // A stage cannot be raised by a mark that was never stored.
    await expect(page.locator('[data-lesson-stage]')).toBeHidden();
    await expect(page.locator('[data-milestone]')).toHaveText('');

    expect(errors, 'no script may throw when storage is blocked').toEqual([]);
  });

  test('the curriculum index withholds the track arc rather than claiming "0 of 9"', async ({
    page,
  }) => {
    const errors = trackPageErrors(page);

    // CONTROL, on this same build with the store working: the arc reveals
    // itself and states a number. "Hidden" below is therefore a decision about
    // blocked storage, not a dead island or a missing component.
    await page.goto(LEARN);
    const foundations = trackArc(page, 'foundations');
    await expect(foundations).toBeVisible();
    await expect(foundations.locator('[data-track-count]')).toHaveText(
      /^0 of \d+ done on this device$/,
    );

    await blockStorage(page);
    await page.reload();

    // "0 of 9" is only honest when the store was READ and held nothing. With
    // the store throwing, the same sentence is a claim about a device nobody
    // could see — and a reader with nine finished lessons would be told they
    // have none. Absent is the honest state (`docs/m8-gamification.md`:
    // "hidden is more honest than a static '0 of 9'"), and it is exactly how
    // the same block looks before hydration and with JS off.
    await expect(foundations).toBeHidden();
    const visible = await page.locator('body').innerText();
    expect(
      visible,
      'no count may be claimed off a store that threw',
    ).not.toMatch(/\bdone on this device\b/);
    expect(visible).not.toMatch(/\bPracticed \d/);
    expect(visible).not.toMatch(/\bMastered \d/);

    // No card may show a stage it could not have read either.
    await expect(page.locator('[data-mastery-pips][data-stage]')).toHaveCount(
      0,
    );
    await expect(page.locator('[data-mastery-pips]:visible')).toHaveCount(0);
    // Nothing to delete, so the control says so (aria-disabled, never
    // `disabled`, so a reader who tabbed onto it keeps focus).
    await expect(page.locator('[data-reset-toggle]')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    // DISCRIMINATOR for the blocked pass: the page is still fully usable, so
    // the island degraded rather than taking the index down with it.
    await expect(page.locator('[data-resume-link]')).toBeVisible();
    await expect(page.locator('[data-lesson-card]').first()).toBeVisible();

    expect(errors, 'no script may throw when storage is blocked').toEqual([]);
  });
});

test.describe('a record this build cannot trust', () => {
  test('corrupt JSON reads as "nothing recorded" and is overwritten cleanly', async ({
    page,
  }) => {
    const errors = trackPageErrors(page);
    // The value crosses a boundary the store does not control: another tab, a
    // truncated write, a hand-edited store. It must cost the stage, never the
    // page.
    await seedStorage(page, { [masteryKey(LESSON)]: '{"practicedAt":' });
    await page.goto(LESSON_URL);

    await expect(page.locator('[data-lesson-stage]')).toBeHidden();
    await expect(
      page.locator('[data-lesson-stage] [data-mastery-pips]'),
    ).not.toHaveAttribute('data-stage');
    expect(errors).toEqual([]);

    // A grade lands on a clean record rather than throwing on the way in — and
    // the corrupt value is REPLACED, not merged with, so nothing survives it.
    //
    // The whole documented shape is asserted (`toEqual`, not a subset match),
    // which is what makes "replaced, not merged" checkable. M8.2 added the two
    // scheduler fields the design's data model lists — `{ practicedAt,
    // masteredAt, intervalIndex, lastReviewAt, checks[], note }` — so a repaired
    // record now carries their defaults: the first interval, and no review yet.
    await gradeQuestion(page, 0, 'had');
    expect(JSON.parse((await readKey(page, masteryKey(LESSON)))!)).toEqual({
      practicedAt: null,
      masteredAt: null,
      intervalIndex: 0,
      lastReviewAt: null,
      checks: [1, null, null],
    });
    // Still no stage: one grade out of three is not a rung on the ladder, and
    // a corrupt record cannot be repaired into one.
    await expect(
      page.locator('[data-lesson-stage] [data-mastery-pips]'),
    ).not.toHaveAttribute('data-stage');
    expect(errors).toEqual([]);
  });

  test('a record with the wrong shape earns nothing', async ({ page }) => {
    const errors = trackPageErrors(page);
    // Timestamps that are not timestamps, checks that are not checks: each
    // field is validated on its own, so a partly-corrupt record costs only the
    // fields that were actually corrupt — and none of them fabricate a stage.
    await seedStorage(page, {
      [masteryKey(LESSON)]: JSON.stringify({
        practicedAt: 'yesterday-ish',
        masteredAt: 42,
        checks: 'all of them',
      }),
    });
    await page.goto(LESSON_URL);

    await expect(page.locator('[data-lesson-stage]')).toBeHidden();
    await page.goto(LEARN);
    await expect(page.locator('[data-mastery-pips][data-stage]')).toHaveCount(
      0,
    );
    await expect(
      page.locator('[data-track-progress="foundations"] [data-track-mastery]'),
    ).toHaveText('Practiced 0 · Mastered 0');
    expect(errors).toEqual([]);
  });

  test('a record written under an unknown version is ignored, not guessed at', async ({
    page,
  }) => {
    // The version lives in the KEY, so a future incompatible shape moves to
    // `progress:v2:{slug}` and this reader ignores it by construction rather
    // than mis-parsing it into a stage the reader never earned.
    await seedStorage(page, {
      [`progress:v2:${LESSON}`]: JSON.stringify({
        practicedAt: new Date().toISOString(),
        masteredAt: new Date().toISOString(),
        checks: [1, 1, 1],
      }),
    });
    await page.goto(LESSON_URL);
    await expect(page.locator('[data-lesson-stage]')).toBeHidden();

    await page.goto(LEARN);
    await expect(page.locator('[data-mastery-pips][data-stage]')).toHaveCount(
      0,
    );
  });
});

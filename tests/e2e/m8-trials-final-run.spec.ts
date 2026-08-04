/**
 * M8.3 — Trace Trials and the Final Run, in the browser (`docs/m8-gamification.md`
 * → "M8.3 — Enrichment"; spec §7.8, §11.3's `viz:run` amendment).
 *
 * The pure halves — the predicate evaluator, the witness guard that fails the
 * BUILD for an unsolvable trial, the metric vocabulary, the pinned-input map —
 * live in `tests/unit/challenges.test.ts`. What only a browser can answer is
 * whether the reader can actually CLEAR these things through the affordances the
 * lesson already has, and whether the enrichment layer keeps the design's
 * promises while they do:
 *
 * - **Nothing is ever timed** (2.2.1, and beginner anxiety — timed challenges
 *   are on the killed list).
 * - **The hint is never rationed.** Gating it behind failed attempts would price
 *   the first wrong try, which is the try the mechanic exists to elicit.
 * - **No first-try bonus, anywhere.** Not in the DOM, not in storage, not in the
 *   wording: clearing on the fifth attempt must be reported and recorded exactly
 *   as clearing on the first. This is the invariant with the sharpest edge, so
 *   it is asserted by comparing two devices byte for byte.
 * - **A miss costs nothing** and immediately hands over the real number plus the
 *   route to watch it happen (hypercorrection).
 *
 * Trials consume the run the reader just watched — the `viz:run` event carries
 * the trace's final step — so nothing here re-runs an algorithm to grade it, and
 * every clearing input below is crafted in the visualizer's OWN "Try your own
 * input" form, exactly as a reader would.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  blockStorage,
  curriculum,
  daysAgo,
  masteryKey,
  readKey,
  readRecord,
  seedStorage,
  trackIntervals,
  trackPageErrors,
  writeStorage,
  type LessonRef,
} from './utils/mastery';
import { hydrateViz, storageFingerprint } from './utils/predict';

/** The two enrichment keys spec §6 enumerates (`src/lib/challenges.ts`). */
const CHALLENGES_KEY = 'ld:challenges:v1';
const FINAL_RUN_KEY = 'ld:finalrun:v1';

const TRIAL = '[data-challenge]';
const FINAL = '[data-final-run]';

/**
 * The trial this suite exercises end to end, and the input that clears it.
 *
 * Chosen because it is the design's own worked example and its twin reveal is
 * the lesson's point: already-sorted input is quick sort's WORST case (21
 * comparisons on seven values) and simultaneously its zero-swap case, because
 * both self-swap guards decline to move anything. The catalog's witness is the
 * same string, so the build has already proved it clears.
 */
const WORST_CASE = {
  lesson: 'sorting-efficient',
  id: 'sorting-efficient/worst-case',
  algorithm: 'quick-sort',
  clears: '[1,2,3,4,5,6,7]',
  /** Seven values that are NOT sorted, so the swap rule refuses them. */
  misses: '[7,6,5,4,3,2,1]',
} as const;

/** Vocabulary a trial or a Final Run may never use about the reader. */
const BANNED =
  /\b(attempts?|tries|try \d|first try|score|scored|points?|xp|rank|streak|failed|wrong again|best time|fastest|record)\b/i;

/** Any timing or countdown affordance at all. */
const TIMED =
  /\b(seconds? left|time left|timer|countdown|beat the clock|\d+:\d\d)\b/i;

/** Runs a custom input through a visualizer's own form and waits for the run. */
async function runInput(viz: Locator, array: string): Promise<void> {
  await viz.locator('[data-viz-array]').fill(array);
  const target = viz.locator('[data-viz-target]');
  // The second field is opt-out (`showTarget`, default true), so a sort
  // visualizer usually still has one and a stale value would ride along into
  // the composed input string. Emptied when it is there, skipped when the
  // lesson turned it off (recursion, DP, the structure lessons).
  if ((await target.count()) > 0) await target.fill('');
  await viz.locator('[data-viz-run]').click();
  await expect(viz.locator('[data-viz-error]')).toBeHidden();
}

/**
 * Loads a lesson and returns the hydrated visualizer a trial is graded against.
 *
 * @param page - The page to navigate.
 * @param lesson - Lesson slug.
 * @param algorithm - Registry algorithm id of the visualizer to use.
 */
async function openTrialLesson(
  page: Page,
  lesson: string,
  algorithm: string,
): Promise<Locator> {
  await page.goto(`/learn/${lesson}`);
  return hydrateViz(page.locator(`[data-viz][data-algorithm="${algorithm}"]`));
}

/** Every lesson of one track, in curriculum order. */
async function track(page: Page, name: string): Promise<LessonRef[]> {
  return (await curriculum(page)).filter((lesson) => lesson.track === name);
}

/**
 * The first Algorithms lesson that hosts a Final Run.
 *
 * Discovered rather than hardcoded: §7.8 makes the section optional per lesson,
 * so which lessons carry one is an authoring decision this suite must not
 * freeze. Fails with a message naming the wiring when none is found at all —
 * a component that exists but was never placed in an `.mdx` reaches no reader.
 */
async function findFinalRunLesson(page: Page): Promise<string> {
  for (const lesson of await track(page, 'algorithms')) {
    await page.goto(`/learn/${lesson.slug}`);
    if ((await page.locator(FINAL).count()) > 0) return lesson.slug;
  }
  throw new Error(
    'No lesson renders <FinalRun>. The component exists but is placed in no lesson body, so no reader can reach it (docs/m8-gamification.md M8.3; spec §7.8).',
  );
}

test.describe('the trials reached the lessons they were written for', () => {
  test('every rendered trial belongs to its page, is unique, and sits in the Algorithms track', async ({
    page,
  }) => {
    const lessons = await curriculum(page);
    const seen: string[] = [];

    for (const lesson of lessons) {
      await page.goto(`/learn/${lesson.slug}`);
      const ids = await page.evaluate(() =>
        [...document.querySelectorAll('[data-challenge]')].map(
          (card) => card.getAttribute('data-challenge-id') ?? '',
        ),
      );
      for (const id of ids) {
        // The id IS the storage key, and it names the lesson: a card whose id
        // disagreed with the page it is on would write a clear under another
        // lesson's name (`docs/m8-gamification.md`: "lesson slugs, not
        // algorithm ids").
        expect(id, `trial id on ${lesson.slug}`).toMatch(
          new RegExp(`^${lesson.slug}/[a-z0-9-]+$`),
        );
      }
      if (lesson.track === 'foundations') {
        // Progressive disclosure: the demanding mechanics are concentrated
        // where complexity reasoning is the objective, and Foundations stays
        // the lowest-overhead track.
        expect(ids, `${lesson.slug} is a Foundations lesson`).toEqual([]);
      }
      // A wall of puzzles is a chore; the design ramps 1 → 3 across the track.
      expect(ids.length, `trials on ${lesson.slug}`).toBeLessThanOrEqual(3);
      seen.push(...ids);
    }

    // Authored trials that reach no page are dead weight — and the catalog is
    // the shipped set, not a backlog.
    expect(
      seen.length,
      'the Algorithms track must ship trials',
    ).toBeGreaterThan(5);
    expect(new Set(seen).size, 'trial ids must be unique').toBe(seen.length);
  });

  test('a trial states its ask, keeps its hint open to everyone, and times nothing', async ({
    page,
  }) => {
    const readIntervals = await trackIntervals(page);
    await page.goto(`/learn/${WORST_CASE.lesson}`);
    const card = page.locator(`[data-challenge-id="${WORST_CASE.id}"]`);
    await expect(card, `${WORST_CASE.id} must be on its lesson`).toHaveCount(1);

    // A named group, so the prompt is announced with the card rather than as
    // three loose paragraphs — and the title carries the identity payoff the
    // killed badge system would have.
    await expect(card).toHaveAttribute('role', 'group');
    const labelledBy = await card.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    await expect(page.locator(`#${labelledBy}`)).toHaveText(
      'Worst Case Scenario',
    );

    // The hint is present from the first visit, needs no script, and is not
    // rationed behind a failed attempt: a trial nobody can get into is not a
    // learning act.
    const hint = card.locator('details');
    await expect(hint).toHaveCount(1);
    await expect(hint.locator('summary')).toBeVisible();
    await hint.locator('summary').click();
    expect((await hint.innerText()).trim().length).toBeGreaterThan(40);

    // Nothing is timed and nothing is counted.
    const text = (await card.innerText()).replace(/\s+/g, ' ');
    expect(text, `timing in "${text}"`).not.toMatch(TIMED);
    expect(text, `scorekeeping in "${text}"`).not.toMatch(BANNED);
    expect(
      await readIntervals(),
      'a trial must schedule no repeating timer',
    ).toEqual([]);

    // Nothing is claimed on load: the status line ships empty, so a returning
    // reader is announced at.
    await expect(card.locator('[data-challenge-run]')).toHaveText('');
    await expect(card.locator('[data-challenge-cleared]')).toBeHidden();
  });

  test('the pinned array is copyable, because the trial asks the reader to vary something else', async ({
    page,
  }) => {
    // Binary search's trial pins the array and asks for a target, so the reader
    // has to be able to reproduce the array exactly.
    await page.goto('/learn/binary-search');
    const card = page.locator('[data-challenge-id="binary-search/two-probes"]');
    await expect(card).toHaveCount(1);
    await expect(card.locator('code')).toHaveText(
      '[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]',
    );
  });
});

test.describe('a trial is cleared through the visualizer that is already there', () => {
  test('the crafted run clears it, states what the run did, and saves it', async ({
    page,
  }) => {
    const viz = await openTrialLesson(
      page,
      WORST_CASE.lesson,
      WORST_CASE.algorithm,
    );
    const card = page.locator(`[data-challenge-id="${WORST_CASE.id}"]`);
    await expect(card, `${WORST_CASE.id} must be on its lesson`).toHaveCount(1);
    await expect(card).not.toHaveAttribute('data-cleared', /.*/);

    // The reader's whole act: type an array into the form the lesson already
    // has, press Run, watch it. No second input, no submit button of the
    // trial's own — the card grades the run that just happened.
    await runInput(viz, WORST_CASE.clears);

    const status = card.locator('[data-challenge-run]');
    await expect(status).toContainText('Cleared');
    // ACTIVITY in the algorithm's own units, never a score: the twin reveal is
    // that the same run is both the maximum comparisons and zero swaps.
    await expect(status).toContainText('21 comparisons');
    await expect(status).toContainText('0 swaps');
    await expect(status).toContainText('Saved on this device only.');
    await expect(status).toHaveAttribute('role', 'status');
    await expect(card).toHaveAttribute('data-cleared', 'true');

    // The record is a bare "cleared", keyed by `{lesson}/{trial}` — no attempt
    // count, no timestamp to render as a personal best.
    expect(JSON.parse((await readKey(page, CHALLENGES_KEY))!)).toEqual({
      [WORST_CASE.id]: 1,
    });
  });

  test('a run that misses reports what it did and leaves the trial open', async ({
    page,
  }) => {
    const viz = await openTrialLesson(
      page,
      WORST_CASE.lesson,
      WORST_CASE.algorithm,
    );
    const card = page.locator(`[data-challenge-id="${WORST_CASE.id}"]`);
    const status = card.locator('[data-challenge-run]');

    await runInput(viz, WORST_CASE.misses);

    // "Not yet" is a state of the PUZZLE, not a mark against the person — and
    // the line reports the run's own counters so the reader learns something
    // from the miss.
    await expect(status).toContainText('Not yet');
    await expect(status).toContainText('comparisons');
    await expect(card).not.toHaveAttribute('data-cleared', /.*/);
    expect(await readKey(page, CHALLENGES_KEY)).toBeNull();
    // Nothing about the miss is counted or held against the next attempt.
    const text = (await card.innerText()).replace(/\s+/g, ' ');
    expect(text).not.toMatch(BANNED);

    // …and the next run clears it, with no memory of the miss.
    await runInput(viz, WORST_CASE.clears);
    await expect(status).toContainText('Cleared');
    await expect(card).toHaveAttribute('data-cleared', 'true');
  });

  test('a cleared trial stays cleared, and never re-opens on a later run', async ({
    page,
  }) => {
    await seedStorage(page, {
      [CHALLENGES_KEY]: JSON.stringify({ [WORST_CASE.id]: 1 }),
    });
    const viz = await openTrialLesson(
      page,
      WORST_CASE.lesson,
      WORST_CASE.algorithm,
    );
    const card = page.locator(`[data-challenge-id="${WORST_CASE.id}"]`);

    // The persistent line is REVEALED rather than written, so a returning
    // reader meets no announcement.
    await expect(card).toHaveAttribute('data-cleared', 'true');
    await expect(card.locator('[data-challenge-cleared]')).toBeVisible();
    await expect(card.locator('[data-challenge-cleared]')).toHaveText(
      'Cleared on this device.',
    );
    await expect(card.locator('[data-challenge-run]')).toHaveText('');

    // A reader who keeps experimenting is never told "not yet" about something
    // they already did: no stage in this system goes down.
    await runInput(viz, WORST_CASE.misses);
    await expect(card.locator('[data-challenge-run]')).toHaveText('');
    await expect(card).toHaveAttribute('data-cleared', 'true');
  });

  test('clearing a trial earns no mastery — enrichment is not a promotion', async ({
    page,
  }) => {
    const viz = await openTrialLesson(
      page,
      WORST_CASE.lesson,
      WORST_CASE.algorithm,
    );
    await runInput(viz, WORST_CASE.clears);
    await expect(
      page.locator(`[data-challenge-id="${WORST_CASE.id}"]`),
    ).toHaveAttribute('data-cleared', 'true');

    // The three Practiced paths are the practice checks, a predict session and
    // a cleared Final Run. A trial is none of them.
    expect(await readKey(page, masteryKey(WORST_CASE.lesson))).toBeNull();
    await expect(page.locator('[data-lesson-stage]')).toBeHidden();
  });
});

test.describe('the Final Run: unlimited attempts, no first-try anything', () => {
  test('a miss hands over the real number and the way to watch it', async ({
    page,
  }) => {
    const slug = await findFinalRunLesson(page);
    const card = page.locator(FINAL);
    const answer = Number(await card.getAttribute('data-answer'));
    expect(Number.isFinite(answer)).toBe(true);

    const field = card.locator('[data-final-run-input]');
    // DISCRIMINATOR: every control ships `disabled` and is enabled only by the
    // island, so an enabled field proves the script ran.
    await expect(field).toBeEnabled();
    await expect(card.locator('[data-final-run-watch]')).toBeHidden();

    await field.fill(String(answer + 1));
    await card.locator('[data-final-run-check]').click();

    // Hypercorrection: the correction arrives immediately and in full, because
    // a surprising correction right after a confident error is when it sticks.
    const status = card.locator('[data-final-run-status]');
    await expect(status).toContainText('Not quite');
    await expect(status).toContainText(
      (await card.getAttribute('data-answer-text'))!,
    );
    // …beside the route into the visualization, which is a real link to a real
    // heading on this page.
    const watch = card.locator('[data-final-run-watch]');
    await expect(watch).toBeVisible();
    const href = await watch.locator('a').getAttribute('href');
    expect(href).toMatch(/^#/);
    await expect(page.locator(href!)).toHaveCount(1);

    // A miss is not a mark: nothing is recorded and nothing is counted.
    expect(await readKey(page, FINAL_RUN_KEY)).toBeNull();
    expect(await readKey(page, masteryKey(slug))).toBeNull();
    expect((await card.innerText()).replace(/\s+/g, ' ')).not.toMatch(BANNED);
  });

  test('"Show the answer" is there from the start and costs nothing', async ({
    page,
  }) => {
    await findFinalRunLesson(page);
    const card = page.locator(FINAL);
    const before = await storageFingerprint(page);

    // The escape is visible before the first guess: a reader who does not want
    // to guess must not have to guess wrong to move on.
    const reveal = card.locator('[data-final-run-reveal]');
    await expect(reveal).toBeVisible();
    await expect(reveal).toBeEnabled();
    await reveal.click();

    await expect(card.locator('[data-final-run-status]')).toContainText(
      (await card.getAttribute('data-answer-text'))!,
    );
    // Revealing is not clearing — the reader predicted nothing — and it is not
    // punished either, because this system has no penalty to charge.
    await expect(card).not.toHaveAttribute('data-cleared', /.*/);
    expect(await storageFingerprint(page)).toBe(before);
  });

  test('clearing on the fifth try is recorded and worded exactly like the first', async ({
    page,
  }) => {
    const slug = await findFinalRunLesson(page);
    const card = page.locator(FINAL);
    const answer = (await card.getAttribute('data-answer'))!;
    const field = card.locator('[data-final-run-input]');
    const check = card.locator('[data-final-run-check]');
    const status = card.locator('[data-final-run-status]');

    // Device A: right first time.
    await field.fill(answer);
    await check.click();
    await expect(status).toContainText("That's it");
    const firstTryWords = await status.innerText();
    const firstTryRecord = await readKey(page, FINAL_RUN_KEY);
    await expect(card).toHaveAttribute('data-cleared', 'true');

    // Device B: the same lesson, cleared after four misses. The misses are
    // derived from the answer rather than written down, so no literal here can
    // accidentally BE the answer on a lesson whose metric happens to be small.
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    for (const offset of [1, 2, 3, 7]) {
      await field.fill(String(Number(answer) + offset));
      await check.click();
    }
    await field.fill(answer);
    await check.click();
    await expect(status).toContainText("That's it");

    // Identical credit, in the words AND in the record. A "first try" flag or a
    // count of attempts would show up as a difference in exactly one of these
    // two comparisons (`docs/m8-gamification.md` killed both).
    expect(await status.innerText()).toBe(firstTryWords);
    expect(await readKey(page, FINAL_RUN_KEY)).toBe(firstTryRecord);
    expect(JSON.parse((await readKey(page, FINAL_RUN_KEY))!)).toEqual({
      [slug]: { c: 1 },
    });
    // Nothing on the card counts either.
    expect((await card.innerText()).replace(/\s+/g, ' ')).not.toMatch(BANNED);
    expect(await card.innerText()).not.toMatch(/\b[2-9]\s*(attempts|tries)\b/i);
  });

  test('a cleared Final Run is the third Practiced path — through recordPass, not around it', async ({
    page,
  }) => {
    const slug = await findFinalRunLesson(page);
    const card = page.locator(FINAL);
    const answer = (await card.getAttribute('data-answer'))!;

    await card.locator('[data-final-run-input]').fill(answer);
    await card.locator('[data-final-run-check]').click();
    await expect(card).toHaveAttribute('data-cleared', 'true');

    // Practiced, and only Practiced: the 3-day gate lives in `recordPass`, so a
    // Final Run cannot mint a Mastered lesson in one sitting.
    const record = await readRecord(page, slug);
    expect(record?.practicedAt ?? null).not.toBeNull();
    expect(record?.masteredAt ?? null).toBeNull();

    await page.reload();
    await expect(page.locator('[data-lesson-stage]')).toBeVisible();
    await expect(page.locator('[data-mastery-label]').first()).toHaveText(
      'Practiced on this device',
    );
  });

  test('a re-pass after the gate promotes, and a returning reader still gets to predict', async ({
    page,
  }) => {
    const slug = await findFinalRunLesson(page);
    // A device that practised this lesson last week and has been offered it for
    // review. `writeStorage`, not an init script: the pass below must survive
    // the reload.
    await writeStorage(page, {
      [masteryKey(slug)]: JSON.stringify({
        practicedAt: daysAgo(9),
        masteredAt: null,
        checks: [],
      }),
      [FINAL_RUN_KEY]: JSON.stringify({ [slug]: { c: 1 } }),
    });
    await page.reload();

    const card = page.locator(FINAL);
    // Already cleared on this device — and the answer is still NOT given away,
    // because on a review visit predicting it again IS the re-pass.
    await expect(card).toHaveAttribute('data-cleared', 'true');
    await expect(card.locator('[data-final-run-cleared]')).toBeVisible();
    await expect(card.locator('[data-final-run-status]')).toHaveText('');
    await expect(card.locator('[data-final-run-input]')).toBeEnabled();

    const answer = (await card.getAttribute('data-answer'))!;
    await card.locator('[data-final-run-input]').fill(answer);
    await card.locator('[data-final-run-check]').click();

    await expect
      .poll(async () => (await readRecord(page, slug))?.masteredAt ?? null)
      .not.toBeNull();
  });
});

test.describe('the reset control clears the enrichment keys too', () => {
  test('a device holding only trial clears can still clear them', async ({
    page,
  }) => {
    // Spec §6 splits the keys into progress and preference, and BOTH enrichment
    // keys are progress: a reset that left them behind would keep records the
    // reader asked to delete, and the control would describe itself as having
    // nothing to clear while holding them.
    await seedStorage(page, {
      [CHALLENGES_KEY]: JSON.stringify({ [WORST_CASE.id]: 1 }),
      [FINAL_RUN_KEY]: JSON.stringify({ [WORST_CASE.lesson]: { c: 1 } }),
      theme: 'dark',
    });
    await page.goto('/learn');

    const toggle = page.locator('[data-reset-toggle]');
    await expect(toggle).toHaveAttribute('aria-disabled', 'false');
    await toggle.click();
    await page.locator('[data-reset-confirm]').click();
    await expect(page.locator('[data-progress-status]')).toContainText(
      'Progress reset',
    );

    expect(await readKey(page, CHALLENGES_KEY)).toBeNull();
    expect(await readKey(page, FINAL_RUN_KEY)).toBeNull();
    // …and the preference keys are deliberately untouched.
    expect(await readKey(page, 'theme')).toBe('dark');
  });
});

test.describe('degraded — no JS, no store', () => {
  test.describe('JavaScript disabled', () => {
    test.use({ javaScriptEnabled: false });

    test('neither card appears at all', async ({ page }) => {
      // Both are JS-only by construction — a trial needs the run event and a
      // Final Run needs the check — so a JS-off visitor would otherwise meet a
      // puzzle and a question that can never be finished.
      await page.goto(`/learn/${WORST_CASE.lesson}`);
      await expect(page.locator(`${TRIAL}:visible`)).toHaveCount(0);
      await expect(page.locator(`${FINAL}:visible`)).toHaveCount(0);
      const text = await page.locator('body').innerText();
      expect(text).not.toContain('Trace trial');
      expect(text).not.toContain('Cleared on this device');
      expect(text).not.toContain('Your prediction');

      // DISCRIMINATOR: the lesson itself is intact.
      await expect(
        page.getByRole('heading', { name: 'Practice' }),
      ).toBeVisible();
      await expect(page.locator('[data-practice-check]')).not.toHaveCount(0);
    });
  });

  test('storage blocked: the trial still clears for this visit and claims no save', async ({
    page,
  }) => {
    const errors = trackPageErrors(page);
    await blockStorage(page);
    const viz = await openTrialLesson(
      page,
      WORST_CASE.lesson,
      WORST_CASE.algorithm,
    );
    const card = page.locator(`[data-challenge-id="${WORST_CASE.id}"]`);

    await runInput(viz, WORST_CASE.clears);
    // The result stands for this visit — the reader did the thing…
    await expect(card).toHaveAttribute('data-cleared', 'true');
    await expect(card.locator('[data-challenge-run]')).toContainText('Cleared');
    // …but only the "saved" half of the sentence is withheld, rather than
    // claiming a save that never happened.
    await expect(card.locator('[data-challenge-run]')).not.toContainText(
      'Saved on this device',
    );
    expect(errors, 'no script may throw when storage is blocked').toEqual([]);
  });

  test('storage blocked: the Final Run checks the answer and claims no save', async ({
    page,
  }) => {
    const errors = trackPageErrors(page);
    const slug = await findFinalRunLesson(page);
    await blockStorage(page);
    await page.goto(`/learn/${slug}`);

    const card = page.locator(FINAL);
    const answer = (await card.getAttribute('data-answer'))!;
    // DISCRIMINATOR: the controls ship `disabled`, so an enabled one proves the
    // island ran with the store throwing underneath it.
    await expect(card.locator('[data-final-run-input]')).toBeEnabled();

    await card.locator('[data-final-run-input]').fill(answer);
    await card.locator('[data-final-run-check]').click();

    const status = card.locator('[data-final-run-status]');
    await expect(status).toContainText("That's it");
    await expect(status).not.toContainText('Saved on this device');
    await expect(page.locator('[data-lesson-stage]')).toBeHidden();
    expect(errors, 'no script may throw when storage is blocked').toEqual([]);
  });
});

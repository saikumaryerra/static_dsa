/**
 * M8.1 — the mastery ladder in a browser (`docs/m8-gamification.md`, "The loop";
 * spec §6 keys, §8 curriculum index).
 *
 * The one currency, end to end: **Learned → Practiced → Mastered**, earned by
 * explicit acts only and rendered on three surfaces that must never disagree —
 * the lesson header's pips, the curriculum card's pips, and the track arc's
 * counts.
 *
 * WHY THIS IS A BROWSER SUITE. `vitest.config.ts` runs `environment: 'node'`
 * with no DOM and no `localStorage`, so `tests/unit/progress.test.ts` can prove
 * the PREDICATES (`allChecksPassed`, `masteryGateOpen`, `masteryStageOf`) and
 * `tests/unit/mastery-ui.test.ts` the geometry and the copy — but neither can
 * prove that a reader clicking real buttons moves through those states, that two
 * separate islands paint the same stage, or that the write one component makes
 * is the read another component performs. Everything below is that half.
 *
 * THE 3-DAY GATE is the design's anti-grind rule ("Mastery needs a return visit
 * after a few days — that's how memory consolidates"), and it is the one thing a
 * test cannot wait out. The clock is faked the only honest way: by seeding the
 * STORED `practicedAt` (the input the gate actually reads) and then driving the
 * real UI. `Date` is never mocked — that would test a fake gate.
 */
import { expect, test, type Page } from '@playwright/test';
import {
  cardLabel,
  cardPips,
  completeKey,
  curriculum,
  daysAgo,
  gradeAll,
  gradeQuestion,
  headerLabel,
  headerPips,
  headerStage,
  masteryKey,
  readKey,
  readRecord,
  seedMastery,
  trackCount,
  trackLessons,
  trackMastery,
  writeStorage,
} from './utils/mastery';

/** A Foundations lesson with the standard three Practice questions. */
const LESSON = 'arrays';
const LEARN = '/learn';

/** The `data-total` its Practice section declares — read, never assumed. */
async function questionCount(page: Page): Promise<number> {
  return page.locator('[data-practice-check]').count();
}

test.describe('the ladder, one rung at a time', () => {
  test('a lesson with nothing recorded shows no stage at all', async ({
    page,
  }) => {
    await page.goto(`/learn/${LESSON}`);

    // "Nothing recorded" and "not read yet" are the same state, and neither is
    // a thing to display: hidden is more honest than an empty three-pip row,
    // and nothing here labels absence ("Not started" is not a stage).
    await expect(headerStage(page)).toBeHidden();
    await expect(headerPips(page)).not.toHaveAttribute('data-stage');
    await expect(headerLabel(page)).toHaveText('');

    await page.goto(LEARN);
    await expect(cardPips(page, LESSON)).toBeHidden();
    await expect(cardPips(page, LESSON)).not.toHaveAttribute('data-stage');
    await expect(trackMastery(page, 'foundations')).toHaveText(
      'Practiced 0 · Mastered 0',
    );
  });

  test('"Mark as complete" earns Learned — pip 1, on both surfaces', async ({
    page,
  }) => {
    // Through the real button, not a seeded key: this is what proves M8 reads
    // the same `lesson:{slug}:complete` M7 writes, with no migration step.
    await page.goto(`/learn/${LESSON}`);
    await page.locator('[data-mark-complete]').click();

    await expect(headerStage(page)).toBeVisible();
    await expect(headerPips(page)).toHaveAttribute('data-stage', 'learned');
    // The pips are aria-hidden decoration, so this word is the whole accessible
    // signal — and it carries the device scope every persistent surface owes.
    await expect(headerLabel(page)).toHaveText('Learned on this device');

    await page.goto(LEARN);
    await expect(cardPips(page, LESSON)).toHaveAttribute(
      'data-stage',
      'learned',
    );
    await expect(cardLabel(page, LESSON)).toHaveText('Learned');
    // The completion MARK keeps its exact M7 meaning beside the wider currency.
    await expect(page.locator(`[data-slug="${LESSON}"]`)).toHaveAttribute(
      'data-complete',
      'true',
    );
    await expect(trackCount(page, 'foundations')).toHaveText(
      /^1 of \d+ done on this device$/,
    );
    // Learned is self-reported with no learning precondition, so the earned
    // counts sit beside it — still zero, stated as a fact, with no target.
    await expect(trackMastery(page, 'foundations')).toHaveText(
      'Practiced 0 · Mastered 0',
    );
  });

  test('one "I had it" earns NO stage on its own — Learned is the mark, and only the mark', async ({
    page,
  }) => {
    // Learned is the "Mark as complete" click and nothing else (the loop table
    // in `docs/m8-gamification.md`). A reader who graded question 1 of 3 has
    // not said they finished the lesson, so labelling their card would be the
    // product making a claim on their behalf — and because a later grade wins
    // (the reader may always correct themselves), a stage derived from one
    // check could go DOWN, which no stage here may ever do. Retrieval has its
    // own rung: Practiced, which needs the whole set.
    await page.goto(`/learn/${LESSON}`);
    await gradeQuestion(page, 0, 'had');

    // The grade IS recorded — it just earns no stage yet.
    expect((await readRecord(page, LESSON))?.checks[0]).toBe(1);
    await expect(headerPips(page)).not.toHaveAttribute('data-stage');
    await expect(headerStage(page)).toBeHidden();
    // …and nothing wrote the completion key on the reader's behalf.
    expect(await readKey(page, completeKey(LESSON))).toBeNull();
  });

  test('grading every question "I had it" earns Practiced — pips, label and the /learn counts', async ({
    page,
  }) => {
    await page.goto(`/learn/${LESSON}`);
    const total = await questionCount(page);
    expect(total, 'the lesson must ship Practice questions').toBeGreaterThan(0);

    const graded = await gradeAll(page, 'had');
    expect(graded).toBe(total);

    await expect(headerPips(page)).toHaveAttribute('data-stage', 'practiced');
    await expect(headerLabel(page)).toHaveText('Practiced on this device');
    // The tally counts questions ANSWERED, not clicks and not passes, and says
    // where it lives. (The pass count is what moves the stage; it is deliberately
    // never rendered as a score.)
    await expect(page.locator('[data-practice-tally]').first()).toHaveText(
      `${total} of ${total} answered`,
    );
    await expect(page.locator('[data-practice-saved]').first()).toContainText(
      'Saved on this device only.',
    );

    // Exactly the record the design specifies: a timestamp, not a boolean, and
    // no `masteredAt` — the gate has not opened.
    const record = await readRecord(page, LESSON);
    expect(record?.practicedAt).toEqual(expect.any(String));
    expect(record?.masteredAt).toBeNull();
    expect(record?.checks).toEqual(Array.from({ length: total }, () => 1));

    await page.goto(LEARN);
    await expect(cardPips(page, LESSON)).toHaveAttribute(
      'data-stage',
      'practiced',
    );
    await expect(cardLabel(page, LESSON)).toHaveText('Practiced');
    await expect(trackMastery(page, 'foundations')).toHaveText(
      'Practiced 1 · Mastered 0',
    );
  });

  test('a partial pass is not a pass — two of three leaves Learned', async ({
    page,
  }) => {
    await page.goto(`/learn/${LESSON}`);
    // Marked complete first, so the lesson is genuinely at Learned and the
    // question under test is whether a PARTIAL set of grades promotes it.
    await page.locator('[data-mark-complete]').click();
    const total = await questionCount(page);
    for (let i = 0; i < total - 1; i += 1) await gradeQuestion(page, i, 'had');

    await expect(headerPips(page)).toHaveAttribute('data-stage', 'learned');
    expect((await readRecord(page, LESSON))?.practicedAt).toBeNull();
    await expect(page.locator('[data-practice-tally]').first()).toHaveText(
      `${total - 1} of ${total} answered`,
    );
  });
});

test.describe('the 3-day gate — Mastered cannot be ground out in one sitting', () => {
  test('re-meeting the bar in the SAME visit does not promote', async ({
    page,
  }) => {
    await page.goto(`/learn/${LESSON}`);
    await gradeAll(page, 'had');
    await expect(headerPips(page)).toHaveAttribute('data-stage', 'practiced');
    const first = await readRecord(page, LESSON);

    // A genuine re-pass, not a repeated click: question 1 is regraded down and
    // back up, so the component's in-memory "passed this visit" set is emptied
    // and refilled — exactly the path that DOES promote once the gate is open.
    await gradeQuestion(page, 0, 'not');
    await gradeQuestion(page, 0, 'had');

    await expect(headerPips(page)).toHaveAttribute('data-stage', 'practiced');
    // Nothing was written at all: coming back early costs the reader nothing.
    expect(await readRecord(page, LESSON)).toEqual(first);
    expect((await readRecord(page, LESSON))?.masteredAt).toBeNull();
  });

  test('a re-pass more than three days later earns Mastered', async ({
    page,
  }) => {
    // The clock is faked where the gate actually reads it — the stored
    // `practicedAt`. Seeded with an init script because this test never leaves
    // the lesson page, so the re-seed on navigation cannot overwrite the
    // promotion it is about to assert.
    await seedMastery(page, LESSON, {
      practicedAt: daysAgo(4),
      masteredAt: null,
      checks: [1, 1, 1],
    });
    await page.goto(`/learn/${LESSON}`);

    // The reader arrives already Practiced, and the questions remember their
    // grades — the record is the source of truth for what is on screen.
    await expect(headerPips(page)).toHaveAttribute('data-stage', 'practiced');
    await expect(
      page.locator('[data-practice-grade="had"]').first(),
    ).toHaveAttribute('aria-pressed', 'true');

    await gradeAll(page, 'had');

    await expect(headerPips(page)).toHaveAttribute('data-stage', 'mastered');
    await expect(headerLabel(page)).toHaveText('Mastered on this device');
    const record = await readRecord(page, LESSON);
    expect(record?.masteredAt).toEqual(expect.any(String));
    // The first pass keeps its own date: nothing here rewrites history.
    expect(record?.practicedAt).not.toBe(record?.masteredAt);
  });

  test('a re-pass one day later does not promote, and costs nothing', async ({
    page,
  }) => {
    const practicedAt = daysAgo(1);
    await seedMastery(page, LESSON, {
      practicedAt,
      masteredAt: null,
      checks: [1, 1, 1],
    });
    await page.goto(`/learn/${LESSON}`);
    await gradeAll(page, 'had');

    await expect(headerPips(page)).toHaveAttribute('data-stage', 'practiced');
    const record = await readRecord(page, LESSON);
    expect(record?.masteredAt).toBeNull();
    // Not demoted, not reset, not "restarted": the early return visit is a
    // no-op, which is what "never punish absence — or eagerness" looks like.
    expect(record?.practicedAt).toBe(practicedAt);
  });

  test('the promotion reaches /learn — pips and the Mastered count', async ({
    page,
  }) => {
    // Written once, with no init script: an init script re-runs on EVERY
    // navigation and would restore `masteredAt: null` on the way to /learn,
    // silently un-doing the very promotion this test navigates to check.
    await page.goto(`/learn/${LESSON}`);
    await writeStorage(page, {
      [masteryKey(LESSON)]: JSON.stringify({
        practicedAt: daysAgo(5),
        masteredAt: null,
        checks: [1, 1, 1],
      }),
    });
    await page.reload();
    await gradeAll(page, 'had');
    await expect(headerPips(page)).toHaveAttribute('data-stage', 'mastered');

    await page.goto(LEARN);
    await expect(cardPips(page, LESSON)).toHaveAttribute(
      'data-stage',
      'mastered',
    );
    await expect(cardLabel(page, LESSON)).toHaveText('Mastered');
    // Counts are CUMULATIVE: promoting a lesson must never make the Practiced
    // number fall, which would read as a demotion in a system that has none.
    await expect(trackMastery(page, 'foundations')).toHaveText(
      'Practiced 1 · Mastered 1',
    );
  });

  test('hammering ONE question can never pass the bar', async ({ page }) => {
    // The re-pass counter is per QUESTION, in memory, for this visit. If it
    // counted clicks instead, five taps on question 1 would mint Mastered.
    await seedMastery(page, LESSON, {
      practicedAt: daysAgo(5),
      masteredAt: null,
      checks: [1, 1, 1],
    });
    await page.goto(`/learn/${LESSON}`);
    for (let i = 0; i < 5; i += 1) await gradeQuestion(page, 0, 'had');

    await expect(headerPips(page)).toHaveAttribute('data-stage', 'practiced');
    expect((await readRecord(page, LESSON))?.masteredAt).toBeNull();

    // Completing the actual re-pass then works, so the guard is a bar and not
    // a lockout.
    await gradeAll(page, 'had');
    await expect(headerPips(page)).toHaveAttribute('data-stage', 'mastered');
  });

  test('a re-pass with one "Not yet" in it does not promote', async ({
    page,
  }) => {
    await seedMastery(page, LESSON, {
      practicedAt: daysAgo(5),
      masteredAt: null,
      checks: [1, 1, 1],
    });
    await page.goto(`/learn/${LESSON}`);
    const total = await questionCount(page);
    await gradeQuestion(page, 0, 'had');
    await gradeQuestion(page, 1, 'not');
    for (let i = 2; i < total; i += 1) await gradeQuestion(page, i, 'had');

    // Honest self-report respected: the reader said they did not have one of
    // them, so the bar was not met, so nothing was earned — and nothing lost.
    await expect(headerPips(page)).toHaveAttribute('data-stage', 'practiced');
    expect((await readRecord(page, LESSON))?.masteredAt).toBeNull();

    await gradeQuestion(page, 1, 'had');
    await expect(headerPips(page)).toHaveAttribute('data-stage', 'mastered');
  });
});

test.describe('nothing decays, nothing demotes', () => {
  test('a Practiced lesson keeps its stage across a reload and a bfcache Back', async ({
    page,
  }) => {
    await page.goto(`/learn/${LESSON}`);
    await gradeAll(page, 'had');
    await expect(headerPips(page)).toHaveAttribute('data-stage', 'practiced');

    await page.reload();
    await expect(headerPips(page)).toHaveAttribute('data-stage', 'practiced');

    // A back/forward-cache restore replays no script: without the `pageshow`
    // hook the reader meets the DOM exactly as they left it.
    await page.goto(LEARN);
    await page.goBack();
    await expect(headerPips(page)).toHaveAttribute('data-stage', 'practiced');
    await expect(page.locator('[data-practice-tally]').first()).toHaveText(
      /answered$/,
    );
    // …and silently: nobody just acted, so nothing is announced.
    await expect(page.locator('[data-practice-status]')).toHaveText('');
  });

  test('un-marking completion never takes an EARNED stage away', async ({
    page,
  }) => {
    await page.goto(`/learn/${LESSON}`);
    await page.locator('[data-mark-complete]').click();
    await gradeAll(page, 'had');
    await expect(headerPips(page)).toHaveAttribute('data-stage', 'practiced');

    await page.locator('[data-mark-complete]').click();
    await expect(page.locator('[data-mark-complete]')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    // Retrieval happened; the self-report that it did is not undone by
    // un-ticking a self-reported checkbox.
    await expect(headerPips(page)).toHaveAttribute('data-stage', 'practiced');
    expect((await readRecord(page, LESSON))?.practicedAt).toEqual(
      expect.any(String),
    );
  });

  test('un-marking completion DOES retire a stage that was only Learned', async ({
    page,
  }) => {
    await page.goto(`/learn/${LESSON}`);
    await page.locator('[data-mark-complete]').click();
    await expect(headerPips(page)).toHaveAttribute('data-stage', 'learned');

    await page.locator('[data-mark-complete]').click();
    // Back to "nothing recorded", exactly as it renders with JS off — no empty
    // pip row left behind, and no copy about what was lost.
    await expect(headerPips(page)).not.toHaveAttribute('data-stage');
    await expect(headerStage(page)).toBeHidden();
    await expect(headerLabel(page)).toHaveText('');
  });
});

test.describe('the surfaces agree with each other', () => {
  test('the ring, the count line and the cards come from ONE read', async ({
    page,
  }) => {
    const foundations = await trackLessons(page, 'foundations');
    expect(foundations.length).toBeGreaterThan(2);
    const [first, second] = foundations as [
      (typeof foundations)[0],
      (typeof foundations)[0],
    ];

    await writeStorage(page, {
      [completeKey(first.slug)]: '1',
      [completeKey(second.slug)]: '1',
      [masteryKey(second.slug)]: JSON.stringify({
        practicedAt: daysAgo(9),
        masteredAt: daysAgo(2),
        checks: [1, 1, 1],
      }),
    });
    await page.reload();

    const total = foundations.length;
    await expect(trackCount(page, 'foundations')).toHaveText(
      `2 of ${total} done on this device`,
    );
    await expect(trackMastery(page, 'foundations')).toHaveText(
      'Practiced 1 · Mastered 1',
    );
    await expect(cardPips(page, first.slug)).toHaveAttribute(
      'data-stage',
      'learned',
    );
    await expect(cardPips(page, second.slug)).toHaveAttribute(
      'data-stage',
      'mastered',
    );

    // The ring is the MACRO RENDERING OF THE MASTERY STATES — the design's own
    // words for it ("The track ring is their macro rendering") — so it draws the
    // pips filled across the track, three per lesson: this track holds one
    // Learned (1) and one Mastered (3), so 4 of 27. Geometry is unit-tested;
    // what a browser adds is that the value actually reached the attribute.
    const ring = page.locator(
      '[data-track-progress="foundations"] [data-track-ring]',
    );
    const circumference = Number(await ring.getAttribute('stroke-dasharray'));
    const offset = Number(await ring.getAttribute('stroke-dashoffset'));
    expect(circumference).toBeGreaterThan(0);
    expect(offset).toBeCloseTo(circumference * (1 - 4 / (total * 3)), 1);
    // …and specifically NOT the completion count. Driven by `done` the ring is
    // the self-reported number drawn alone — the one number in this system that
    // is nobody's evidence of anything — and it would sit at zero for a reader
    // who had genuinely practised without ticking a box.
    expect(offset).not.toBeCloseTo(circumference * (1 - 2 / total), 1);

    // The other track is counted against ITS OWN total and is untouched.
    await expect(trackCount(page, 'algorithms')).toHaveText(
      /^0 of \d+ done on this device$/,
    );
    await expect(trackMastery(page, 'algorithms')).toHaveText(
      'Practiced 0 · Mastered 0',
    );
  });

  test('a practised reader who ticked no box still sees the ring move', async ({
    page,
  }) => {
    // The case that decides what the ring is FOR. This reader retrieved, twice
    // over, and never pressed "Mark as complete" — the only act with no learning
    // precondition. A ring driven by completion marks would show them an empty
    // circle, which is the product ranking the self-report it invites above the
    // retrieval it exists to cause.
    const foundations = await trackLessons(page, 'foundations');
    const slug = foundations[0]!.slug;
    await writeStorage(page, {
      [masteryKey(slug)]: JSON.stringify({
        practicedAt: daysAgo(20),
        masteredAt: daysAgo(3),
        checks: [1, 1, 1],
      }),
    });
    await page.reload();

    await expect(trackCount(page, 'foundations')).toHaveText(
      /^0 of \d+ done on this device$/,
    );
    await expect(trackMastery(page, 'foundations')).toHaveText(
      'Practiced 1 · Mastered 1',
    );

    const ring = page.locator(
      '[data-track-progress="foundations"] [data-track-ring]',
    );
    const circumference = Number(await ring.getAttribute('stroke-dasharray'));
    const offset = Number(await ring.getAttribute('stroke-dashoffset'));
    expect(circumference).toBeGreaterThan(0);
    expect(offset, 'an earned ring may not read as empty').toBeLessThan(
      circumference,
    );
    expect(offset).toBeGreaterThan(0);
  });

  test('every lesson keeps its own record — a stage never leaks to a sibling', async ({
    page,
  }) => {
    const lessons = await curriculum(page);
    const [target, neighbour] = lessons as [
      (typeof lessons)[0],
      (typeof lessons)[0],
    ];

    await page.goto(`/learn/${target.slug}`);
    await gradeAll(page, 'had');
    await expect(headerPips(page)).toHaveAttribute('data-stage', 'practiced');

    await page.goto(`/learn/${neighbour.slug}`);
    await expect(headerStage(page)).toBeHidden();
    expect(await readRecord(page, neighbour.slug)).toBeNull();

    await page.goto(LEARN);
    await expect(cardPips(page, target.slug)).toHaveAttribute(
      'data-stage',
      'practiced',
    );
    await expect(cardPips(page, neighbour.slug)).toBeHidden();
    await expect(page.locator('[data-mastery-pips][data-stage]')).toHaveCount(
      1,
    );
  });
});

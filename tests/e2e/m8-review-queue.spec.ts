/**
 * M8.2 — the ready-to-review queue (`docs/m8-gamification.md` → "Ready-to-review
 * queue"; spec §8's strip under `/learn`'s page head).
 *
 * THIS IS THE ONLY SURFACE IN THE PRODUCT THAT EVER PROMPTS THE READER. Every
 * other progress display is passive, which is why this file is as much about
 * what the strip must NOT do as about what it shows: at most two cards, no
 * lateness, no countdown, no guilt, and — the rule with the sharpest edge —
 * **zero DOM when nothing is due**, not a hidden container and not an "all
 * caught up" badge.
 *
 * The schedule arithmetic (the [3, 10, 30] intervals, the clamp that keeps a
 * thrice-reviewed lesson reviewable, the two-card cap, the empty case) is pure
 * and lives in `tests/unit/progress.test.ts`. What only a browser can answer is
 * whether the RENDERED page obeys those answers — including after a reset, a
 * bfcache restore, with the store throwing, and with no JS at all.
 *
 * Clock note: nothing here mocks `Date`. The gate is elapsed time against a
 * STORED timestamp, so the timestamps are what the tests move (`daysAgo`) —
 * mocking the clock would test a fake schedule.
 */
import { expect, test, type Page } from '@playwright/test';
import { openCustomInput } from './utils/disclosure';
import {
  blockStorage,
  cardPips,
  completeKey,
  curriculum,
  daysAgo,
  masteryKey,
  readRecord,
  seedStorage,
  trackArc,
  trackCount,
  trackIntervals,
  trackPageErrors,
  watchRewrites,
  writeStorage,
  type MasteryRecord,
} from './utils/mastery';
import {
  activityChip,
  answer,
  counter,
  hydrateViz,
  predictToggle,
  runCustomInput,
  storageFingerprint,
} from './utils/predict';

const LEARN = '/learn';
const STRIP = '[data-review-strip]';

/**
 * Loss-framing vocabulary, applied whole to the strip's own copy.
 *
 * Every word is a mechanic the design killed on the evidence: a lesson that has
 * waited a year must be offered in exactly the words one that waited a week is,
 * because felt obligation is what turns a spacing prompt into a chore, and a
 * chore is a quit moment.
 */
const BANNED_IN_STRIP =
  /\b(overdue|missed|behind|late|lapsed|expired|forgot(ten)?|due|urgent|streak|xp|points?|score|don't lose|keep it up|last chance)\b/i;

/** Counts of lateness in any phrasing — the design bans the number itself. */
const LATENESS =
  /\b(\d+\s*(days?|weeks?|months?|years?)\s*(ago|late|overdue|behind|since)|(since|for)\s+\d+\s*(days?|weeks?|months?))\b/i;

/** A ticking invitation is an attention trap; only static explanation is allowed. */
const COUNTDOWN =
  /\b(days? left|hours? left|ready in|in \d+ days?|come back in|expires?|remaining)\b/i;

/** A practised record `days` in the past, with nothing reviewed since. */
function practised(days: number): string {
  return JSON.stringify({
    practicedAt: daysAgo(days),
    masteredAt: null,
    checks: [],
  } satisfies MasteryRecord);
}

/** The rendered text of every review card, whitespace-collapsed. */
async function cardText(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-review-card]')].map((card) =>
      (card.textContent ?? '').replace(/\s+/g, ' ').trim(),
    ),
  );
}

/**
 * Asserts the strip contributed NOTHING to the page — no nodes, no words.
 *
 * Deliberately stronger than "is it hidden": a hidden container still tells a
 * screen-reader user's element list that a queue exists, and the design's rule
 * is that a reader with nothing due never meets an empty state at all. So the
 * check is on the DOM (no strip element, no descendant of one, nothing bearing
 * its class) and on the rendered words.
 */
async function expectZeroStripDom(page: Page): Promise<void> {
  await expect(page.locator(STRIP)).toHaveCount(0);
  await expect(page.locator(`${STRIP} *`)).toHaveCount(0);
  await expect(page.locator('[data-review-card]')).toHaveCount(0);
  await expect(page.locator('[class*="review-strip"]')).toHaveCount(0);
  // Not even an emptied shell left behind the page head, which is where the
  // island inserts it.
  expect(
    await page.evaluate(() => {
      const host = document.querySelector('[data-lessons]');
      const next = host?.nextElementSibling;
      return next ? next.className : '';
    }),
  ).not.toContain('review-strip');
  const text = await page.locator('body').innerText();
  expect(text).not.toContain('Ready to review');
  expect(text).not.toContain('quick check');
}

/**
 * Proves the /learn progress island RAN on this page.
 *
 * Without it, every "the strip is absent" assertion above would also pass on a
 * page whose scripts died before they could build one — the difference between
 * "nothing was due" and "nothing works".
 */
async function expectIslandAlive(page: Page): Promise<void> {
  await expect(trackArc(page, 'foundations')).toBeVisible();
  await expect(trackCount(page, 'foundations')).toHaveText(
    /^\d+ of \d+ done on this device$/,
  );
}

test.describe('empty means zero DOM, not an empty state', () => {
  test('a device with nothing recorded is never prompted', async ({ page }) => {
    await page.goto(LEARN);
    await expectIslandAlive(page);
    await expectZeroStripDom(page);
  });

  test('a device that only READ lessons is never prompted either', async ({
    page,
  }) => {
    // Completion is self-reported with no learning precondition, so it schedules
    // nothing: the strip is structurally invisible until a first `practicedAt`
    // exists, which is what makes week one pure learning.
    const lessons = await curriculum(page);
    const marks: Record<string, string> = {};
    for (const lesson of lessons.slice(0, 4))
      marks[completeKey(lesson.slug)] = '1';
    await seedStorage(page, marks);
    await page.goto(LEARN);

    await expectIslandAlive(page);
    await expectZeroStripDom(page);
  });

  test('a lesson practised yesterday is not offered yet', async ({ page }) => {
    // The first gap is three days. Coming back sooner costs nothing and earns
    // nothing — and, crucially, is not nagged about.
    const lessons = await curriculum(page);
    await seedStorage(page, {
      [masteryKey(lessons[0]!.slug)]: practised(1),
    });
    await page.goto(LEARN);

    await expectIslandAlive(page);
    await expectZeroStripDom(page);
  });
});

test.describe('at most two cards, the longest-waiting first', () => {
  test('four due lessons yield exactly two invitations', async ({ page }) => {
    const lessons = await curriculum(page);
    const [a, b, c, d] = lessons;
    await seedStorage(page, {
      [masteryKey(a!.slug)]: practised(5),
      [masteryKey(b!.slug)]: practised(40),
      [masteryKey(c!.slug)]: practised(12),
      [masteryKey(d!.slug)]: practised(4),
    });
    await page.goto(LEARN);

    // The cap is a DESIGN rule, not a layout one: a 15-item list of things "to
    // do" is a chore, and a chore is what kills the motivation this phase is
    // built around.
    await expect(page.locator('[data-review-card]')).toHaveCount(2);
    // Ready longest first, so a lesson can never be starved by newer ones.
    await expect(page.locator('[data-review-card]').first()).toHaveAttribute(
      'data-review-card',
      b!.slug,
    );
    await expect(page.locator('[data-review-card]').nth(1)).toHaveAttribute(
      'data-review-card',
      c!.slug,
    );
  });

  test('a lesson reviewed three times still comes back around', async ({
    page,
  }) => {
    // The clamp the design calls load-bearing: an unclamped lookup past the end
    // of [3, 10, 30] returns `undefined`, every comparison against it is false,
    // and the lesson silently never becomes reviewable again — the one failure a
    // queue nobody can see would never report.
    const lessons = await curriculum(page);
    const slug = lessons[0]!.slug;
    await seedStorage(page, {
      [masteryKey(slug)]: JSON.stringify({
        practicedAt: daysAgo(200),
        masteredAt: daysAgo(190),
        intervalIndex: 3,
        lastReviewAt: daysAgo(31),
        checks: [1, 1, 1],
      }),
    });
    await page.goto(LEARN);

    await expect(page.locator(`[data-review-card="${slug}"]`)).toBeVisible();
  });

  test('the strip is a landmark, and each card is an ordinary link', async ({
    page,
  }) => {
    const lessons = await curriculum(page);
    const lesson = lessons[0]!;
    await seedStorage(page, { [masteryKey(lesson.slug)]: practised(9) });
    await page.goto(LEARN);

    // A real <section> named by a real <h2>, at the same level as the track
    // sections it precedes, so a screen-reader user can skip past it.
    const strip = page.locator(STRIP);
    const headingId = await strip.getAttribute('aria-labelledby');
    expect(headingId).toBeTruthy();
    await expect(page.locator(`#${headingId}`)).toHaveText('Ready to review');
    expect(await strip.evaluate((el) => el.tagName)).toBe('SECTION');
    await expect(page.locator(`#${headingId}`)).toHaveJSProperty(
      'tagName',
      'H2',
    );
    // Nothing shouts: no alert role, no live region, no announcement. It is
    // quiet furniture that happens to be clickable.
    await expect(strip).not.toHaveAttribute('role', 'alert');
    await expect(strip.locator('[aria-live]')).toHaveCount(0);

    const card = page.locator(`[data-review-card="${lesson.slug}"]`);
    await expect(card).toHaveJSProperty('tagName', 'A');
    await expect(card).toHaveAttribute(
      'href',
      `/learn/${lesson.slug}?review=1#practice`,
    );
    // Its visible text IS its accessible name — an aria-label here would
    // replace the title and the size of the ask with a shorter, poorer string.
    await expect(card).not.toHaveAttribute('aria-label', /.*/);
    await expect(card).toHaveAccessibleName(
      new RegExp(`${lesson.title}.*quick check`, 's'),
    );
    // The arrow is decoration; the size of the ask is honest and finite.
    await expect(card.locator('[aria-hidden="true"]')).toHaveCount(1);
    await expect(card).toContainText('quick check (~2 min)');
    // The whole strip states where the record lives, like every persistent
    // surface in this product.
    await expect(strip).toContainText('saved on this device only');
  });
});

test.describe('the words never punish absence', () => {
  test('a year away is offered in exactly the same words as a week', async ({
    page,
  }) => {
    const lessons = await curriculum(page);
    const [old, recent] = [lessons[0]!, lessons[1]!];
    await seedStorage(page, {
      [masteryKey(old.slug)]: practised(400),
      [masteryKey(recent.slug)]: practised(4),
    });
    await page.goto(LEARN);

    const texts = await cardText(page);
    expect(texts).toHaveLength(2);
    // Identical but for the lesson title: no lateness, no escalation, no badge
    // on the one that waited longer.
    expect(texts[0]!.replace(old.title, '')).toBe(
      texts[1]!.replace(recent.title, ''),
    );

    const strip = (await page.locator(STRIP).innerText()).replace(/\s+/g, ' ');
    expect(strip, `banned vocabulary in "${strip}"`).not.toMatch(
      BANNED_IN_STRIP,
    );
    expect(strip, `lateness in "${strip}"`).not.toMatch(LATENESS);
    expect(strip, `countdown in "${strip}"`).not.toMatch(COUNTDOWN);
    expect(strip, `percentage in "${strip}"`).not.toMatch(/%/);
    // No number at all beyond the "~2 min" estimate: not a day count, not a
    // queue length, not an index.
    expect(strip.replace(/~2 min/g, '')).not.toMatch(/\d/);
  });

  test('the whole page stays free of guilt while the strip is up', async ({
    page,
  }) => {
    const lessons = await curriculum(page);
    await seedStorage(page, {
      [masteryKey(lessons[0]!.slug)]: practised(60),
      [masteryKey(lessons[1]!.slug)]: practised(60),
      [masteryKey(lessons[2]!.slug)]: practised(60),
    });
    await page.goto(LEARN);
    await expect(page.locator('[data-review-card]')).toHaveCount(2);

    // The state where a "you're falling behind, 3 lessons need you" line would
    // have somewhere to live — including the third due lesson the cap hides,
    // which must not be counted anywhere.
    const text = await page.locator('body').innerText();
    for (const line of text.split('\n')) {
      expect(line, `lateness in "${line}"`).not.toMatch(LATENESS);
      expect(line, `countdown in "${line}"`).not.toMatch(COUNTDOWN);
      expect(line, `guilt in "${line}"`).not.toMatch(
        /(overdue|you missed|don't lose|keep it up|streak|falling behind)/i,
      );
    }
    expect(text).not.toMatch(
      /\b(1|2|3) (lessons? )?(need|waiting|to review)\b/i,
    );
  });

  test('nothing ticks — no repeating timer, and the strip never rewrites itself', async ({
    page,
  }) => {
    const readIntervals = await trackIntervals(page);
    const lessons = await curriculum(page);
    await seedStorage(page, { [masteryKey(lessons[0]!.slug)]: practised(5) });
    await page.goto(LEARN);
    await expect(page.locator(STRIP)).toBeVisible();

    const readRewrites = await watchRewrites(page.locator(STRIP));
    // The wait is the ASSERTION here, not a race (the same reasoning
    // `m8-decisions.spec.ts` records for the gate's static reason line): a
    // ticking line rewrites itself about every second, so a second-and-a-bit of
    // silence can only ever be a false PASS, never a flaky fail.
    await page.waitForTimeout(1_200);
    expect(await readRewrites(), 'the strip must not repaint itself').toBe(0);
    expect(
      await readIntervals(),
      'no repeating timer may be scheduled by the site',
    ).toEqual([]);
  });
});

test.describe('following an invitation', () => {
  test('the card opens the lesson with Predict on, and writes nothing', async ({
    page,
  }) => {
    const slug = 'binary-search';
    await seedStorage(page, { [masteryKey(slug)]: practised(6) });
    await page.goto(LEARN);
    const before = await storageFingerprint(page);

    await page.locator(`[data-review-card="${slug}"]`).click();
    await expect(page).toHaveURL(/\/learn\/binary-search\?review=1#practice$/);

    const viz = await hydrateViz(page.locator('#viz-binary-search'));
    await expect(predictToggle(viz)).toHaveAttribute('aria-pressed', 'true');
    // Arriving in review mode changes nothing on the device: the mode is a
    // property of the visit, which is why a query parameter can carry it.
    expect(await storageFingerprint(page)).toBe(before);
  });

  test('the loop closes: a passed review advances the schedule and clears the card', async ({
    page,
  }) => {
    // The whole mechanic end to end, with no seeded shortcuts past the act
    // itself. `writeStorage` rather than `seedStorage`: an init script would
    // re-write the seeded record on the way BACK to /learn and silently undo
    // the pass this test is about.
    const slug = 'binary-search';
    await page.goto(LEARN);
    await writeStorage(page, { [masteryKey(slug)]: practised(6) });
    await page.reload();

    const card = page.locator(`[data-review-card="${slug}"]`);
    await expect(card).toBeVisible();
    await card.click();

    const viz = await hydrateViz(page.locator('#viz-binary-search'));
    await expect(predictToggle(viz)).toHaveAttribute('aria-pressed', 'true');
    // A run long enough to answer five predictions: the authored example is
    // four steps, so a real reader reaching the bar uses their own input — which
    // since the 2026-08 redesign means opening the "Run it on your own input"
    // disclosure the form sits behind (amendment C-2). One extra click on a real
    // control; the deep-linked review visit is otherwise unchanged, and so is
    // everything this test asserts about it.
    await openCustomInput(viz);
    await runCustomInput(
      viz,
      '[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]',
      '0',
      6,
    );
    await expect(counter(viz)).toHaveText('1 / 6');
    for (const label of [
      'Go left',
      'Go left',
      'Go left',
      'Go left',
      'Not present',
    ]) {
      await answer(viz, label);
    }
    await expect(activityChip(viz)).toHaveText('5 answered · 0 skipped');

    // The pass goes through `recordPass` — the single promotion path — so the
    // 3-day gate stamps Mastered and the schedule moves on to the next interval.
    await expect
      .poll(async () => (await readRecord(page, slug))?.masteredAt ?? null)
      .not.toBeNull();

    await page.goto(LEARN);
    // Reviewed today, so it is not offered again: the invitation was answered,
    // not merely dismissed.
    await expectZeroStripDom(page);
    await expect(cardPips(page, slug)).toHaveAttribute(
      'data-stage',
      'mastered',
    );
  });

  test('failing a review costs nothing — the card simply stays', async ({
    page,
  }) => {
    const slug = 'binary-search';
    await page.goto(LEARN);
    await writeStorage(page, { [masteryKey(slug)]: practised(6) });
    await page.reload();
    await page.locator(`[data-review-card="${slug}"]`).click();

    const viz = await hydrateViz(page.locator('#viz-binary-search'));
    // Three answers, all wrong: under the answer floor AND under the accuracy
    // bar. Nothing is written, so nothing is lost either — no demotion, no
    // shortened interval, no record of the attempt.
    for (const label of ['Not present', 'Not present', 'Not present']) {
      await answer(viz, label);
    }
    await expect(activityChip(viz)).toHaveText('3 answered · 0 skipped');

    const record = await readRecord(page, slug);
    expect(record?.masteredAt ?? null).toBeNull();
    // The schedule did not move: no review was stamped and the interval did not
    // advance, so the invitation is simply still open. Failing costs nothing —
    // including the next gap, which a "halved interval" would have shortened
    // into a nag.
    expect(record?.lastReviewAt ?? null).toBeNull();
    expect(record?.intervalIndex ?? 0).toBe(0);

    await page.goto(LEARN);
    await expect(page.locator(`[data-review-card="${slug}"]`)).toBeVisible();
    // …and the offer is worded exactly as it was the first time.
    const strip = (await page.locator(STRIP).innerText()).replace(/\s+/g, ' ');
    expect(strip).not.toMatch(BANNED_IN_STRIP);
    expect(strip).not.toMatch(/again|retry|second attempt/i);
  });
});

test.describe('the strip keeps up with the device', () => {
  test('a reset takes it away in place', async ({ page }) => {
    const lessons = await curriculum(page);
    const slug = lessons[0]!.slug;
    await page.goto(LEARN);
    await writeStorage(page, { [masteryKey(slug)]: practised(8) });
    await page.reload();
    await expect(page.locator(STRIP)).toBeVisible();

    await page.locator('[data-reset-toggle]').click();
    await page.locator('[data-reset-confirm]').click();
    await expect(page.locator('[data-progress-status]')).toContainText(
      'Progress reset',
    );

    // A strip left standing after a reset would invite the reader to review a
    // lesson the device has just forgotten.
    await expectZeroStripDom(page);
  });

  test('a bfcache Back re-derives it instead of replaying a stale one', async ({
    page,
  }) => {
    const slug = 'binary-search';
    await page.goto(LEARN);
    await writeStorage(page, { [masteryKey(slug)]: practised(7) });
    await page.reload();
    await expect(page.locator(`[data-review-card="${slug}"]`)).toBeVisible();

    await page.locator(`[data-review-card="${slug}"]`).click();
    await expect(page).toHaveURL(/review=1/);
    await page.goBack();
    // A restore replays no script, so without the pageshow hook the strip would
    // be whatever it was when the reader left.
    await expect(page.locator(`[data-review-card="${slug}"]`)).toBeVisible();
    await expect(page.locator('[data-review-card]')).toHaveCount(1);
  });

  test('only /learn ever prompts — the home page and lessons stay passive', async ({
    page,
  }) => {
    const slug = 'binary-search';
    await seedStorage(page, { [masteryKey(slug)]: practised(30) });

    // The home page injects the same `[data-lessons]` list for its own resume
    // link, so "no strip here" is a real risk rather than a hypothetical one.
    for (const path of ['/', `/learn/${slug}`]) {
      await page.goto(path);
      await expect(page.locator(STRIP)).toHaveCount(0);
      await expect(page.locator('[data-review-card]')).toHaveCount(0);
      expect(await page.locator('body').innerText()).not.toContain(
        'Ready to review',
      );
    }
    // …and the strip really does exist on this device, so the absence above is
    // about the page, not about the schedule.
    await page.goto(LEARN);
    await expect(page.locator(`[data-review-card="${slug}"]`)).toBeVisible();
  });
});

test.describe('degraded — no JS, no store', () => {
  test.describe('JavaScript disabled', () => {
    test.use({ javaScriptEnabled: false });

    test('no strip is rendered, not even for a device with reviews waiting', async ({
      page,
    }) => {
      // Storage cannot be seeded without JS, so this asserts the structural
      // fact: the strip only ever exists because the island created one, and
      // the component ships its own `<noscript>` kill-switch besides.
      await page.goto(LEARN);
      await expect(page.locator(STRIP)).toHaveCount(0);
      await expect(page.locator('[class*="review-strip"]')).toHaveCount(0);
      expect(await page.locator('body').innerText()).not.toContain(
        'Ready to review',
      );

      // DISCRIMINATOR: the M7 page underneath is intact and navigable.
      await expect(page.locator('[data-lesson-card]').first()).toBeVisible();
      await expect(page.locator('[data-resume-link]')).toBeVisible();
    });
  });

  test('storage blocked: no strip, no throw, and the page still works', async ({
    page,
  }) => {
    const errors = trackPageErrors(page);

    // CONTROL on the same build: with the store working, this device is offered
    // a review. So "absent" below is a decision about blocked storage.
    await page.goto(LEARN);
    await writeStorage(page, { [masteryKey('binary-search')]: practised(20) });
    await page.reload();
    await expect(page.locator('[data-review-card]')).toHaveCount(1);

    await blockStorage(page);
    await page.reload();

    await expectZeroStripDom(page);
    // DISCRIMINATOR: the index is fully usable, so the island degraded rather
    // than taking the page down with it.
    await expect(page.locator('[data-lesson-card]').first()).toBeVisible();
    await expect(page.locator('[data-resume-link]')).toBeVisible();
    expect(errors, 'no script may throw when storage is blocked').toEqual([]);
  });

  test('a corrupt record schedules nothing rather than guessing', async ({
    page,
  }) => {
    const errors = trackPageErrors(page);
    await seedStorage(page, {
      [masteryKey('binary-search')]: '{"practicedAt":',
      [masteryKey('arrays')]: JSON.stringify({
        practicedAt: 'last Tuesday',
        masteredAt: null,
        checks: [],
      }),
    });
    await page.goto(LEARN);

    await expectIslandAlive(page);
    await expectZeroStripDom(page);
    expect(errors).toEqual([]);
  });
});

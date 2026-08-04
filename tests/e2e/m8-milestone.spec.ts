/**
 * M8.1 — the Quiet Milestone (`docs/m8-gamification.md`: "the system's **only**
 * celebration"; spec §9 `MarkComplete`).
 *
 * One line of text, and that is the entire celebration: no modal, no confetti,
 * no sound, no share button — all of which are on the killed list and none of
 * which may come back through this door. It appears only on the click that takes
 * a whole track from N-1 to N of N, it states its own honest scope ("on this
 * device"), it is announced politely, and it retires itself the moment its claim
 * stops being true, with no copy about what was lost.
 *
 * It adds NO storage key (spec §6 enumerates the two this phase may write), so
 * every assertion below is about a line DERIVED on each paint. That is also why
 * the negative tests matter more than the positive one: a milestone that fires
 * on a click which completed nothing, or that replays on every later visit, is
 * exactly the "15 identical fanfares" the design refuses.
 *
 * NOTHING GATES ON LEARNED ALONE — the binding rule this file exists to hold
 * (`docs/m8-gamification.md`: "nothing (reviews, milestones) gates on Learned
 * alone", because "Mark as complete" is an unverified self-report with no
 * learning precondition). A celebration raised by fifteen ticked checkboxes
 * congratulates the reader for ticking checkboxes, which is the one thing the
 * design says a mechanic may never do. So every test below that EXPECTS a line
 * seeds the retrieval half as well, and the pair in "when it must NOT fire"
 * isolates the rule: same clicks, same completed track, retrieval records the
 * only difference.
 *
 * The retrieval condition is seeded as a Practiced record per lesson — the one
 * currency, and the state every retrieval path in the design converges on. A
 * milestone gated more loosely (any one lesson practiced, or only the lesson
 * being clicked) still passes these tests; one gated on marks alone cannot.
 */
import { expect, test, type Page } from '@playwright/test';
import { computed, tokenStyle } from './utils/color';
import {
  curriculum,
  seedComplete,
  seedPracticed,
  trackLessons,
} from './utils/mastery';

/** The milestone line — always in the DOM, empty until a click earns it. */
function milestone(page: Page) {
  return page.locator('[data-milestone]');
}

/**
 * Everything the reader would have done except the final click: every lesson in
 * `lessons` but the last marked complete, and every one of them practiced.
 *
 * @param page - The page to seed (before navigating to the lesson).
 * @param lessons - The track (or the whole curriculum), in order.
 * @returns The lesson left incomplete — the one the click under test belongs to.
 */
async function readyToFinish<T extends { slug: string }>(
  page: Page,
  lessons: T[],
): Promise<T> {
  const slugs = lessons.map((lesson) => lesson.slug);
  await seedComplete(page, slugs.slice(0, -1));
  await seedPracticed(page, slugs);
  return lessons[lessons.length - 1]!;
}

test.describe('when it fires', () => {
  test('a click that completes a TRACK earns one line, scoped to this device', async ({
    page,
  }) => {
    const foundations = await trackLessons(page, 'foundations');
    // Every lesson but this one complete, and the retrieval half done: the click
    // under test is the one that takes the track from N-1 to N, which is the
    // only click that may celebrate — and only because the track was learned,
    // not merely ticked.
    const last = await readyToFinish(page, foundations);
    await page.goto(`/learn/${last.slug}`);

    // Ships EMPTY: a live region has to be in the accessibility tree BEFORE its
    // first population for the announcement to fire reliably.
    await expect(milestone(page)).toHaveText('');
    await expect(milestone(page)).toHaveAttribute('role', 'status');
    // `role="status"` is politeness by definition; an explicit `assertive`
    // would interrupt a reader mid-sentence for a line that can wait.
    await expect(milestone(page)).not.toHaveAttribute('aria-live', /.*/);

    await page.locator('[data-mark-complete]').click();

    // The claim names the track, the count the BUILD shipped, and where the
    // record lives — a persistent surface owes all three. Asserted part by part
    // rather than as one frozen sentence: the parts are the promise, the
    // wording around them is the copywriter's.
    await expect(milestone(page)).toContainText('Foundations');
    await expect(milestone(page)).toContainText(
      `${foundations.length} lessons`,
    );
    await expect(milestone(page)).toContainText('on this device');
    // One line, not a panel: no dialog, no image, no extra buttons arrive with
    // it (confetti, sounds and share buttons are on the killed list).
    await expect(page.locator('[data-mark-complete-group] button')).toHaveCount(
      1,
    );
    await expect(page.locator('[data-mark-complete-group] img')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('finishing the curriculum replaces it with the course line — never both', async ({
    page,
  }) => {
    const lessons = await curriculum(page);
    const last = await readyToFinish(page, lessons);
    await page.goto(`/learn/${last.slug}`);
    await page.locator('[data-mark-complete]').click();

    // This click finishes a track AND the course; the design allows exactly one
    // line, and the bigger claim is the true one.
    await expect(milestone(page)).toContainText('Course complete');
    await expect(milestone(page)).toContainText(`${lessons.length} lessons`);
    await expect(milestone(page)).toContainText('on this device');
    await expect(milestone(page)).not.toContainText('Algorithms complete');
  });

  test('the check draws itself in on a token duration, so reduced motion collapses it', async ({
    page,
  }) => {
    const foundations = await trackLessons(page, 'foundations');
    const last = await readyToFinish(page, foundations);
    await page.goto(`/learn/${last.slug}`);
    await page.locator('[data-mark-complete]').click();
    await expect(milestone(page)).not.toHaveText('');

    const check = page.locator('.mark-complete__check');
    await expect(check).toHaveClass(/mark-complete__check/);
    expect(await computed(check, 'animationName')).toBe('mark-complete-draw');
    // The token collapse at `tokens.css` is this site's ENTIRE reduced-motion
    // strategy — there is no blanket `animation-duration` override anywhere —
    // so a hardcoded `200ms` here would keep animating for a reader who asked
    // it not to. Comparing against the resolved token in BOTH media states is
    // what tells the two apart: a literal cannot follow the token into the
    // reduced-motion value.
    expect(await computed(check, 'animationDuration')).toBe(
      await tokenStyle(page, 'animation-duration', '--duration-base'),
    );

    await page.emulateMedia({ reducedMotion: 'reduce' });
    const reduced = await tokenStyle(
      page,
      'animation-duration',
      '--duration-base',
    );
    expect(parseFloat(reduced)).toBeLessThan(0.01);
    expect(await computed(check, 'animationDuration')).toBe(reduced);
  });
});

test.describe('when it must NOT fire', () => {
  test('ticking every box with no retrieval anywhere earns no celebration', async ({
    page,
  }) => {
    // THE RULE, in its plainest form: a reader who marked all nine Foundations
    // lessons complete and never answered a single practice question has made
    // nine unverified self-reports. "Mark as complete" has no learning
    // precondition, so a line congratulating them would be the product claiming
    // something it has no evidence for — and would teach the reader that ticking
    // boxes is what the site rewards.
    const foundations = await trackLessons(page, 'foundations');
    const last = foundations[foundations.length - 1]!;
    await seedComplete(
      page,
      foundations.slice(0, -1).map((lesson) => lesson.slug),
    );
    // No `progress:v1:*` record for ANY lesson — nothing was ever retrieved.
    await page.goto(`/learn/${last.slug}`);

    const button = page.locator('[data-mark-complete]');
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    // The ordinary saved-note appears — proof the click was processed and the
    // track really is complete on this device, so the empty milestone below is
    // a decision and not a dead island.
    await expect(page.locator('[data-mark-complete-note]')).toBeVisible();

    await expect(milestone(page)).toHaveText('');
    await expect(button).not.toHaveClass(/mark-complete--milestone/);
  });

  test('…and the same clicks DO earn it once the track has been practiced', async ({
    page,
  }) => {
    // The other half of the pair, and the reason the test above cannot be
    // satisfied by simply deleting the milestone: one variable changes — the
    // retrieval records — and the line arrives.
    const foundations = await trackLessons(page, 'foundations');
    const last = await readyToFinish(page, foundations);
    await page.goto(`/learn/${last.slug}`);

    await page.locator('[data-mark-complete]').click();
    await expect(page.locator('[data-mark-complete-note]')).toBeVisible();
    await expect(milestone(page)).toContainText('Foundations');
    await expect(milestone(page)).toContainText('on this device');
  });

  test('a click that completes nothing gets no line and no draw-in', async ({
    page,
  }) => {
    const foundations = await trackLessons(page, 'foundations');
    expect(foundations.length).toBeGreaterThan(3);
    // Two lessons still unfinished after this click, so nothing is complete.
    // The whole track is seeded as practiced, so retrieval is NOT what is
    // missing here — this test isolates the completion half of the rule.
    await seedComplete(
      page,
      foundations.slice(0, -3).map((lesson) => lesson.slug),
    );
    await seedPracticed(
      page,
      foundations.map((lesson) => lesson.slug),
    );
    const target = foundations[foundations.length - 3]!;
    await page.goto(`/learn/${target.slug}`);

    const button = page.locator('[data-mark-complete]');
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    // The ordinary saved-note appears — proof the click was processed, so the
    // empty milestone below is a decision and not a dead island.
    await expect(page.locator('[data-mark-complete-note]')).toBeVisible();

    await expect(milestone(page)).toHaveText('');
    // The one-off draw-in is tied to the line: no line, no animation class.
    await expect(button).not.toHaveClass(/mark-complete--milestone/);
  });

  test('returning to a finished track never replays the celebration', async ({
    page,
  }) => {
    const foundations = await trackLessons(page, 'foundations');
    const slugs = foundations.map((lesson) => lesson.slug);
    // Complete AND practiced: every condition the milestone needs is already
    // met, so the only reason no line appears is that arriving is not earning.
    await seedComplete(page, slugs);
    await seedPracticed(page, slugs);
    await page.goto(`/learn/${foundations[0]!.slug}`);

    // The track is already complete on this device, and the button correctly
    // reads as pressed — but nothing was EARNED by arriving here.
    await expect(page.locator('[data-mark-complete]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(milestone(page)).toHaveText('');
  });

  test('the other track finishing is not this track finishing', async ({
    page,
  }) => {
    const foundations = await trackLessons(page, 'foundations');
    const algorithms = await trackLessons(page, 'algorithms');
    expect(algorithms.length).toBeGreaterThan(1);
    // Every Foundations lesson done and practiced, and an Algorithms lesson
    // marked here: the click completes no track of its own. The Algorithms
    // lesson is practiced too, so retrieval is not the missing piece.
    await seedComplete(
      page,
      foundations.map((lesson) => lesson.slug),
    );
    await seedPracticed(page, [
      ...foundations.map((lesson) => lesson.slug),
      algorithms[0]!.slug,
    ]);
    await page.goto(`/learn/${algorithms[0]!.slug}`);
    await page.locator('[data-mark-complete]').click();

    await expect(page.locator('[data-mark-complete-note]')).toBeVisible();
    await expect(milestone(page)).toHaveText('');
  });
});

test.describe('when it retires', () => {
  test('un-marking takes the line away with nothing said about it', async ({
    page,
  }) => {
    const foundations = await trackLessons(page, 'foundations');
    const last = await readyToFinish(page, foundations);
    await page.goto(`/learn/${last.slug}`);

    const button = page.locator('[data-mark-complete]');
    await button.click();
    await expect(milestone(page)).not.toHaveText('');

    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    // Empty, not "you lost your Foundations completion": changing your mind is
    // not a failure state, and the design bans copy that frames it as one.
    await expect(milestone(page)).toHaveText('');
    await expect(button).not.toHaveClass(/mark-complete--milestone/);
    await expect(page.locator('[data-mark-complete-note]')).toBeHidden();
  });

  test('it is derived, not stored — a reload of a complete track shows no line', async ({
    page,
  }) => {
    const foundations = await trackLessons(page, 'foundations');
    const last = await readyToFinish(page, foundations);
    await page.goto(`/learn/${last.slug}`);
    await page.locator('[data-mark-complete]').click();
    await expect(milestone(page)).not.toHaveText('');

    // No milestone key exists in spec §6, so nothing may survive the reload —
    // and the two keys that DO exist are exactly the two allowed.
    await page.reload();
    await expect(milestone(page)).toHaveText('');
    const keys = await page.evaluate(() => Object.keys(localStorage).sort());
    expect(
      keys.every(
        (key) => key.startsWith('lesson:') || key.startsWith('progress:v1:'),
      ),
      `unexpected storage keys: ${keys.join(', ')}`,
    ).toBe(true);
  });
});

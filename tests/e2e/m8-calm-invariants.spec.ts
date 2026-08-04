/**
 * M8.1 — the calm invariants, as tests (`docs/m8-gamification.md`: "Calm
 * invariants (enforce with tests, not intentions)"), plus the reset control they
 * depend on (spec §6 progress vs preference keys).
 *
 * The design's own reasoning for this file: *maintenance pressure erodes design
 * intentions but not failing tests*. Every rule below was a deliberate decision
 * with an alternative that looks perfectly reasonable in isolation — a "67%
 * complete" ring, a "3 days since your last review" nudge, an XP number beside
 * the pips — so each is pinned here rather than left to review.
 *
 * The harness split is the one the design specifies: the PURE halves live in
 * `tests/unit/mastery-ui.test.ts` (the exported copy constants, the ring
 * geometry), because `vitest.config.ts` has no DOM. What only a browser can
 * answer is what the RENDERED page says once a reader has acted — which is
 * everything here.
 *
 * Scope note on the vocabulary scans: the banned-word list is applied whole to
 * the M8-owned surfaces, and narrowed to unambiguous terms for the whole-page
 * pass. Lesson prose legitimately contains "not yet" ("not yet explored") and
 * "behind" ("the idea behind"), so a blanket page-wide regex would fail on the
 * curriculum rather than on a design violation — a test that cries wolf gets
 * deleted, which is worse than not having it.
 */
import { expect, test, type Page } from '@playwright/test';
import {
  cardPips,
  completeKey,
  curriculum,
  daysAgo,
  gradeAll,
  masteryKey,
  readKey,
  seedStorage,
  trackCount,
  trackLessons,
  trackMastery,
  writeStorage,
} from './utils/mastery';

const LESSON = 'arrays';
const LEARN = '/learn';

/**
 * Loss-framing and second-currency vocabulary, applied to M8-owned copy.
 *
 * Every word here is a mechanic the design killed on the evidence, not a style
 * preference: streaks manufacture a quit moment, XP is a second and less honest
 * currency, and "overdue"/"missed" punish the very absence the spacing effect
 * says is the point.
 */
const BANNED_IN_M8_COPY =
  /\b(overdue|missed|behind|late|expired|lost|streak|xp|points?|levels?|badges?|score|rank|leaderboard|don't lose|keep it up)\b/i;

/**
 * The subset that can never be innocent, applied to a WHOLE rendered page.
 *
 * Deliberately narrow: these read as guilt or as a scoreboard in any context,
 * so a hit anywhere on the page is a real finding rather than lesson prose.
 */
const BANNED_ANYWHERE =
  /(overdue|streak|days behind|don't lose|keep it up|you missed|% correct|accuracy|leaderboard|\bxp\b)/i;

/** Every visible string the M8 surfaces contribute to a lesson page. */
async function masteryCopyOnLesson(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [
      '[data-lesson-stage]',
      '[data-practice-footer]',
      '[data-practice-status]',
      '[data-milestone]',
      '[data-mark-complete-note]',
      '.practice-check__prompt',
    ]
      .flatMap((selector) => [...document.querySelectorAll(selector)])
      .map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim())
      .filter((text) => text.length > 0),
  );
}

/** Every visible string the M8 surfaces contribute to /learn. */
async function masteryCopyOnLearn(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [
      '[data-track-count]',
      '[data-track-mastery]',
      '[data-mastery-label]',
      '[data-progress-status]',
      '[data-reset-warn]',
    ]
      .flatMap((selector) => [...document.querySelectorAll(selector)])
      .map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim())
      .filter((text) => text.length > 0),
  );
}

test.describe('no ratio, no percentage, no second currency', () => {
  test('a fully graded lesson states counts in words and nothing else', async ({
    page,
  }) => {
    await page.goto(`/learn/${LESSON}`);
    await page.locator('[data-mark-complete]').click();
    const total = await gradeAll(page, 'had');

    const copy = await masteryCopyOnLesson(page);
    expect(copy.length).toBeGreaterThan(3);
    for (const line of copy) {
      // No accuracy scoreboard during a learning act: a percentage makes
      // beginners protect a number instead of attempting the hard question,
      // and a wrong-but-attempted answer IS the intervention working.
      expect(line, `percentage in "${line}"`).not.toMatch(/%/);
      expect(line, `ratio in "${line}"`).not.toMatch(/\d\s*\/\s*\d/);
      expect(line, `banned vocabulary in "${line}"`).not.toMatch(
        BANNED_IN_M8_COPY,
      );
      // No countdown anywhere — a ticking "ready in 2 days" is an attention
      // trap; the design permits only a static explanation.
      expect(line, `countdown in "${line}"`).not.toMatch(
        /\b(days? left|hours? left|ready in|in \d+ days?|come back in)\b/i,
      );
    }

    // The one count the reader does see is spelled out, not divided — and it
    // counts questions ANSWERED, which is why an honest "Not yet" moves it.
    await expect(page.locator('[data-practice-tally]').first()).toHaveText(
      `${total} of ${total} answered`,
    );
  });

  test('/learn states both numbers in words, with no ring percentage', async ({
    page,
  }) => {
    const foundations = await trackLessons(page, 'foundations');
    await writeStorage(page, {
      [completeKey(foundations[0]!.slug)]: '1',
      [masteryKey(foundations[0]!.slug)]: JSON.stringify({
        practicedAt: daysAgo(9),
        masteredAt: daysAgo(1),
        checks: [1, 1, 1],
      }),
    });
    await page.reload();

    for (const line of await masteryCopyOnLearn(page)) {
      expect(line, `percentage in "${line}"`).not.toMatch(/%/);
      expect(line, `ratio in "${line}"`).not.toMatch(/\d\s*\/\s*\d/);
      expect(line, `banned vocabulary in "${line}"`).not.toMatch(
        BANNED_IN_M8_COPY,
      );
    }

    // The ring is decoration for the sentence beside it, so it must not carry a
    // value of its own for a screen reader to read out a second time.
    const ring = page.locator('[data-track-progress="foundations"] svg');
    await expect(ring).toHaveAttribute('aria-hidden', 'true');
    await expect(ring).not.toHaveAttribute('role', 'progressbar');
    await expect(ring).not.toHaveAttribute('aria-valuenow', /.*/);
  });

  test('the whole page never uses guilt or scoreboard language', async ({
    page,
  }) => {
    // Both key pages, in the state where the temptation is strongest: progress
    // exists, so a "you're 40% there, don't lose it" line would have somewhere
    // to live.
    const foundations = await trackLessons(page, 'foundations');
    await writeStorage(page, {
      [completeKey(foundations[0]!.slug)]: '1',
      [masteryKey(foundations[0]!.slug)]: JSON.stringify({
        practicedAt: daysAgo(20),
        masteredAt: null,
        checks: [1, 1, 1],
      }),
    });

    for (const path of [LEARN, `/learn/${foundations[0]!.slug}`, '/']) {
      await page.goto(path);
      const text = await page.locator('body').innerText();
      const hits = text
        .split('\n')
        .filter((line) => BANNED_ANYWHERE.test(line));
      expect(hits, `banned vocabulary on ${path}`).toEqual([]);
    }
  });

  test('every persistent surface says where the record lives', async ({
    page,
  }) => {
    // "Privacy is a feature" is only true if the reader is told — and the
    // corollary is that a reader who clears their browser is not surprised.
    await page.goto(`/learn/${LESSON}`);
    await gradeAll(page, 'had');
    await page.locator('[data-mark-complete]').click();

    await expect(page.locator('[data-mastery-label]')).toContainText(
      'on this device',
    );
    await expect(page.locator('[data-practice-saved]').first()).toContainText(
      'Saved on this device only.',
    );
    await expect(page.locator('[data-mark-complete-note]')).toContainText(
      'Saved only in this browser — no account needed.',
    );

    await page.goto(LEARN);
    await expect(trackCount(page, 'foundations')).toContainText(
      'on this device',
    );
  });
});

test.describe('nothing gates on Learned', () => {
  test('the self-reported count is never displayed without the earned ones', async ({
    page,
  }) => {
    // The case the rule exists for: completion marks and NOTHING else. "Mark as
    // complete" has no learning precondition, so a track header showing only
    // that number would overstate what happened.
    const foundations = await trackLessons(page, 'foundations');
    await writeStorage(page, {
      [completeKey(foundations[0]!.slug)]: '1',
      [completeKey(foundations[1]!.slug)]: '1',
    });
    await page.reload();

    for (const track of ['foundations', 'algorithms']) {
      const count = trackCount(page, track);
      const mastery = trackMastery(page, track);
      // Wherever a count is on screen, both lines are — including at zero,
      // which states a fact and sets no target.
      await expect(count).toBeVisible();
      await expect(mastery).toBeVisible();
      await expect(count).not.toHaveText('');
      await expect(mastery).toHaveText(/^Practiced \d+ · Mastered \d+$/);
    }
  });

  test('no lesson is ever locked, whatever is recorded', async ({ page }) => {
    // Locked progression and endowed head starts are both on the killed list;
    // the curriculum is navigable in full from the first visit.
    const lessons = await curriculum(page);
    const allLinks = await page.evaluate(() =>
      [...document.querySelectorAll('[data-lesson-card]')].every(
        (card) =>
          card.tagName === 'A' &&
          (card.getAttribute('href') ?? '').startsWith('/learn/') &&
          !card.hasAttribute('aria-disabled') &&
          card.getAttribute('tabindex') !== '-1',
      ),
    );
    expect(allLinks, 'every card must be a real, enabled link').toBe(true);
    await expect(page.locator('[data-lesson-card]')).toHaveCount(
      lessons.length,
    );

    // …and the last lesson is readable in full with nothing recorded at all.
    const last = lessons[lessons.length - 1]!;
    await page.goto(`/learn/${last.slug}`);
    await expect(page.getByRole('heading', { name: 'Practice' })).toBeVisible();
    await expect(page.locator('[data-practice-check]')).not.toHaveCount(0);
    await expect(page.locator('[data-mark-complete]')).toBeEnabled();
  });

  test('a Mastered lesson offers exactly what an untouched one offers', async ({
    page,
  }) => {
    // Stage is a DISPLAY, never a permission: no control appears or disappears
    // with progress, so no reader is ever nudged into ticking a box to unlock
    // something. Compared on the SAME lesson before and after, not across two
    // lessons — two lessons legitimately differ in how many visualizers they
    // host, and a test that failed for that reason would be noise.
    const controls = (target: Page) =>
      target.evaluate(() =>
        [...document.querySelectorAll('button, [data-practice-check] summary')]
          .map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim())
          .sort(),
      );

    await page.goto(`/learn/${LESSON}`);
    const untouched = await controls(page);
    expect(untouched.length).toBeGreaterThan(3);

    await writeStorage(page, {
      [completeKey(LESSON)]: '1',
      [masteryKey(LESSON)]: JSON.stringify({
        practicedAt: daysAgo(30),
        masteredAt: daysAgo(4),
        checks: [1, 1, 1],
      }),
    });
    await page.reload();
    await expect(page.locator('[data-lesson-stage]')).toBeVisible();
    expect(await controls(page)).toEqual(untouched);
  });
});

test.describe('reset — the delete half of the promise', () => {
  test('clears the mastery record AND the completion mark, and no preference', async ({
    page,
  }) => {
    const foundations = await trackLessons(page, 'foundations');
    const slug = foundations[0]!.slug;
    await writeStorage(page, {
      [completeKey(slug)]: '1',
      [masteryKey(slug)]: JSON.stringify({
        practicedAt: daysAgo(12),
        masteredAt: daysAgo(2),
        checks: [1, 1, 1],
      }),
      theme: 'dark',
      'pref:viz-speed': '2',
      'pref:code-lang': 'javascript',
    });
    await page.reload();
    await expect(cardPips(page, slug)).toHaveAttribute(
      'data-stage',
      'mastered',
    );

    await page.locator('[data-reset-toggle]').click();
    await page.locator('[data-reset-confirm]').click();
    await expect(page.locator('[data-progress-status]')).toContainText(
      'Progress reset',
    );

    // Both PROGRESS keys go…
    expect(await readKey(page, completeKey(slug))).toBeNull();
    expect(await readKey(page, masteryKey(slug))).toBeNull();
    // …and every PREFERENCE key stays: resetting progress must not throw away
    // the reader's theme, speed or language (spec §6's deliberate split).
    expect(await readKey(page, 'theme')).toBe('dark');
    expect(await readKey(page, 'pref:viz-speed')).toBe('2');
    expect(await readKey(page, 'pref:code-lang')).toBe('javascript');

    // Every surface is back to the new-user state, in place.
    await expect(page.locator('[data-mastery-pips][data-stage]')).toHaveCount(
      0,
    );
    await expect(cardPips(page, slug)).toBeHidden();
    await expect(trackMastery(page, 'foundations')).toHaveText(
      'Practiced 0 · Mastered 0',
    );
    await expect(trackCount(page, 'foundations')).toHaveText(
      /^0 of \d+ done on this device$/,
    );
    await expect(page.locator('[data-reset-toggle]')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  test('is available when practice records exist but no lesson was ever marked', async ({
    page,
  }) => {
    // The cross-stream gap the store author flagged: `resetProgress` counts
    // completion marks only, so a control gated on that count would present
    // itself as "nothing to clear" while holding the reader's practice records.
    await seedStorage(page, {
      [masteryKey(LESSON)]: JSON.stringify({
        practicedAt: daysAgo(4),
        masteredAt: null,
        checks: [1, 1, 1],
      }),
    });
    await page.goto(LEARN);

    const toggle = page.locator('[data-reset-toggle]');
    await expect(toggle).toHaveAttribute('aria-disabled', 'false');
    await toggle.click();
    // The warning names what is actually there: "0 completed marks" would
    // describe the delete as a no-op it is not.
    await expect(page.locator('[data-reset-warn]')).toHaveText(
      'Removes the practice records stored on this device — cannot be undone.',
    );

    await page.locator('[data-reset-confirm]').click();
    await expect(page.locator('[data-progress-status]')).toHaveText(
      'Progress reset — practice records removed from this device.',
    );
    await expect(page.locator('[data-mastery-pips][data-stage]')).toHaveCount(
      0,
    );
  });

  test('cancelling keeps every record, mastery included', async ({ page }) => {
    const record = JSON.stringify({
      practicedAt: daysAgo(6),
      masteredAt: null,
      checks: [1, 1, 1],
    });
    await page.goto(LEARN);
    await writeStorage(page, { [masteryKey(LESSON)]: record });
    await page.reload();

    const toggle = page.locator('[data-reset-toggle]');
    await toggle.click();
    await page.locator('[data-reset-cancel]').click();
    await expect(page.locator('[data-reset-panel]')).toBeHidden();
    // Focus returns to the control that opened it — a keyboard reader is never
    // stranded beside a destructive action they declined.
    await expect(toggle).toBeFocused();

    expect(await readKey(page, masteryKey(LESSON))).toBe(record);
    await expect(cardPips(page, LESSON)).toHaveAttribute(
      'data-stage',
      'practiced',
    );
  });

  test('nothing stored anywhere means nothing to clear', async ({ page }) => {
    await page.goto(LEARN);
    // aria-disabled, not `disabled`: the toggle is where focus stands the
    // instant the last record is cleared, and a real `disabled` would drop that
    // focus onto <body>.
    await expect(page.locator('[data-reset-toggle]')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await page.locator('[data-reset-toggle]').click({ force: true });
    await expect(page.locator('[data-reset-panel]')).toBeHidden();
  });
});

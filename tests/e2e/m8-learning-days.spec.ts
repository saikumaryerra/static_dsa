/**
 * M8.3 — Learning Days: the anti-streak (`docs/m8-gamification.md` → "M8.3 —
 * Enrichment" and the killed list; spec §6's `ld:days:v1`).
 *
 * THIS MECHANIC EXISTS BECAUSE STREAKS WERE KILLED. The design's reasoning is
 * on the record: daily streaks are "pedagogically backwards (the spacing effect
 * says the gap is the point) and a loss-aversion guilt mechanic that
 * manufactures a quit moment", and "the monotonic Learning Days line is the
 * honest ceiling". So every test below is one of two questions:
 *
 *   1. Is the number TRUE? It counts days on which the reader made an explicit
 *      learning act — at most one per calendar day, never a page view, never a
 *      scroll, never elapsed time (spec §6 bans behavioral tracking outright,
 *      and a counter that ticked on arrival would be exactly that).
 *   2. Is it still not a streak? It never decreases, never renders a chain,
 *      never sets a target and never compares — a reader who comes back after
 *      six months finds their number where they left it, one higher.
 *
 * HOW THE CLOCK IS FAKED — it isn't. The product reads the wall clock, so the
 * only honest lever is the STORED `last` stamp, which these tests move by
 * rewriting it in whatever format the product itself just wrote (see
 * {@link shiftLastBack}). Nothing here mocks `Date`: that would test a fake
 * calendar. The pure day-boundary arithmetic is unit-tested with an injected
 * `now` (`tests/unit/learning-days.test.ts`), which is the harness split
 * `docs/m8-gamification.md` specifies — Vitest has no DOM and no storage.
 *
 * WHICH ACT IS PERFORMED, and why it is usually a self-grade. `docs/m8-…` names
 * the trigger only as "a qualifying learning act", so all but one test below
 * uses the least ambiguous one — self-grading a Practice question, the design's
 * core retrieval act. The single test that pins "Mark as complete" as
 * qualifying says so in its title, so a product that deliberately counts only
 * retrieval fails exactly one test and states the disagreement, instead of
 * failing the file.
 *
 * VOCABULARY, and one deliberate exception. The banned list below is the
 * design's killed vocabulary. The word "streak" itself is permitted in exactly
 * one shape — an explicit denial, which is the copy the design asks for
 * ("there's no streak to break here") — and banned in every other, because a
 * line that says "no streak" is making the promise while a line that says "5
 * day streak" is breaking it. {@link withoutDisclaimer} is where that
 * distinction lives.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  blockStorage,
  gradeQuestion,
  openQuestion,
  readKey,
  trackIntervals,
  trackPageErrors,
  watchRewrites,
  writeStorage,
} from './utils/mastery';

/** Spec §6's learning-days key — a GLOBAL progress key, not per lesson. */
const DAYS_KEY = 'ld:days:v1';

const LESSON = 'arrays';
const SECOND_LESSON = 'stacks';
const LEARN = '/learn';

/** Milliseconds in a day. */
const DAY_MS = 86_400_000;

/**
 * Loss-framing and chain vocabulary — every one of these is a mechanic the
 * design killed, not a style preference.
 *
 * "Streak" is handled by {@link withoutDisclaimer} rather than by being absent
 * from this list: the word is allowed to appear only while being denied.
 */
const BANNED =
  /\b(streaks?|chains?|in a row|consecutive|don'?t break|keep it (going|up)|back to (zero|1|one)|you lost|missed a day|leaderboard|best ever|than (most|others))\b/i;

/** A target dressed as a fraction ("4 of 30 days") is still a target. */
const TARGET = /\b\d+\s*(of|\/)\s*\d+\b/;

/** A ticking line is an attention trap; only static statements are allowed. */
const COUNTDOWN =
  /\b(days? left|hours? left|ready in|in \d+ days?|come back in|expires?|resets?)\b/i;

/**
 * Strips the one permitted use of "streak" — an explicit denial — so the ban
 * can be applied to everything else in the same sentence.
 *
 * "there's no streak to break here" survives; "4 day streak" does not, and
 * neither does a line that denies a streak and then renders one anyway.
 *
 * @param text - The copy to sanitise.
 * @returns The copy with any "no streak"/"not a streak" phrase removed.
 */
function withoutDisclaimer(text: string): string {
  return text.replace(/\b(no|not a|never a|isn'?t a)\s+streaks?\b/gi, '');
}

/**
 * The stored `ld:days:v1` value, parsed; `null` when the key is unset.
 *
 * The read is retried once because `page.goto` resolves at `load` and a page may
 * still replace its execution context immediately afterwards — Playwright then
 * reports "Execution context was destroyed" for a perfectly healthy store, which
 * would read here as a missing key. Retrying a READ is safe in a way that
 * retrying an assertion would not be: the value is asserted by the caller.
 */
async function readDays(page: Page): Promise<Record<string, unknown> | null> {
  let raw: string | null;
  try {
    raw = await readKey(page, DAYS_KEY);
  } catch {
    await page.waitForLoadState('load');
    raw = await readKey(page, DAYS_KEY);
  }
  return raw === null ? null : (JSON.parse(raw) as Record<string, unknown>);
}

/** The stored count, or 0 when nothing usable is stored at all. */
async function daysCount(page: Page): Promise<number> {
  const record = await readDays(page);
  const count = record?.['count'];
  return typeof count === 'number' ? count : 0;
}

/**
 * Waits until the stored count reaches `expected`, then returns the record.
 *
 * Polls STORAGE rather than a rendered line: the write is what the requirement
 * is about, and a test that waited on copy could not tell a stored count from a
 * painted one.
 *
 * @param page - A page on the site's origin.
 * @param expected - The count to wait for.
 * @returns The parsed record once the count matches.
 */
async function waitForCount(
  page: Page,
  expected: number,
): Promise<Record<string, unknown>> {
  await expect.poll(() => daysCount(page), { timeout: 5_000 }).toBe(expected);
  const record = await readDays(page);
  expect(
    record,
    `${DAYS_KEY} is unset even though its count reached ${expected}`,
  ).not.toBeNull();
  return record!;
}

/**
 * Asserts the stored shape is exactly `{ count, last }` — the design's whole
 * data model for this key.
 *
 * The absent history array is the point: a per-day ledger is what would make a
 * chain renderable, and the design stores a count precisely so that no surface
 * can ever draw one. "No extra fields" is asserted rather than assumed for the
 * same reason.
 *
 * @param record - The parsed `ld:days:v1` value.
 */
function expectDayRecordShape(record: Record<string, unknown>): void {
  expect(Object.keys(record).sort()).toEqual(['count', 'last']);
  expect(typeof record['count'], 'count must be a number').toBe('number');
  expect(Number.isInteger(record['count'] as number)).toBe(true);
  expect(record['count'] as number).toBeGreaterThan(0);
  expect(Array.isArray(record['last']), 'no history array').toBe(false);
  expect(record['last']).not.toBeNull();
  expect(['string', 'number']).toContain(typeof record['last']);
}

/**
 * Rewrites the stored record as if `count` days had been counted, the most
 * recent of them `days` ago — keeping the product's OWN stamp format.
 *
 * Format-detecting instead of format-choosing is deliberate: the design fixes
 * the two field names and nothing else, so a test that hard-coded `YYYY-MM-DD`
 * would be asserting an implementation detail it invented. Every branch here is
 * a stamp a reasonable implementation could write; anything else throws rather
 * than silently seeding a record the product cannot read (which would turn a
 * real regression into a green run).
 *
 * @param page - A page on the site's origin, with a record already stored.
 * @param days - How many days into the past to move `last`.
 * @param count - The count to seed alongside it.
 */
async function shiftLastBack(
  page: Page,
  days: number,
  count: number,
): Promise<void> {
  const record = await readDays(page);
  expect(record, 'nothing is stored to shift').not.toBeNull();
  const last = record!['last'];
  let shifted: string | number;
  if (typeof last === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(last)) {
    // A local calendar day. Built through UTC noon so a DST shift cannot land
    // the arithmetic on the wrong date.
    const [y, m, d] = last.split('-').map(Number) as [number, number, number];
    shifted = new Date(Date.UTC(y, m - 1, d, 12) - days * DAY_MS)
      .toISOString()
      .slice(0, 10);
  } else if (typeof last === 'string' && !Number.isNaN(Date.parse(last))) {
    shifted = new Date(Date.parse(last) - days * DAY_MS).toISOString();
  } else if (typeof last === 'number' && last > 1e11) {
    shifted = last - days * DAY_MS; // epoch milliseconds
  } else if (typeof last === 'number') {
    shifted = last - days; // a day index
  } else {
    throw new Error(
      `Cannot shift a \`last\` of ${JSON.stringify(last)} — this helper knows ISO dates, ISO timestamps, epoch ms and day indices.`,
    );
  }
  await writeStorage(page, {
    [DAYS_KEY]: JSON.stringify({ count, last: shifted }),
  });
}

/**
 * The learning act these tests perform: self-grading a Practice question.
 *
 * Chosen over "Mark as complete" for everything except the test that names it,
 * because a self-grade is unambiguously a retrieval act — the one thing the
 * design's whole loop is built on.
 *
 * @param page - A lesson page.
 * @param index - Which question to grade, 0-based.
 */
async function learningAct(page: Page, index = 0): Promise<void> {
  await gradeQuestion(page, index, 'had');
  await expect(
    page
      .locator('[data-practice-check]')
      .nth(index)
      .locator('[data-practice-grade="had"]'),
  ).toHaveAttribute('aria-pressed', 'true');
}

/** Marks the current lesson complete through the real control. */
async function markComplete(page: Page): Promise<void> {
  const button = page.locator('[data-mark-complete]');
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
}

/** The browser's own idea of today, for the midnight guard. */
function localDay(page: Page): Promise<string> {
  return page.evaluate(() => new Date().toDateString());
}

/**
 * The smallest rendered element that states the count in days — the line, found
 * by what it must SAY rather than by a hook this suite invented.
 *
 * `checkVisibility()` rather than `innerText` alone: `innerText` falls back to
 * `textContent` for an element that is not being rendered, so a line switched
 * off by a `<noscript>` rule would otherwise read back in full — a false pass in
 * exactly the case that matters.
 *
 * The count has to be STATED IN DAYS ("12 days", "1 day"), not merely present
 * beside the word: the reset announcement legitimately names the
 * "learning-days count" it just removed, and a looser match found that sentence
 * and reported the cleared line as still on screen.
 *
 * @param page - The page to search (already loaded).
 * @param count - The count that must appear in it.
 * @returns The whitespace-collapsed text, or `null` when no element qualifies.
 */
async function daysLineOn(page: Page, count: number): Promise<string | null> {
  return page.evaluate((n) => {
    const stated = new RegExp(`(^|[^\\d])${n}\\s+days?\\b`, 'i');
    let smallest: string | null = null;
    for (const element of Array.from(document.querySelectorAll('body *'))) {
      if (!(element instanceof HTMLElement)) continue;
      if (
        !element.checkVisibility({
          contentVisibilityAuto: true,
          opacityProperty: true,
          visibilityProperty: true,
        })
      ) {
        continue;
      }
      const text = element.innerText.replace(/\s+/g, ' ').trim();
      if (!stated.test(text)) continue;
      if (smallest === null || text.length < smallest.length) smallest = text;
    }
    return smallest;
  }, count);
}

/**
 * Finds the line wherever the product renders it.
 *
 * The design says "an optional single line" without naming a page, so this
 * looks on the surfaces a reader would meet it on rather than pinning one.
 *
 * @param page - The page to navigate.
 * @param count - The count the line must state.
 * @returns The line and the path it was found on, or `null` from every path.
 */
async function findDaysLine(
  page: Page,
  count: number,
): Promise<{ path: string; text: string } | null> {
  for (const path of [LEARN, '/', `/learn/${LESSON}`]) {
    await page.goto(path);
    const text = await daysLineOn(page, count);
    if (text !== null) return { path, text };
  }
  return null;
}

test.describe('the count is true', () => {
  test('marking a lesson complete counts the day, stored as exactly { count, last }', async ({
    page,
  }) => {
    await page.goto(`/learn/${LESSON}`);
    expect(
      await readDays(page),
      'nothing may be stored before the reader acts',
    ).toBeNull();

    await markComplete(page);

    const record = await waitForCount(page, 1);
    expectDayRecordShape(record);
    expect(record['count']).toBe(1);
  });

  test('a self-graded practice question counts the day', async ({ page }) => {
    await page.goto(`/learn/${LESSON}`);
    await learningAct(page);
    expectDayRecordShape(await waitForCount(page, 1));
  });

  test('two acts on the same day count once', async ({ page }) => {
    const startedOn = await localDay(page);
    await page.goto(`/learn/${LESSON}`);

    await learningAct(page, 0);
    const first = await waitForCount(page, 1);

    // A second explicit act, same calendar day: another self-grade, and a
    // completion — neither may add a day the reader did not have.
    await learningAct(page, 1);
    await markComplete(page);

    test.skip(
      (await localDay(page)) !== startedOn,
      'the run crossed local midnight; a second day is correct there',
    );
    expect(
      await daysCount(page),
      'a second act on the same day counted a second day',
    ).toBe(1);
    // The stamp did not move either — it is still recording the same day.
    expect((await readDays(page))?.['last']).toEqual(first['last']);
    expectDayRecordShape((await readDays(page))!);
  });

  test('a reload is not a second act', async ({ page }) => {
    await page.goto(`/learn/${LESSON}`);
    await learningAct(page);
    await waitForCount(page, 1);

    await page.reload();
    await page.goto(LEARN);
    await page.goto(`/learn/${LESSON}`);
    expect(await daysCount(page)).toBe(1);
  });

  test('viewing, scrolling and revealing an answer are not learning acts', async ({
    page,
  }) => {
    // Spec §6 bans behavioral tracking outright: "store only explicit user acts
    // and self-reports". A day counted for arriving would be attendance, which
    // is the attendance goal this design refuses to build — and revealing an
    // authored answer is not a self-report about having retrieved it.
    const errors = trackPageErrors(page);
    await page.goto('/');
    await page.goto(LEARN);
    await page.goto(`/learn/${LESSON}`);
    await page.mouse.wheel(0, 4_000);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await openQuestion(page, 0);
    await page.reload();

    expect(await daysCount(page), 'a visit counted as a learning day').toBe(0);
    expect(await readKey(page, DAYS_KEY)).toBeNull();

    // Corroborated from the product's own side: with nothing stored, the reset
    // control reports there is nothing to clear.
    await page.goto(LEARN);
    await expect(page.locator('[data-reset-toggle]')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(errors).toEqual([]);
  });
});

test.describe('it is not a streak', () => {
  test('a gap of days raises the count by one and never resets it', async ({
    page,
  }) => {
    // THE ANTI-STREAK TEST. A streak would read this record, see six missed
    // days and set the count back to 1. Monotonic means the reader who returns
    // after a gap finds their number where they left it, one higher — and meets
    // no copy about the gap at all.
    const startedOn = await localDay(page);
    await page.goto(`/learn/${LESSON}`);
    await learningAct(page);
    await waitForCount(page, 1);

    // Five days already counted, the most recent of them six days ago —
    // written in the product's own stamp format.
    await shiftLastBack(page, 6, 5);

    await page.goto(`/learn/${SECOND_LESSON}`);
    await learningAct(page);
    const record = await waitForCount(page, 6);
    expectDayRecordShape(record);

    test.skip(
      (await localDay(page)) !== startedOn,
      'the run crossed local midnight',
    );
    expect(record['count'], 'the count must only ever go up').toBe(6);

    // Nothing anywhere frames the gap as a loss.
    for (const path of [LEARN, `/learn/${SECOND_LESSON}`]) {
      await page.goto(path);
      const body = withoutDisclaimer(await page.locator('body').innerText());
      const hits = body.split('\n').filter((line) => BANNED.test(line));
      expect(hits, `chain or guilt vocabulary on ${path}`).toEqual([]);
      expect(body).not.toMatch(/\b(6|six) days? (ago|since|away|without)\b/i);
    }
  });

  test('the line states the number without a target, a chain or a comparison', async ({
    page,
  }) => {
    await page.goto(`/learn/${LESSON}`);
    await learningAct(page);
    await waitForCount(page, 1);
    // A long-running device: eleven days counted, the last of them 40 days ago.
    await shiftLastBack(page, 40, 11);
    await page.goto(`/learn/${SECOND_LESSON}`);
    await learningAct(page);
    await waitForCount(page, 12);

    const found = await findDaysLine(page, 12);
    expect(
      found,
      'no rendered line states the learning-days count on /learn, / or a lesson page',
    ).not.toBeNull();

    const line = withoutDisclaimer(found!.text);
    expect(line, `banned vocabulary in "${found!.text}"`).not.toMatch(BANNED);
    expect(line, `a target in "${found!.text}"`).not.toMatch(TARGET);
    expect(line, `a countdown in "${found!.text}"`).not.toMatch(COUNTDOWN);
    expect(line, 'no percentage belongs on a learning act').not.toMatch(/%/);
    // Every persistent surface says where the record lives (calm invariants).
    expect(found!.text).toMatch(/(this device|this browser)/i);
  });

  test('nothing repaints the line on a timer', async ({ page }) => {
    // A number that re-renders on a schedule is a countdown by another name.
    // `trackIntervals` is installed before the first script runs and filters by
    // CALLER, so a dev server's own timers cannot mask a product one.
    const readIntervals = await trackIntervals(page);
    await page.goto(`/learn/${LESSON}`);
    await learningAct(page);
    await waitForCount(page, 1);

    const found = await findDaysLine(page, 1);
    test.skip(found === null, 'the line is covered by its own test');
    const line = page.locator('body *').filter({ hasText: found!.text }).last();
    const readRewrites = await watchRewrites(line);
    // The wait IS the assertion, not a race: a ticking line rewrites itself
    // about once a second, so a second of silence can only ever be a false
    // PASS, never a flaky fail.
    await page.waitForTimeout(1_200);
    expect(await readRewrites(), 'the line must not repaint itself').toBe(0);
    expect(await readIntervals(), 'no repeating timer belongs here').toEqual(
      [],
    );
  });
});

test.describe('the delete half of the promise', () => {
  test('the reset control clears the count and says that it will', async ({
    page,
  }) => {
    await page.goto(`/learn/${LESSON}`);
    await learningAct(page);
    await waitForCount(page, 1);

    await page.goto(LEARN);
    const toggle = page.locator('[data-reset-toggle]');
    await expect(toggle).toHaveAttribute('aria-disabled', 'false');
    await toggle.click();
    // Spec §6 lists `ld:days:v1` as a PROGRESS key, and the design's rule is
    // that the confirm sentence names what actually goes — a reader about to
    // lose a two-year-old count must be told before they confirm.
    await expect(page.locator('[data-reset-warn]')).toHaveText(/\bdays?\b/i);

    await page.locator('[data-reset-confirm]').click();
    await expect(page.locator('[data-progress-status]')).not.toHaveText('');
    expect(await readKey(page, DAYS_KEY)).toBeNull();
    expect(await daysLineOn(page, 1)).toBeNull();
  });

  test('a device holding only a learning-days count still has something to clear', async ({
    page,
  }) => {
    // The same gap the enrichment keys had: this key is reachable without ever
    // completing a lesson, and a control gated on completion marks alone would
    // tell the reader there is nothing stored while holding it.
    await page.goto(LEARN);
    await writeStorage(page, {
      [DAYS_KEY]: JSON.stringify({ count: 3, last: new Date().toISOString() }),
    });
    await page.reload();
    const toggle = page.locator('[data-reset-toggle]');
    await expect(toggle).toHaveAttribute('aria-disabled', 'false');
    await toggle.click();
    await page.locator('[data-reset-confirm]').click();
    expect(await readKey(page, DAYS_KEY)).toBeNull();
  });
});

test.describe('degraded states', () => {
  test('storage blocked: no line, no claim, no thrown script', async ({
    page,
  }) => {
    const errors = trackPageErrors(page);
    await blockStorage(page);
    await page.goto(`/learn/${LESSON}`);
    await markComplete(page);
    await page.goto(LEARN);

    // "0 days" would be a claim about a device nobody could read — the same
    // rule the track arc follows (hidden is more honest than a static zero).
    for (const count of [0, 1]) {
      expect(await daysLineOn(page, count)).toBeNull();
    }
    expect(errors, 'no script may throw when storage is blocked').toEqual([]);
  });

  test('a corrupt record costs the line, never the page', async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto(LEARN);
    await writeStorage(page, { [DAYS_KEY]: '{"count":' });
    await page.reload();

    await expect(page.locator('[data-lesson-card]').first()).toBeVisible();
    expect(await page.locator('body').innerText()).not.toMatch(
      /\bNaN\b|\bundefined\b/,
    );
    expect(errors).toEqual([]);

    // …and an act writes a clean record over it rather than compounding it.
    await page.goto(`/learn/${LESSON}`);
    await learningAct(page);
    expectDayRecordShape(await waitForCount(page, 1));
  });
});

// ---------------------------------------------------------------------------
// axe, on the state that only exists after a reader acts.
//
// Scoped to `/learn`'s progress block (through the hooks those components ship,
// the way `m8-practice-check.spec.ts` scopes to `[data-practice-check]`) so this
// can gate at zero SERIOUS as well as zero critical — a one-sentence line has no
// excuse for either. Both themes, because the token contrast tables claim AA in
// each and this line is new text on a tinted surface.
// ---------------------------------------------------------------------------
for (const theme of ['light', 'dark'] as const) {
  test(`axe: the learning-days line (${theme} theme) — zero critical, zero serious`, async ({
    page,
  }) => {
    await page.addInitScript((value) => {
      localStorage.setItem('theme', value);
    }, theme);
    await page.goto(`/learn/${LESSON}`);
    await learningAct(page);
    await waitForCount(page, 1);
    await page.goto(LEARN);

    const line = page.locator('[data-learning-days]');
    // The scan is only meaningful if the line is actually on screen — a hidden
    // element passes every contrast rule there is.
    await expect(line).toBeVisible();
    const results = await new AxeBuilder({ page })
      .include('[data-learning-days]')
      .analyze();
    const blocking = results.violations
      .filter((v) => v.impact === 'critical' || v.impact === 'serious')
      .map((v) => `${v.impact} ${v.id}: ${v.help}`);
    expect(blocking).toEqual([]);
  });
}

test.describe('JavaScript disabled', () => {
  test.use({ javaScriptEnabled: false });

  test('no learning-days line appears anywhere', async ({ page }) => {
    // Every M8 component ships its own `<noscript>` kill-switch: with no script
    // there is no storage read, so any number on screen would be a fiction the
    // build invented about a device it never saw.
    for (const path of [LEARN, '/', `/learn/${LESSON}`]) {
      await page.goto(path);
      const body = await page.locator('body').innerText();
      expect(
        body,
        `a day count is rendered on ${path} with JS off`,
      ).not.toMatch(/\b\d+\s+days?\b/i);
      expect(body).not.toMatch(/\blearning days?\b/i);
    }

    // DISCRIMINATOR: the M7 page underneath is intact, so the absence above is
    // a kill-switch rather than a page that failed to render.
    await page.goto(LEARN);
    await expect(page.locator('[data-lesson-card]').first()).toBeVisible();
    await expect(page.locator('[data-resume-link]')).toBeVisible();
  });
});

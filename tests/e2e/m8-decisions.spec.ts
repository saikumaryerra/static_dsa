/**
 * M8.1 — the settled decisions, pinned (`docs/m8-gamification.md`: "Calm
 * invariants (enforce with tests, not intentions)"; spec §8, §12).
 *
 * Every rule in this file was decided once, written down as prose, and then
 * re-broken by a later change that looked perfectly reasonable on its own. That
 * is the exact failure mode the design doc names — *maintenance pressure erodes
 * design intentions but not failing tests* — so each of them gets an assertion
 * here rather than a paragraph somewhere:
 *
 * 1. **The 3-day gate explains itself, and never ticks.** The gate is an
 *    explanation of how memory works, not a lockout — `docs/m8-gamification.md`
 *    requires it to be paired with a one-line reason ("Mastery needs a return
 *    visit after a few days — that's how memory consolidates"; the shipped
 *    sentence composes the same claim from the store's own `MASTERY_GATE_DAYS`).
 *    Shown without its reason it reads as an arbitrary rule the reader is being
 *    made to obey; shown as a countdown it becomes the attention trap the design
 *    bans outright (a static "ready from Tuesday" is permitted, a ticking one is
 *    not).
 * 2. **The currency legend is honest.** Three unexplained words on a card are a
 *    scoreboard the reader has to reverse-engineer. The legend names all three
 *    stages, says the reader is the one who decided them (nothing here grades
 *    anybody), and states the device scope — and because it is static copy
 *    rather than a claim about stored state, it must survive with JavaScript
 *    off. **That last clause is the one assertion in this file that currently
 *    FAILS**: `/learn`'s `<noscript>` block switches `.learn__legend` off on the
 *    reasoning that a legend for pips nobody can see explains nothing. Both
 *    readings are defensible and the requirement handed to this suite is
 *    explicit, so the test states the requirement and stays red until the
 *    conflict is settled — resolving it either way is a three-line change (drop
 *    the rule from that `<noscript>`, or delete the JS-off test).
 * 3. **`LessonCard`'s link carries no `aria-label`.** The whole card is one
 *    `<a>`, so its accessible name is its CONTENT; an `aria-label` — the obvious
 *    "fix" whenever the card's sr-only stage text is being adjusted — REPLACES
 *    that name and hides the title and the summary from exactly the readers who
 *    depend on it. It has been re-broken before, and until now was recorded only
 *    in a comment (`LessonCard.astro`'s SPEC-GAP note).
 */
import { expect, test, type Page } from '@playwright/test';
import {
  cardLabel,
  currencyLegend,
  curriculum,
  daysAgo,
  headerPips,
  openAllDisclosures,
  seedComplete,
  seedMastery,
  trackIntervals,
  watchRewrites,
} from './utils/mastery';

const LESSON = 'arrays';
const LESSON_URL = `/learn/${LESSON}`;
const LEARN = '/learn';

/**
 * Countdown shapes, in any wording — a number of time units that could only be
 * true for a moment. The banned thing is the RUNNING clock, not the number: a
 * fixed date ("ready from Tuesday") states a fact and never changes.
 */
const COUNTDOWN =
  /\b(in \d+ (seconds?|minutes?|hours?|days?)|\d+ (seconds?|minutes?|hours?|days?) (left|remaining|to go)|ready in|come back in|counting down)\b|\d{1,2}:\d{2}/i;

/** Escapes a string for use inside a RegExp. */
function literal(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whitespace as an accessible name (and `toHaveAccessibleName`) sees it. */
function flat(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Puts the reader at Practiced, one day in — inside the gate, so it is live. */
async function atPracticed(page: Page): Promise<void> {
  await seedMastery(page, LESSON, {
    practicedAt: daysAgo(1),
    masteredAt: null,
    checks: [1, 1, 1],
  });
  await page.goto(LESSON_URL);
  await expect(headerPips(page)).toHaveAttribute('data-stage', 'practiced');
}

test.describe('the 3-day gate explains itself', () => {
  test('a reader at Practiced is told WHY the last pip waits', async ({
    page,
  }) => {
    await atPracticed(page);

    // The reason, in the reader's own view, without opening anything: a rule
    // whose explanation is behind a disclosure is a rule most readers meet
    // unexplained. Matched on the CLAIM it makes rather than on a selector or
    // the exact sentence, so the copy can be improved but not dropped.
    const reason = page.getByText(/memory consolidat/i).first();
    await expect(
      reason,
      'a reader at Practiced must be told why Mastered waits',
    ).toBeVisible();
    await expect(reason).toContainText(/(a few|three|3) days/i);

    // It is an explanation, not a scolding and not a scoreboard.
    const text = flat(await reason.innerText());
    expect(text).not.toMatch(/\b(overdue|missed|behind|late|locked|must)\b/i);
    expect(text).not.toMatch(/%|\d\s*\/\s*\d/);
    expect(text, `countdown copy in "${text}"`).not.toMatch(COUNTDOWN);

    // …and it goes when it stops being true. A reader at Mastered HAS made the
    // return visit, so telling them one is needed would be a false statement
    // about their own record — the same reason the milestone retires itself.
    await seedMastery(page, LESSON, {
      practicedAt: daysAgo(9),
      masteredAt: daysAgo(1),
      checks: [1, 1, 1],
    });
    await page.reload();
    await expect(headerPips(page)).toHaveAttribute('data-stage', 'mastered');
    await expect(page.getByText(/memory consolidat/i).first()).toBeHidden();
  });

  test('and it never ticks — no timer anywhere, no self-rewriting line', async ({
    page,
  }) => {
    // TWO independent proofs, because a countdown can be built two ways.
    // First: none of the site's own scripts schedules a repeating timer.
    // Installed before the page's first script, so it sees every island; the
    // Player deliberately uses `setTimeout` for autoplay (`viz/core/player.ts`)
    // and nothing is playing here anyway, so a lesson page at rest owes an
    // empty list.
    const intervals = await trackIntervals(page);
    await atPracticed(page);
    expect(
      await intervals(),
      'a page at rest must schedule no repeating timer',
    ).toEqual([]);

    // Second: the line itself does not re-render. This is the case the timer
    // check cannot see (a self-rescheduling `setTimeout`, or an animation
    // frame loop), and observing a WINDOW is the only way to ask it. The wait
    // is the assertion rather than a race: a ticking line rewrites itself every
    // second, so a second-and-a-bit of silence can only be a false PASS, never
    // a flaky fail.
    const reason = page.getByText(/memory consolidat/i).first();
    const rewrites = await watchRewrites(reason);
    await page.waitForTimeout(1200);
    expect(await rewrites(), 'the reason must be static copy').toBe(0);

    // …and on `/learn`, where a "next review in 2 days" nudge would live. The
    // instrumentation is an init script, so it re-installs (and re-empties its
    // record) on this navigation: what it reports is `/learn`'s own timers.
    await page.goto(LEARN);
    expect(await intervals()).toEqual([]);
    expect(flat(await page.locator('body').innerText())).not.toMatch(COUNTDOWN);
  });
});

/**
 * "Nobody graded this — you did", in any wording. The requirement is the CLAIM,
 * not a phrase: "self-reported", "your own notes to yourself" and "nothing here
 * is graded or checked" all discharge it, and pinning one of them would freeze
 * the copywriting instead of the promise.
 */
const SELF_REPORTED =
  /self[- ]report|your own|you decide|(nothing|none of|not)[^.]*\b(graded|checked|verified|assessed|marked for you)\b/i;

test.describe('the currency legend is honest', () => {
  test('it names the three stages, says who decided them, and where they live', async ({
    page,
  }) => {
    await page.goto(LEARN);
    // The legend is allowed to be collapsed reference material — it is not a
    // call to action — so this opens it the way a reader does.
    await openAllDisclosures(page);

    const named = await currencyLegend(page);
    expect(
      named,
      'nothing on /learn explains what Learned, Practiced and Mastered mean',
    ).not.toBeNull();

    // Every clause on ONE block. Where the legend puts them in separate
    // paragraphs this resolves to their common ancestor — which is the legend —
    // rather than to whatever else on the page happens to say "Practiced".
    const legend = await currencyLegend(page, [
      SELF_REPORTED.source,
      'on this device',
    ]);
    expect(
      legend,
      `the legend must say who decided the stages and where they are kept; the block naming them says: "${named}"`,
    ).not.toBeNull();
    const text = legend ?? '';

    // One block, not the whole page: a "legend" spread across the index is the
    // reader reverse-engineering it again.
    expect(text.length, `legend too long to be one: "${text}"`).toBeLessThan(
      900,
    );
    // Each stage is explained, not just listed — a bare word list would leave
    // the reader to guess what fills pip 2.
    for (const stage of ['Learned', 'Practiced', 'Mastered']) {
      expect(text, `"${stage}" is named but not explained`).toMatch(
        new RegExp(`${stage}[^A-Za-z]{0,3}\\s*\\S+ \\S+`),
      );
    }
    // No second currency and no scoreboard smuggled into the explanation, and
    // no countdown in the sentence that explains the 3-day gate.
    expect(text).not.toMatch(/%|\d\s*\/\s*\d/);
    expect(text).not.toMatch(
      /\b(xp|points?|levels?|badges?|streaks?|score)\b/i,
    );
    expect(text).not.toMatch(COUNTDOWN);
  });

  test('with JavaScript off it goes too — a legend for nothing is worse than none', async ({
    browser,
  }) => {
    // The tempting rule is "the legend is copy, not a claim, so keep it". That
    // was the brief this phase was written from, and it is wrong: with JS off
    // there is no pip, no ring, and no stage word anywhere on this page, so a
    // legend defining three pips describes something the reader cannot see. It
    // would be the one M8 surface that announces a feature while every surface
    // that feature consists of is absent.
    //
    // The stronger rule wins: M8's acceptance criterion is that a JS-off page
    // renders EXACTLY as M7 — "no gamification affordance appears without JS;
    // only static prompt copy differs". A legend for the mastery currency is a
    // gamification affordance. The retrieval prompt above a Practice question
    // is not: it tells the reader to try before revealing, which is true and
    // useful whether or not anything can be recorded.
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    try {
      await page.goto(LEARN);
      // Open everything first, so this cannot pass merely because a collapsed
      // <details> was never expanded.
      await openAllDisclosures(page);
      const legend = await currencyLegend(page, [
        SELF_REPORTED.source,
        'on this device',
      ]);
      expect(
        legend,
        'the legend must be switched off with the rest of M8 when JS is off',
      ).toBeNull();
    } finally {
      await context.close();
    }
  });
});

test.describe("the curriculum card's accessible name is its content", () => {
  test('no card link carries an aria-label, and the name still holds title + summary', async ({
    page,
  }) => {
    const lessons = await curriculum(page);
    const target = lessons[0]!;
    const card = page.locator(`[data-lesson-card][data-slug="${target.slug}"]`);

    // The rule, checked across EVERY card so a single "fixed" one cannot slip
    // through: `aria-label` (or `aria-labelledby`) on a link REPLACES its
    // accessible name, so the title and the summary stop being announced at
    // all — a screen-reader user gets only whatever that one attribute happens
    // to say, on all fifteen links.
    const labelled = await page.evaluate(() =>
      [...document.querySelectorAll('[data-lesson-card]')]
        .filter(
          (el) =>
            el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby'),
        )
        .map((el) => el.getAttribute('data-slug') ?? '(no slug)'),
    );
    expect(
      labelled,
      'a name-replacing attribute on the card link hides its title and summary',
    ).toEqual([]);

    // …and the positive half, which is what the rule is FOR: the name really
    // does carry both, in reading order.
    const summary = flat(
      await card.locator('.lesson-card__summary').innerText(),
    );
    expect(
      summary.length,
      'the card must have a summary to hide',
    ).toBeGreaterThan(10);
    const nameHoldsBoth = new RegExp(
      `${literal(target.title)}[\\s\\S]*${literal(summary)}`,
    );
    await expect(card).toHaveAccessibleName(nameHoldsBoth);
  });

  test('and painting a stage extends that name instead of replacing it', async ({
    page,
  }) => {
    // The moment the rule gets broken: the stage word has to reach assistive
    // tech (the pips are `aria-hidden` decoration, so the word is the whole
    // accessible signal), and an `aria-label` is the quickest way to make that
    // happen — at the cost of everything else the card says.
    const lessons = await curriculum(page);
    const target = lessons[0]!;
    await seedComplete(page, [target.slug]);
    await page.reload();

    const card = page.locator(`[data-lesson-card][data-slug="${target.slug}"]`);
    await expect(cardLabel(page, target.slug)).toHaveText('Learned');
    // The stage word lives INSIDE the link, as content.
    await expect(card.locator('[data-mastery-label]')).toHaveCount(1);
    await expect(card).not.toHaveAttribute('aria-label', /.*/);

    const summary = flat(
      await card.locator('.lesson-card__summary').innerText(),
    );
    await expect(card).toHaveAccessibleName(
      new RegExp(`${literal(target.title)}[\\s\\S]*${literal(summary)}`),
    );
    await expect(card).toHaveAccessibleName(/Learned/);
  });
});

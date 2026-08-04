/**
 * M8.1 — `PracticeCheck`, the retrieval prompt and its self-grade
 * (`docs/m8-gamification.md` "M8.1 — Ground floor"; spec §7 body-section 7, §9,
 * §12).
 *
 * The mechanic is a judgment of learning at zero stakes: attempt the question
 * from memory, reveal the answer, then say honestly whether you had it. Which
 * makes the a11y and copy requirements load-bearing rather than cosmetic — a
 * grade that reads as a score, or a "Not yet" that costs something, breaks the
 * intervention itself.
 *
 * What this file asserts, none of which a Node unit test can reach: the buttons
 * are real and keyboard-operable, the disclosure they live in is untouched
 * (`Collapsible` is still a native `<details>` with M7.1/CNT-8's per-question
 * label), the chosen grade is never carried by colour alone, exactly ONE polite
 * live region exists per lesson and it never announces on load, and "Not yet" is
 * both non-punishing and freely regradeable.
 *
 * The ladder those grades feed (Practiced, the 3-day gate) is
 * `m8-mastery-ladder.spec.ts`; the JS-off and blocked-storage halves are
 * `m8-degraded.spec.ts`.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  curriculum,
  daysAgo,
  gradeAll,
  gradeQuestion,
  headerPips,
  openQuestion,
  readRecord,
  seedMastery,
  watchRewrites,
} from './utils/mastery';

const LESSON = 'arrays';
const LESSON_URL = `/learn/${LESSON}`;

/** One question's root — the component instance that owns a `checks[]` slot. */
function question(page: Page, index: number) {
  return page.locator('[data-practice-check]').nth(index);
}

/** The polite region the tally is announced through (one per lesson). */
function status(page: Page) {
  return page.locator('[data-practice-status]');
}

test.describe('the controls are real controls', () => {
  test('two native buttons in a labelled group, at the shared 44px target size', async ({
    page,
  }) => {
    await page.goto(LESSON_URL);
    const first = question(page, 0);
    await openQuestion(page, 0);

    const buttons = first.locator('[data-practice-grade]');
    await expect(buttons).toHaveCount(2);
    for (const grade of ['had', 'not'] as const) {
      const button = first.locator(`[data-practice-grade="${grade}"]`);
      // A real <button type="button">: focusable, Enter/Space-activated and
      // announced as a button for free — none of which a div can claim.
      expect(
        await button.evaluate((el) => el.tagName),
        'the grade control must be a real button',
      ).toBe('BUTTON');
      await expect(button).toHaveAttribute('type', 'button');
      const box = await button.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }

    // The pair reads as one question's answer rather than two loose buttons,
    // and the group's name resolves to visible text on the page.
    const group = first.locator('.practice-check__actions');
    await expect(group).toHaveAttribute('role', 'group');
    const labelId = await group.getAttribute('aria-labelledby');
    expect(labelId).toBeTruthy();
    await expect(page.locator(`#${labelId}`)).toHaveText(
      'How did question 1 go?',
    );
  });

  test('they ship `disabled` in the static HTML and enable on hydrate', async ({
    page,
    request,
  }) => {
    // The Visualizer's A3 pattern: a click that lands before the island runs
    // must not silently do nothing. Read from the server response, not the live
    // DOM — by the time Playwright can query the page the script has already
    // flipped them, so the DOM cannot testify about what was SHIPPED.
    const html = await (await request.get(LESSON_URL)).text();
    const tags = html.match(/<button[^>]*data-practice-grade="[^"]*"[^>]*>/g);
    expect(tags?.length ?? 0).toBeGreaterThanOrEqual(2);
    for (const tag of tags ?? []) expect(tag).toContain('disabled');

    await page.goto(LESSON_URL);
    await openQuestion(page, 0);
    await expect(
      question(page, 0).locator('[data-practice-grade="had"]'),
    ).toBeEnabled();
  });

  test('the disclosure underneath is still a plain <details> with a unique label', async ({
    page,
  }) => {
    await page.goto(LESSON_URL);
    const count = await page.locator('[data-practice-check]').count();

    // M7.1/CNT-8 made every summary unique for WCAG 2.4.6 — three identical
    // "Show answer" links are three unlabelled links to a screen-reader user.
    // M8 composes AROUND this disclosure, so the fix must survive it.
    const summaries = await page
      .locator('[data-practice-check] summary')
      .allInnerTexts();
    expect(summaries).toEqual(
      Array.from(
        { length: count },
        (_, i) => `Show answer to question ${i + 1}`,
      ),
    );
    expect(new Set(summaries).size).toBe(count);

    // Native disclosure semantics, not a re-implementation: the element is a
    // <details> and the `open` attribute is what changes.
    const details = question(page, 0).locator('details.collapsible');
    await expect(details).toHaveCount(1);
    await expect(details).not.toHaveAttribute('open', /.*/);
    await openQuestion(page, 0);
    await expect(details).toHaveAttribute('open', '');
  });

  test('the retrieval prompt sits ABOVE the answer, where it can still be obeyed', async ({
    page,
  }) => {
    await page.goto(LESSON_URL);
    const root = question(page, 0);
    await expect(root.locator('.practice-check__prompt')).toHaveText(
      'Answer it in your head or on paper first.',
    );

    // Order is the whole point — a prompt to attempt first, revealed after the
    // answer, is an instruction nobody can follow. DOM order is what a screen
    // reader and a keyboard user actually meet.
    const promptFirst = await root.evaluate((el) => {
      const prompt = el.querySelector('.practice-check__prompt');
      const details = el.querySelector('details');
      return Boolean(
        prompt &&
        details &&
        prompt.compareDocumentPosition(details) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });
    expect(promptFirst).toBe(true);
  });
});

test.describe('keyboard operation', () => {
  test('tab reaches both grades; Enter and Space choose one', async ({
    page,
  }) => {
    await page.goto(LESSON_URL);
    const root = question(page, 0);

    // Open the disclosure from the keyboard, the way it is actually used.
    await root.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(root.locator('.collapsible__content')).toBeVisible();

    await page.keyboard.press('Tab');
    await expect(root.locator('[data-practice-grade="had"]')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(root.locator('[data-practice-grade="had"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await page.keyboard.press('Tab');
    await expect(root.locator('[data-practice-grade="not"]')).toBeFocused();
    await page.keyboard.press(' ');
    await expect(root.locator('[data-practice-grade="not"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // One grade at a time: choosing the other releases the first.
    await expect(root.locator('[data-practice-grade="had"]')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  test('grading never steals focus or closes the answer', async ({ page }) => {
    await page.goto(LESSON_URL);
    const root = question(page, 0);
    await openQuestion(page, 0);
    const had = root.locator('[data-practice-grade="had"]');
    await had.click();

    // Two islands repaint on this click (the footer and the header's pips). A
    // repaint that moved focus would strand a keyboard user mid-section, and a
    // disclosure that closed itself would hide the answer they are grading.
    await expect(had).toBeFocused();
    await expect(root.locator('.collapsible__content')).toBeVisible();
  });

  test('a click on the button GLYPH grades the question too', async ({
    page,
  }) => {
    // The lesson header listens for these clicks by delegation on `document`,
    // matching with `closest()`. An SVG child is what a pointer usually lands
    // on, and `closest()` from an SVG element is exactly where that pattern
    // fails if it is ever rewritten as a `target.matches()` check.
    await page.goto(LESSON_URL);
    const total = await page.locator('[data-practice-check]').count();
    // Every question but the last through the button, so the LAST one — the
    // grade that completes the bar and therefore changes what the header shows —
    // is the one delivered by a click on the glyph.
    for (let i = 0; i < total - 1; i += 1) await gradeQuestion(page, i, 'had');

    const last = question(page, total - 1);
    await openQuestion(page, total - 1);
    await last
      .locator('[data-practice-grade="had"] .practice-check__glyph')
      .click();

    await expect(last.locator('[data-practice-grade="had"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // The header repainted from that click, which is the delegation working.
    await expect(headerPips(page)).toHaveAttribute('data-stage', 'practiced');
  });
});

test.describe('the chosen grade is never colour alone', () => {
  test('a shape appears inside the chosen button, and the label never changes', async ({
    page,
  }) => {
    await page.goto(LESSON_URL);
    const root = question(page, 0);
    await openQuestion(page, 0);
    const had = root.locator('[data-practice-grade="had"]');
    const not = root.locator('[data-practice-grade="not"]');

    // The visible label is CONSTANT (M7.1 CMP-12): a toggle's state belongs in
    // `aria-pressed`, and renaming the label as well made assistive tech read
    // the state twice ("Completed, pressed").
    await expect(had).toHaveText('I had it');
    await had.click();
    await expect(had).toHaveText('I had it');

    const displays = async () =>
      page.evaluate(() => {
        const root = document.querySelector('[data-practice-check]')!;
        const dot = (grade: string) =>
          getComputedStyle(
            root.querySelector(
              `[data-practice-grade="${grade}"] .practice-check__dot`,
            )!,
          ).display;
        return { had: dot('had'), not: dot('not') };
      });

    // The glyph's ring gains a DOT — a shape difference, so the state survives
    // colour blindness and forced colours, where the brand fill does not.
    expect(await displays()).toEqual({ had: 'inline', not: 'none' });
    await not.click();
    expect(await displays()).toEqual({ had: 'none', not: 'inline' });

    // …and it still holds when the engine throws the author's colours away.
    await page.emulateMedia({ forcedColors: 'active' });
    expect(await displays()).toEqual({ had: 'none', not: 'inline' });
  });
});

test.describe('"Not yet" costs nothing and can always be taken back', () => {
  test('it records an explicit 0, earns nothing, and subtracts nothing', async ({
    page,
  }) => {
    await page.goto(LESSON_URL);
    await gradeQuestion(page, 0, 'not');

    // Stored, because it was an explicit self-report — but it is not a `1`, so
    // it earns no stage, and there is no state below "nothing recorded" for it
    // to cost.
    expect((await readRecord(page, LESSON))?.checks[0]).toBe(0);
    await expect(headerPips(page)).not.toHaveAttribute('data-stage');
  });

  test('the first "Not yet" moves the tally FORWARD — activity, not achievement', async ({
    page,
  }) => {
    // The line counts questions ANSWERED, not questions passed. A tally of
    // passes would meet the reader's first honest self-report with a zero —
    // precisely the loss frame the design killed XP, streaks and first-try
    // bonuses to avoid, and an incentive to lie to a store that grades nothing.
    await page.goto(LESSON_URL);
    const total = await page.locator('[data-practice-check]').count();
    await gradeQuestion(page, 0, 'not');

    const tally = page.locator('[data-practice-tally]').first();
    await expect(tally).toHaveText(`1 of ${total} answered`);
    await expect(tally).not.toHaveText(/^0 of/);
    await expect(status(page)).toHaveText(`1 of ${total} answered`);

    // …and an "I had it" on the next question moves the same line by the same
    // one, so the two grades are indistinguishable as ACTIVITY. Nothing on
    // screen ranks them; only the (unshown) Practiced bar tells them apart.
    await gradeQuestion(page, 1, 'had');
    await expect(tally).toHaveText(`2 of ${total} answered`);

    // No ratio, no percentage, at any point in the sequence.
    for (const line of [
      await tally.innerText(),
      await status(page).innerText(),
    ])
      expect(line).not.toMatch(/%|\d\s*\/\s*\d/);
  });

  test('the copy around it never scolds, warns or scores', async ({ page }) => {
    await page.goto(LESSON_URL);
    await gradeAll(page, 'not');

    const footer = await page
      .locator('[data-practice-footer]')
      .first()
      .innerText();
    const announced = (await status(page).textContent()) ?? '';
    for (const copy of [footer, announced]) {
      // No loss-framing, no second currency, no scoreboard — the killed list
      // (`docs/m8-gamification.md`) is a review criterion, not a preference.
      expect(copy).not.toMatch(
        /\b(wrong|incorrect|failed?|missed|behind|overdue|streak|score|points?|xp|level)\b/i,
      );
      // …and no ratio or percentage during a learning act: a grade the reader
      // protects is a grade that stops them attempting hard questions.
      expect(copy).not.toMatch(/%/);
      expect(copy).not.toMatch(/\d\s*\/\s*\d/);
    }
  });

  test('regrading it to "I had it" still reaches Practiced', async ({
    page,
  }) => {
    await page.goto(LESSON_URL);
    const total = await page.locator('[data-practice-check]').count();
    await gradeQuestion(page, 0, 'not');
    for (let i = 1; i < total; i += 1) await gradeQuestion(page, i, 'had');
    expect((await readRecord(page, LESSON))?.practicedAt).toBeNull();

    await gradeQuestion(page, 0, 'had');
    expect((await readRecord(page, LESSON))?.practicedAt).toEqual(
      expect.any(String),
    );
    await expect(
      page.locator('[data-lesson-stage] [data-mastery-pips]'),
    ).toHaveAttribute('data-stage', 'practiced');
  });

  test('the LATEST claim stands — a "Not yet" after an "I had it" is believed', async ({
    page,
  }) => {
    // The reader's most recent self-report is the honest one. A store that kept
    // the flattering answer would keep crediting a question they have just
    // explicitly said they did not have — the product overriding a self-report
    // it has no evidence against, which is the same defect as inventing one.
    await page.goto(LESSON_URL);
    await gradeAll(page, 'had');
    const passed = await readRecord(page, LESSON);
    expect(passed?.practicedAt).toEqual(expect.any(String));

    await gradeQuestion(page, 0, 'not');

    const root = question(page, 0);
    await expect(root.locator('[data-practice-grade="not"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(root.locator('[data-practice-grade="had"]')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    const regraded = await readRecord(page, LESSON);
    expect(regraded?.checks[0]).toBe(0);

    // …and the STAGE it already earned does not move: no stage in this system
    // decays or demotes, so the correction changes what this visit claims and
    // nothing the reader reached. Costing them a pip for being honest would
    // teach them not to be.
    expect(regraded?.practicedAt).toBe(passed?.practicedAt);
    await expect(headerPips(page)).toHaveAttribute('data-stage', 'practiced');

    // The claim is persisted, not just painted: a reload still shows "Not yet".
    await page.reload();
    await openQuestion(page, 0);
    await expect(root.locator('[data-practice-grade="not"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

test.describe('the tally is announced once, politely', () => {
  test('exactly one live region per lesson, shipped empty and outside the disclosure', async ({
    page,
  }) => {
    await page.goto(LESSON_URL);
    await expect(status(page)).toHaveCount(1);
    // `role="status"` carries an implicit `aria-live="polite"`; a second
    // explicit attribute would be redundant, and `assertive` would interrupt.
    await expect(status(page)).toHaveAttribute('role', 'status');
    await expect(status(page)).not.toHaveAttribute('aria-live', /.*/);
    await expect(status(page)).toHaveClass(/sr-only/);
    await expect(status(page)).toHaveText('');

    // A live region inside a closed <details> is not rendered, and updates to a
    // non-rendered region are never announced — so it must sit outside it.
    expect(
      await status(page).evaluate((el) => Boolean(el.closest('details'))),
      'the live region must not be inside the disclosure',
    ).toBe(false);
  });

  test('nothing is announced on load, even with a full record already stored', async ({
    page,
  }) => {
    await seedMastery(page, LESSON, {
      practicedAt: daysAgo(10),
      masteredAt: null,
      checks: [1, 1, 1],
    });
    await page.goto(LESSON_URL);

    // The tally is painted…
    await openQuestion(page, 0);
    await expect(page.locator('[data-practice-tally]').first()).toHaveText(
      /^3 of 3 answered$/,
    );
    // …and nothing is said, because nobody acted.
    await expect(status(page)).toHaveText('');
  });

  test('one click says one thing — the tally, not a history', async ({
    page,
  }) => {
    await page.goto(LESSON_URL);
    const total = await page.locator('[data-practice-check]').count();

    await gradeQuestion(page, 0, 'had');
    await expect(status(page)).toHaveText(`1 of ${total} answered`);
    await gradeQuestion(page, 1, 'had');
    // Replaced, never appended: a live region that accumulates re-reads the
    // whole session on every grade.
    await expect(status(page)).toHaveText(`2 of ${total} answered`);

    // The visible tally is `aria-hidden` because this region already says it —
    // M7.1/CMP-4: two announcements for one action read as a stutter.
    await expect(page.locator('[data-practice-tally]').first()).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    // The device-scope sentence is NOT hidden: it is a promise, in every mode.
    await expect(
      page.locator('.practice-check__scope').first(),
    ).not.toHaveAttribute('aria-hidden', /.*/);
  });

  test('pressing the same grade twice announces ONCE', async ({ page }) => {
    // Assigning a live region the string it already holds still replaces its
    // text node, and assistive tech still reads it out — so "only rewrite when
    // the words changed" is a real rule with a silent failure mode. A screen
    // reader repeating "1 of 3 answered" at every stray click is exactly the
    // stutter M7.1/CMP-4 removed; nothing here is allowed to reintroduce it.
    await page.goto(LESSON_URL);
    const total = await page.locator('[data-practice-check]').count();
    await openQuestion(page, 0);
    const announcements = await watchRewrites(status(page));

    const had = question(page, 0).locator('[data-practice-grade="had"]');
    await had.click();
    await expect(status(page)).toHaveText(`1 of ${total} answered`);
    expect(await announcements(), 'the first grade must be announced').toBe(1);

    // Same question, same grade, same resulting tally: the region must not be
    // touched. The button itself is not silent — its `aria-pressed` is already
    // the announcement of what was pressed.
    await had.click();
    await expect(had).toHaveAttribute('aria-pressed', 'true');
    await expect(status(page)).toHaveText(`1 of ${total} answered`);
    expect(
      await announcements(),
      'an unchanged tally must not be re-announced',
    ).toBe(1);

    // A regrade that leaves the COUNT unmoved is the same case: the question
    // was already answered, so the sentence is already true and already read.
    await question(page, 0).locator('[data-practice-grade="not"]').click();
    await expect(status(page)).toHaveText(`1 of ${total} answered`);
    expect(await announcements()).toBe(1);

    // …and a grade that does move it is announced, so silence is a decision.
    await gradeQuestion(page, 1, 'had');
    await expect(status(page)).toHaveText(`2 of ${total} answered`);
    expect(await announcements()).toBe(2);
  });
});

test.describe('the component reached every lesson', () => {
  test('all 15 Practice sections are self-gradable, with no bare disclosure left', async ({
    page,
  }) => {
    const lessons = await curriculum(page);
    expect(lessons.length).toBeGreaterThanOrEqual(15);

    for (const lesson of lessons) {
      await page.goto(`/learn/${lesson.slug}`);
      const shape = await page.evaluate(() => {
        const heading = document.getElementById('practice');
        const section: Element[] = [];
        for (
          let node = heading?.nextElementSibling ?? null;
          node && node.tagName !== 'H2';
          node = node.nextElementSibling
        ) {
          section.push(node);
        }
        const details = section.flatMap((node) => [
          ...node.querySelectorAll('details'),
          ...(node.tagName === 'DETAILS' ? [node] : []),
        ]);
        const checks = [
          ...document.querySelectorAll<HTMLElement>('[data-practice-check]'),
        ];
        return {
          details: details.length,
          selfGradable: details.filter((d) =>
            d.closest('[data-practice-check]'),
          ).length,
          checks: checks.length,
          totals: [...new Set(checks.map((c) => c.dataset['total']))],
          indices: checks.map((c) => c.dataset['index']),
          slugs: [...new Set(checks.map((c) => c.dataset['slug']))],
          regions: document.querySelectorAll('[data-practice-status]').length,
        };
      });

      // Every Practice answer is wrapped: a lesson that kept a bare
      // `Collapsible` would quietly opt out of the whole mechanic, and its
      // reader could never reach Practiced.
      expect(
        shape.details,
        `${lesson.slug}: practice questions`,
      ).toBeGreaterThan(0);
      expect(shape.selfGradable, `${lesson.slug}: bare disclosure left`).toBe(
        shape.details,
      );
      // The denominator the Practiced bar divides by must be the number of
      // questions actually on the page — a stale `total` moves the bar for the
      // whole lesson, and `checks[]` alone cannot detect it.
      expect(shape.totals, `${lesson.slug}: one shared total`).toEqual([
        String(shape.checks),
      ]);
      // 1-based, contiguous and unique: the index decides which stored grade a
      // question owns, so a duplicate would have two questions share one slot.
      expect(shape.indices, `${lesson.slug}: question indices`).toEqual(
        Array.from({ length: shape.checks }, (_, i) => String(i + 1)),
      );
      // The record key comes from frontmatter, so a rename cannot leave a
      // literal behind pointing at another lesson's progress.
      expect(shape.slugs, `${lesson.slug}: record owner`).toEqual([
        lesson.slug,
      ]);
      expect(shape.regions, `${lesson.slug}: live regions`).toBe(1);
    }
  });
});

test.describe('print', () => {
  test('the device-local controls come off the paper', async ({ page }) => {
    await page.goto(LESSON_URL);
    await openQuestion(page, 0);
    await page.emulateMedia({ media: 'print' });

    // On paper the sheet becomes a study sheet: the answers are revealed by
    // global.css (asserted in `m7-print-hcm.spec.ts`), and controls that can
    // only write to a device have no meaning there.
    await expect(page.locator('[data-practice-footer]').first()).toBeHidden();
    // The prompt is static copy that reads perfectly well on paper, so it stays.
    await expect(page.locator('.practice-check__prompt').first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// axe, scoped to the M8 surfaces. A whole-page lesson scan is already covered
// (`m4-lessons.spec.ts`) and carries the tracked Shiki code-comment contrast
// debt; scoping to the new components lets this one gate at zero SERIOUS as
// well as zero critical, in the state that only exists after a reader acts.
// ---------------------------------------------------------------------------
for (const theme of ['light', 'dark'] as const) {
  test(`axe: graded practice checks (${theme} theme) — zero critical, zero serious`, async ({
    page,
  }) => {
    await page.addInitScript((value) => {
      localStorage.setItem('theme', value);
    }, theme);
    await page.goto(LESSON_URL);
    await gradeQuestion(page, 0, 'had');
    await gradeQuestion(page, 1, 'not');
    await openQuestion(page, 2);
    await expect(page.locator('[data-practice-saved]').first()).toBeVisible();

    const results = await new AxeBuilder({ page })
      .include('[data-practice-check]')
      .include('[data-lesson-stage]')
      .analyze();
    const blocking = results.violations
      .filter((v) => v.impact === 'critical' || v.impact === 'serious')
      .map((v) => `${v.impact} ${v.id}: ${v.help}`);
    expect(blocking).toEqual([]);
  });
}

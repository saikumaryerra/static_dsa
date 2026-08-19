/**
 * M8.2 — Predict-the-Step, in the browser (`docs/m8-gamification.md` → "M8.2 —
 * Retrieval engine"; spec §11.2 `predictStep`, §11.3 "no mechanic may fork the
 * pipeline").
 *
 * The pure half of this mechanic — which step is worth asking about, and what
 * the answer is — lives in `tests/unit/predictors.test.ts`, where the graders
 * are exercised against real traces with no DOM at all. What only a browser can
 * answer is everything below: whether the mode exists exactly where a predictor
 * does, whether it leaves the device untouched, whether a keyboard reader keeps
 * their focus through a graded answer, and — the invariant this file exists for
 * — whether the reader is ever shown a score.
 *
 * THE CALM INVARIANT, stated once here because half these tests defend it: **no
 * accuracy ratio and no percentage may be displayed during a learning act.** The
 * session line reports activity ("7 answered · 2 skipped") and nothing else. A
 * beginner shown an accuracy figure starts protecting it instead of attempting
 * the hard predictions, and a wrong-but-attempted prediction is this mechanic
 * WORKING. Every assertion that looks pedantic below is guarding that.
 *
 * Scope note on ratio scans: they are applied to the predict surfaces, never to
 * the whole page, because the step counter legitimately renders "2 / 6". A
 * page-wide `\d\s*\/\s*\d` ban would fail on the transport rather than on a
 * design violation — and a test that cries wolf gets deleted, which is worse
 * than not having it. The whole-page pass instead bans the vocabulary a score
 * would have to use.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  blockStorage,
  curriculum,
  headerLabel,
  masteryKey,
  readKey,
  readRecord,
  trackMastery,
  trackPageErrors,
} from './utils/mastery';
import {
  activityChip,
  answer,
  counter,
  enablePredict,
  explanation,
  hydrateViz,
  predictChoices,
  predictCopy,
  predictNote,
  predictPrompt,
  predictStrip,
  predictToggle,
  runCustomInput,
  storageFingerprint,
} from './utils/predict';

const BINARY = '/learn/binary-search';
const BINARY_SLUG = 'binary-search';
/** The lesson hosts binary search AND linear search; scope to the one with a predictor. */
const BINARY_VIZ = '#viz-binary-search';

/**
 * The authored run `[1,3,5,7,9,11] target=7`: four steps, so three predictable
 * ones (a predictor is contracted to return `null` on the last step).
 *
 * The answers are spelled out rather than derived because deriving them in the
 * test would be a second implementation of the grader — and then a broken
 * grader and a broken test would agree with each other.
 */
const AUTHORED = {
  steps: 4,
  answers: ['Go right', 'Go left', 'Found it'],
} as const;

/**
 * A custom run long enough to reach the session bar (≥5 answers at ≥80%).
 *
 * `[1..20] target=0` probes indices 9, 4, 1, 0 — every value is above the target
 * — and then collapses to the empty window, so the five questions are four "Go
 * left"s and the "Not present" terminal. Six steps in total.
 */
const LONG = {
  array: '[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]',
  target: '0',
  steps: 6,
  answers: ['Go left', 'Go left', 'Go left', 'Go left', 'Not present'],
} as const;

/** Every lesson that ships the toggle, and how many of its visualizers offer it. */
const PREDICT_LESSONS: Record<string, number> = {
  // Binary search has a bespoke four-choice predictor; the linear-search viz on
  // the same page has none.
  'binary-search': 1,
  // Bubble and insertion are the adjacent-swap sorts. Selection defers its swap
  // past the last compare of a pass, so the swap-delta rule would mark a correct
  // reader wrong — it deliberately ships no predictor.
  'sorting-basics': 2,
  // BFS and DFS: "which node comes off the frontier next?" IS the queue-vs-stack
  // distinction the lesson teaches.
  'graph-traversal': 2,
};

/** Opens the binary-search lesson and returns its hydrated visualizer. */
async function openBinary(page: Page, url = BINARY): Promise<Locator> {
  await page.goto(url);
  return hydrateViz(page.locator(BINARY_VIZ));
}

/** Answers the whole authored run correctly (three questions). */
async function answerAuthored(viz: Locator): Promise<void> {
  for (const label of AUTHORED.answers) await answer(viz, label);
}

test.describe('the toggle exists exactly where a predictor does', () => {
  test('every lesson in the curriculum offers it only where one is shipped', async ({
    page,
  }) => {
    // The design names the lessons that gain Predict at ship time (11, 12, 14)
    // and the reasons the others cannot have it — recursion emits no compare
    // steps, DP's `compare` highlights mark cell READS, merge sort has no swaps
    // metric, quick/selection sort defer their swaps. That is a curriculum-wide
    // claim, so it is asserted curriculum-wide: a predictor added to an
    // algorithm whose steps cannot support one would show up here as a toggle on
    // a lesson this map does not list.
    const lessons = await curriculum(page);
    expect(lessons.length).toBeGreaterThanOrEqual(15);

    for (const lesson of lessons) {
      await page.goto(`/learn/${lesson.slug}`);
      const vizzes = await page.locator('[data-viz]').count();
      // Every lesson ships at least one visualization, so "no toggle" below is
      // never just "no visualizer on this page".
      expect(vizzes, `${lesson.slug} should host a visualizer`).toBeGreaterThan(
        0,
      );
      await expect(
        page.locator('[data-viz-predict]'),
        `predict toggles on ${lesson.slug}`,
      ).toHaveCount(PREDICT_LESSONS[lesson.slug] ?? 0);
      // The reason line is part of the mode: neither may exist without the other.
      await expect(
        page.locator('[data-viz-predict-note]'),
        `predict notes on ${lesson.slug}`,
      ).toHaveCount(PREDICT_LESSONS[lesson.slug] ?? 0);
    }
  });

  test('the visualizer beside it, with no predictor, is untouched', async ({
    page,
  }) => {
    // Same page, same island code, one lesson apart: binary search asks
    // questions and linear search does not. This is the sharpest available
    // proof that the toggle follows the ALGORITHM rather than the page.
    await page.goto(BINARY);
    const binary = page.locator('[data-viz][data-algorithm="binary-search"]');
    const linear = page.locator('[data-viz][data-algorithm="linear-search"]');
    await expect(predictToggle(binary)).toHaveCount(1);
    await expect(predictToggle(linear)).toHaveCount(0);
    // The slug the pass would be credited to rides on the viz that can earn it,
    // and only on that one.
    await expect(binary).toHaveAttribute('data-slug', BINARY_SLUG);
    await expect(linear).not.toHaveAttribute('data-slug', /.*/);
  });

  test('a lesson with no predictor hydrates fully and still offers nothing', async ({
    page,
  }) => {
    // DISCRIMINATOR: absence has to be a decision, not a dead island. Merge and
    // quick sort both run here, so the island is provably alive — it simply has
    // no question to ask.
    await page.goto('/learn/sorting-efficient');
    const viz = await hydrateViz(
      page.locator('[data-viz][data-algorithm="quick-sort"]'),
    );
    await expect(viz).toHaveAttribute('data-viz-ready', 'true');
    await expect(counter(viz)).toHaveText(/^1 \/ \d+$/);
    await expect(page.locator('[data-viz-predict]')).toHaveCount(0);
    await expect(page.locator('[data-viz-predict-strip]')).toHaveCount(0);
    await expect(viz).not.toHaveAttribute('data-slug', /.*/);
  });
});

test.describe('the mode is never persisted — it has no storage surface at all', () => {
  test('toggling it on, answering, and reloading leaves the device byte-identical', async ({
    page,
  }) => {
    const viz = await openBinary(page);
    // The baseline is taken AFTER hydration, so anything the page legitimately
    // reads on load has already happened and the comparison is about predict.
    const before = await storageFingerprint(page);

    await enablePredict(viz);
    await answer(viz, AUTHORED.answers[0]!);
    await answer(viz, AUTHORED.answers[1]!);
    // Two answers is under the five-answer session bar, so nothing has been
    // earned either — the store must be untouched, not merely unchanged-looking.
    expect(
      await storageFingerprint(page),
      'predict must write nothing at all',
    ).toBe(before);

    await page.reload();
    const again = await hydrateViz(page.locator(BINARY_VIZ));
    // Off again, with no strip and no session: the mode lasts one page visit.
    await expect(predictToggle(again)).toHaveAttribute('aria-pressed', 'false');
    await expect(predictStrip(again)).toHaveCount(0);
    await expect(predictNote(again)).toBeHidden();
    expect(await storageFingerprint(page)).toBe(before);
  });

  test('a review deep link opens it for the visit and writes nothing', async ({
    page,
  }) => {
    // `?review=1` is the review queue's mechanism, and the reason the design
    // chose a query parameter over a stored flag: there is no preference to
    // rewrite, so a review visit cannot change how the next visit behaves.
    const control = await openBinary(page);
    const before = await storageFingerprint(page);
    await expect(predictToggle(control)).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    const viz = await openBinary(page, `${BINARY}?review=1#practice`);
    await expect(predictToggle(viz)).toHaveAttribute('aria-pressed', 'true');
    await expect(predictStrip(viz)).toBeVisible();
    expect(await storageFingerprint(page)).toBe(before);

    // …and the parameter's effect ends with the URL that carried it.
    const plain = await openBinary(page);
    await expect(predictToggle(plain)).toHaveAttribute('aria-pressed', 'false');
    expect(await storageFingerprint(page)).toBe(before);
  });

  test('the review deep link never reaches a visualizer that cannot ask', async ({
    page,
  }) => {
    await page.goto(`${BINARY}?review=1#practice`);
    const linear = await hydrateViz(
      page.locator('[data-viz][data-algorithm="linear-search"]'),
    );
    await expect(predictToggle(linear)).toHaveCount(0);
    await expect(predictStrip(linear)).toHaveCount(0);
    // The transport on that island is fully available: `?review=1` changed
    // nothing for a viz with no predictor.
    await expect(linear.locator('[data-viz-play]')).toHaveAttribute(
      'aria-disabled',
      'false',
    );
  });
});

test.describe('while predicting, watching is unavailable — and nothing is disabled', () => {
  test('play and the scrubber are aria-disabled, keep their focus, and refuse to act', async ({
    page,
  }) => {
    const viz = await openBinary(page);
    const play = viz.locator('[data-viz-play]');
    const slider = viz.locator('[data-viz-slider]');
    const note = predictNote(viz);
    await expect(play).toHaveAttribute('aria-disabled', 'false');

    await enablePredict(viz);

    for (const control of [play, slider]) {
      // A11Y-1: `aria-disabled`, never the `disabled` attribute — the real
      // attribute would drop a focused control's focus onto <body> and take the
      // island's own Space/←/→ shortcuts with it.
      //
      // The DOM PROPERTY is what distinguishes them, so it is what is asserted:
      // Playwright's own `toBeDisabled()` treats `aria-disabled="true"` as
      // disabled, so it cannot tell the two apart — and the difference is the
      // whole point of this test.
      await expect(control).toHaveAttribute('aria-disabled', 'true');
      await expect(
        control,
        'must stay a real, focusable control',
      ).toHaveJSProperty('disabled', false);
      // "Unavailable" is never left unexplained: both point at the same reason.
      const describedBy = await control.getAttribute('aria-describedby');
      expect(describedBy).toBe(await note.getAttribute('id'));
    }
    await expect(note).toBeVisible();
    await expect(note).toContainText(
      'Step forward moves on without answering.',
    );
    // The note also carries the reason the RUN TABLE is gone (Plan C §4): the
    // ledger renders `trace[i + 1]`, which is the step every predictor grades
    // against, so predicting hides it. It names the table rather than "the step
    // slider", which Plan C made a focus-revealed control the reader cannot see
    // at rest.
    await expect(note).toContainText('the run table is hidden');

    // Focus survives the mode change and the control still takes focus…
    await play.focus();
    await expect(play).toBeFocused();
    // …but activation does nothing: Space is the island's play shortcut and it
    // goes through the same availability gate the button does.
    await page.keyboard.press('Space');
    await expect(counter(viz)).toHaveText(`1 / ${AUTHORED.steps}`);
    await expect(play).toBeFocused();

    // The scrubber cannot be dragged past a question either: the handler
    // declines and snaps the thumb back to where the trace actually is.
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await expect(counter(viz)).toHaveText(`1 / ${AUTHORED.steps}`);
    await expect(slider).toHaveValue('0');
    await expect(slider).toBeFocused();
  });

  test('turning it back off restores the transport exactly as it was', async ({
    page,
  }) => {
    const viz = await openBinary(page);
    const play = viz.locator('[data-viz-play]');
    await enablePredict(viz);
    await predictToggle(viz).click();

    await expect(predictToggle(viz)).toHaveAttribute('aria-pressed', 'false');
    await expect(play).toHaveAttribute('aria-disabled', 'false');
    await expect(play).not.toHaveAttribute('aria-describedby', /.*/);
    await expect(predictNote(viz)).toBeHidden();
    await expect(predictStrip(viz)).toBeHidden();
    // The player still works: nothing about the mode is sticky.
    await viz.locator('[data-viz-forward]').click();
    await expect(counter(viz)).toHaveText(`2 / ${AUTHORED.steps}`);
  });
});

test.describe('answering is the act, and the explanation is the feedback', () => {
  test('one answer advances exactly one step and lands on the step it predicted', async ({
    page,
  }) => {
    const viz = await openBinary(page);
    await enablePredict(viz);

    // The question is about a probe that has not happened yet, which is what
    // makes it a prediction rather than a reading of what is already on screen —
    // and the prompt says WHICH probe. Step 0 has none of its own, so it asks
    // about the first (the sweep below covers every other step).
    await expect(predictPrompt(viz)).toHaveText(
      'What happens at the first probe?',
    );
    await expect(predictChoices(viz)).toHaveCount(4);
    await expect(counter(viz)).toHaveText(`1 / ${AUTHORED.steps}`);

    await answer(viz, AUTHORED.answers[0]!);
    await expect(counter(viz)).toHaveText(`2 / ${AUTHORED.steps}`);

    // ONE live-region write carries both the verdict and the step's own
    // explanation, so a screen reader hears "Correct — <why>" as one utterance
    // instead of two competing ones.
    const verdict = viz.locator('[data-verdict]');
    await expect(verdict).toHaveAttribute('data-verdict', 'right');
    await expect(verdict).toContainText('Correct');
    await expect(explanation(viz)).toContainText('middle index 2 holds 5');
    // Never colour alone (§12): the tick is decoration beside a real word.
    await expect(verdict.locator('[aria-hidden="true"]')).toHaveCount(1);
    await expect(explanation(viz)).toHaveAttribute('aria-live', 'polite');
  });

  test('a wrong answer advances too, and costs the reader nothing', async ({
    page,
  }) => {
    const viz = await openBinary(page);
    const before = await storageFingerprint(page);
    await enablePredict(viz);

    // Errorful generation is the point: the first miss is the intervention
    // working, so it must not be priced.
    await answer(viz, 'Not present');
    await expect(counter(viz)).toHaveText(`2 / ${AUTHORED.steps}`);
    const verdict = viz.locator('[data-verdict]');
    await expect(verdict).toHaveAttribute('data-verdict', 'wrong');
    // "Not quite", never "Wrong" — and never a loss frame.
    await expect(verdict).toContainText('Not quite');
    await expect(explanation(viz)).toContainText('Discard the left half');
    await expect(activityChip(viz)).toHaveText('1 answered · 0 skipped');
    // The next question is still asked, unchanged, with every choice available.
    await expect(predictChoices(viz)).toHaveCount(4);
    expect(await storageFingerprint(page)).toBe(before);
  });

  test('stepping forward is a no-penalty skip, from the button and the arrow key', async ({
    page,
  }) => {
    const viz = await openBinary(page);
    await enablePredict(viz);

    // Autonomy is the design's stated reason for keeping step-forward live: a
    // reader who does not want to guess is never cornered into it.
    await viz.locator('[data-viz-forward]').click();
    await expect(counter(viz)).toHaveText(`2 / ${AUTHORED.steps}`);
    await expect(activityChip(viz)).toHaveText('0 answered · 1 skipped');
    // A skip is NOT a wrong answer: no verdict is written.
    await expect(viz.locator('[data-verdict]')).toHaveCount(0);

    // The keyboard route is the same route — the ← / → keys are advertised as
    // equivalent to the buttons, so they count the skip identically.
    await viz.locator('[data-viz-canvas]').click();
    await page.keyboard.press('ArrowRight');
    await expect(counter(viz)).toHaveText(`3 / ${AUTHORED.steps}`);
    await expect(activityChip(viz)).toHaveText('0 answered · 2 skipped');

    // Answering after skipping still counts as answering.
    await answer(viz, AUTHORED.answers[2]!);
    await expect(activityChip(viz)).toHaveText('1 answered · 2 skipped');
  });

  test('the prompt the reader sees never punishes them for reading the screen', async ({
    page,
  }) => {
    // THE REGRESSION GUARD, at the surface the reader actually meets. Grading is
    // one step ahead on purpose — grading the current step would let the answer
    // be read straight off the explanation the strip sits above — so on every
    // step but the first, the screen already shows a RESOLVED comparison and
    // names its direction while the graded answer belongs to the probe after it.
    // At index 1 of this authored run the explanation says "search the right"
    // and the answer is "Go left": a prompt that said only "next" marked a
    // reader wrong for reading correctly, twice in three questions.
    //
    // `tests/unit/binary-search.test.ts` holds the grader to this. What only a
    // browser can add is that the fix REACHES the reader: the island writes
    // `question.prompt` into the strip, so a prompt corrected in the algorithm
    // and dropped on the way to the DOM would pass there and fail here.
    const viz = await openBinary(page);
    await enablePredict(viz);

    for (let i = 0; i < AUTHORED.answers.length; i += 1) {
      // Synchronises on the step before reading either surface: both are written
      // by the same handler, so a settled counter means a settled strip.
      await expect(counter(viz)).toHaveText(`${i + 1} / ${AUTHORED.steps}`);
      const prompt = (await predictPrompt(viz).innerText())
        .replace(/\s+/g, ' ')
        .trim();
      const onScreen = (await explanation(viz).innerText()).replace(
        /\s+/g,
        ' ',
      );
      const where = `step ${i + 1}: prompt "${prompt}" over "${onScreen}"`;

      // Every question names the probe it is about…
      expect(prompt, where).toMatch(/\b(first|next) probe\b/);
      // …and the moment the step on screen has resolved a direction, the prompt
      // must put the question AFTER it. This is the guard, and it is on the
      // PROMPT rather than on the answer: two consecutive probes may legitimately
      // run the same way, so "the answer never matches what the explanation says"
      // is false for correct traces.
      if (/search the (left|right)/.test(onScreen)) {
        expect(prompt, where).toBe(
          'After this step, what happens at the next probe?',
        );
      }
      // …and it gives nothing away in either direction.
      expect(prompt, where).not.toMatch(/left|right|found|present/i);

      await answer(viz, AUTHORED.answers[i]!);
    }
  });

  test('the last step asks nothing rather than asking the unanswerable', async ({
    page,
  }) => {
    const viz = await openBinary(page);
    await enablePredict(viz);
    await answerAuthored(viz);

    // A predictor returns `null` where there is no successor to grade against.
    await expect(counter(viz)).toHaveText(
      `${AUTHORED.steps} / ${AUTHORED.steps}`,
    );
    await expect(predictChoices(viz)).toHaveCount(0);
    await expect(predictStrip(viz)).toHaveAttribute('data-idle', '');
    await expect(predictPrompt(viz)).toHaveText('No prediction at this step.');
  });
});

test.describe('the keyboard path through the question strip', () => {
  test('the choices are a labelled group, reachable by Tab and chosen with Enter', async ({
    page,
  }) => {
    const viz = await openBinary(page);
    await enablePredict(viz);

    // The buttons are announced as the answers to the question above them, and
    // the label is the prompt itself — no second string to fall out of step.
    const group = predictStrip(viz).locator('[role="group"]');
    const promptId = await predictPrompt(viz).getAttribute('id');
    expect(promptId).toBeTruthy();
    await expect(group).toHaveAttribute('aria-labelledby', promptId!);

    const first = predictChoices(viz).first();
    await first.focus();
    await expect(first).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(counter(viz)).toHaveText(`2 / ${AUTHORED.steps}`);
    await expect(activityChip(viz)).toHaveText('1 answered · 0 skipped');
  });

  test('grading never drops focus — not mid-run, not at the end of the trace', async ({
    page,
  }) => {
    const viz = await openBinary(page);
    await enablePredict(viz);

    // The strip is REDRAWN under the reader's own finger on every answer. If the
    // buttons were replaced rather than reconciled, focus would land on <body>
    // and a keyboard reader would lose their place in the middle of the act the
    // mechanic exists to encourage.
    await predictChoices(viz).first().focus();
    await page.keyboard.press('Enter');
    expect(
      await page.evaluate(() => document.activeElement?.tagName),
      'focus must never fall to <body>',
    ).toBe('BUTTON');
    await expect(predictChoices(viz).first()).toBeFocused();

    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    // The final answer lands on a step with no question, so there is no choice
    // button left to hold focus: it moves to the control that carries the reader
    // onward, never to nothing.
    await expect(counter(viz)).toHaveText(
      `${AUTHORED.steps} / ${AUTHORED.steps}`,
    );
    await expect(viz.locator('[data-viz-forward]')).toBeFocused();
  });
});

test.describe('activity, never accuracy — the session is not scored', () => {
  test('the chip counts what was done, in words, and stays hidden until something is', async ({
    page,
  }) => {
    const viz = await openBinary(page);
    await enablePredict(viz);

    // A fresh session opens with no zeros staring back at the reader.
    await expect(activityChip(viz)).toBeHidden();

    await answer(viz, AUTHORED.answers[0]!);
    await expect(activityChip(viz)).toHaveText('1 answered · 0 skipped');
    await viz.locator('[data-viz-forward]').click();
    await expect(activityChip(viz)).toHaveText('1 answered · 1 skipped');
    // The exact shape, pinned: two counts of ACTIVITY joined by a separator.
    // Anything with a slash, a percent or the word "correct" in it is a score.
    await expect(activityChip(viz)).toHaveText(/^\d+ answered · \d+ skipped$/u);
  });

  test('a session of nothing but wrong answers is reported identically', async ({
    page,
  }) => {
    const viz = await openBinary(page);
    await enablePredict(viz);

    // The state where a scoreboard would be most tempting — and most damaging.
    await answer(viz, 'Not present');
    await answer(viz, 'Not present');
    await answer(viz, 'Not present');

    await expect(activityChip(viz)).toHaveText('3 answered · 0 skipped');
    for (const line of await predictCopy(viz)) {
      expect(line, `percentage in "${line}"`).not.toMatch(/%/);
      expect(line, `ratio in "${line}"`).not.toMatch(/\d\s*\/\s*\d/);
      expect(line, `tally of rightness in "${line}"`).not.toMatch(
        /\b\d+\s+(correct|right|wrong|missed|incorrect)\b/i,
      );
      expect(line, `scoreboard vocabulary in "${line}"`).not.toMatch(
        /\b(score|accuracy|xp|points?|streak|rank|grade|out of)\b/i,
      );
    }
    // Nothing anywhere on the page turned into a scoreboard either.
    const text = await page.locator('body').innerText();
    expect(text).not.toMatch(/\b\d+\s*%/);
    expect(text).not.toMatch(/(accuracy|% correct|out of \d+ correct)/i);
  });

  test('no score appears at any point of a full five-answer session', async ({
    page,
  }) => {
    const viz = await openBinary(page);
    await runCustomInput(viz, LONG.array, LONG.target, LONG.steps);
    await enablePredict(viz);

    // Sampled after EVERY answer, including the one that crosses the bar: a
    // summary that appeared only at the end would pass a test that looked once.
    for (const [i, label] of LONG.answers.entries()) {
      await answer(viz, label);
      await expect(activityChip(viz)).toHaveText(
        `${i + 1} answered · 0 skipped`,
      );
      for (const line of await predictCopy(viz)) {
        expect(line, `percentage after answer ${i + 1}: "${line}"`).not.toMatch(
          /%/,
        );
        expect(line, `ratio after answer ${i + 1}: "${line}"`).not.toMatch(
          /\d\s*\/\s*\d/,
        );
      }
    }
    // …and crossing it announces nothing. The promotion is silent by design:
    // the only celebration in the system is the track milestone.
    await expect(activityChip(viz)).toHaveText('5 answered · 0 skipped');
  });
});

test.describe('predict feeds the mastery ladder, silently', () => {
  test('a qualifying session records a pass through the shared store', async ({
    page,
  }) => {
    const viz = await openBinary(page);
    expect(await readKey(page, masteryKey(BINARY_SLUG))).toBeNull();

    await runCustomInput(viz, LONG.array, LONG.target, LONG.steps);
    await enablePredict(viz);
    for (const label of LONG.answers) await answer(viz, label);

    // The write is asynchronous (the store is imported on demand so a page that
    // merely SHOWS a visualization does not ship it), so poll rather than
    // assume — a fixed wait here would be the flake this suite refuses.
    await expect
      .poll(
        async () => (await readRecord(page, BINARY_SLUG))?.practicedAt ?? null,
      )
      .not.toBeNull();
    const record = await readRecord(page, BINARY_SLUG);
    // Practiced, and ONLY Practiced: the 3-day gate belongs to `recordPass`, so
    // predict cannot mint a Mastered lesson in one sitting.
    expect(record?.masteredAt).toBeNull();
    // No attempt history: the session is infinitely retriable and its record is
    // not the product's business.
    expect(Object.keys(record ?? {})).not.toContain('predict');
    expect(JSON.stringify(record)).not.toMatch(/answered|correct|attempts/i);

    // THE STAGE MOVES IN THIS VISIT, WITH NO RELOAD. This used to be asserted
    // only after `page.reload()`, which proves the storage write and nothing
    // else — so the visit that earned Practiced was the one visit that never
    // showed it, and the test stayed green through the whole gap. Predict is the
    // harder of the two retrieval paths to repaint, because its write happens
    // inside a lazy `import()` (the store is not in the bundle of a page that
    // merely SHOWS a visualization): no click-time listener can observe it,
    // whatever it watches, so the write has to announce itself on
    // `progress:changed` from inside that callback for the lesson header to
    // hear (`src/lib/progress-events.ts`).
    await expect(headerLabel(page)).toHaveText('Practiced on this device');

    // …and the repaint is a display catching up, never a replacement for the
    // record: the same wording survives a reload, and the index counts it once.
    await page.reload();
    await expect(headerLabel(page)).toHaveText('Practiced on this device');
    await page.goto('/learn');
    await expect(trackMastery(page, 'algorithms')).toHaveText(
      'Practiced 1 · Mastered 0',
    );
  });

  test('a session under the bar earns nothing, and says nothing about it', async ({
    page,
  }) => {
    const viz = await openBinary(page);
    const before = await storageFingerprint(page);
    await enablePredict(viz);

    // Two right out of three (67%) is under the >=80% accuracy bar, so this
    // session earns nothing.
    //
    // It used to answer all three correctly and rely on the ANSWER floor
    // instead — a flat five, which the authored run could never reach. That
    // made the advertised path unearnable on the very lesson `/learn`'s review
    // card deep-links with `?review=1`, so the floor is now
    // `min(5, authoredQuestions)` and three correct answers legitimately pass.
    // Accuracy is the bar this test is about, so it is the one it now misses.
    const [first, ...rest] = AUTHORED.answers;
    // Any choice that is not the graded one is wrong; the four are fixed.
    const wrong = (['Go left', 'Go right', 'Found it', 'Not present'] as const)
      .filter((choice) => choice !== (first as string))
      .at(0)!;
    await answer(viz, wrong);
    for (const label of rest) await answer(viz, label);

    await expect(activityChip(viz)).toHaveText('3 answered · 0 skipped');
    expect(await storageFingerprint(page)).toBe(before);
    // …and nothing tells the reader they fell short of a threshold they were
    // never shown. Falling short must cost nothing, including in words.
    const text = await page.locator('body').innerText();
    expect(text).not.toMatch(
      /\b(two more|need \d+ more|almost there|not enough|try again to)\b/i,
    );
    await expect(headerLabel(page)).toHaveText('');
  });

  test('a session at the answer floor but under the accuracy bar earns nothing', async ({
    page,
  }) => {
    const viz = await openBinary(page);
    await runCustomInput(viz, LONG.array, LONG.target, LONG.steps);
    await enablePredict(viz);

    // Five answers, three of them right (60%) — over the answer floor, under the
    // ≥80% bar, which is computed in integers and never rendered.
    const wrong = ['Go right', 'Go right'];
    const graded = [...wrong, ...LONG.answers.slice(2)];
    for (const label of graded) await answer(viz, label);

    await expect(activityChip(viz)).toHaveText('5 answered · 0 skipped');
    expect(await readKey(page, masteryKey(BINARY_SLUG))).toBeNull();
    // No stage, and — the part that matters — no scolding.
    await expect(headerLabel(page)).toHaveText('');
    const lines = await predictCopy(viz);
    for (const line of lines) {
      expect(line).not.toMatch(/\b(failed|too many|not enough|60|80)\b/i);
    }
  });
});

test.describe('degraded — with no JS and with no store', () => {
  test.describe('JavaScript disabled', () => {
    test.use({ javaScriptEnabled: false });

    test('no toggle, no note, no strip — and the lesson still reads', async ({
      page,
    }) => {
      await page.goto(BINARY);

      // The whole mode lives inside `.viz-controls`, which the island's own
      // `<noscript>` kill-switch hides — and the strip is injected at runtime
      // only, so a JS-off page cannot grow one at all.
      await expect(page.locator('[data-viz-predict]:visible')).toHaveCount(0);
      await expect(page.locator('[data-viz-predict-note]:visible')).toHaveCount(
        0,
      );
      await expect(page.locator('[data-viz-predict-strip]')).toHaveCount(0);
      // Both islands on this lesson, not just the one with the toggle: the
      // kill-switch is a stylesheet rule, so it either covers every control bar
      // or it covers none.
      await expect(page.locator('[data-viz-controls]:visible')).toHaveCount(0);

      const text = await page.locator('body').innerText();
      expect(text).not.toContain('answered ·');
      expect(text).not.toContain('Auto-play and scrubbing are off');

      // DISCRIMINATOR: the page is the M7 page, not a broken one. The
      // build-time still frame is drawn and the prose is all there.
      await expect(
        page.locator(`${BINARY_VIZ} [data-viz-canvas] svg`),
      ).toHaveCount(1);
      await expect(
        page.getByRole('heading', { name: 'Practice' }),
      ).toBeVisible();
    });

    test('a review deep link degrades to an ordinary lesson visit', async ({
      page,
    }) => {
      // The review card is a plain link, so a JS-off reader can follow it. What
      // they must not get is a half-mode: no toggle, no strip, no promise.
      await page.goto(`${BINARY}?review=1#practice`);
      await expect(page.locator('[data-viz-predict]:visible')).toHaveCount(0);
      await expect(page.locator('[data-viz-predict-strip]')).toHaveCount(0);
      await expect(page.locator('#practice')).toBeVisible();
    });
  });

  test('storage blocked: predicting works and nothing claims to have saved', async ({
    page,
  }) => {
    const errors = trackPageErrors(page);
    await blockStorage(page);
    const viz = await openBinary(page);

    // DISCRIMINATOR: the toggle ships `disabled` in SSR and is enabled only by
    // the island, so an enabled toggle proves the script ran to completion with
    // the store throwing underneath it — "degraded", not "died".
    await expect(predictToggle(viz)).toBeEnabled();

    await runCustomInput(viz, LONG.array, LONG.target, LONG.steps);
    await enablePredict(viz);
    for (const label of LONG.answers) await answer(viz, label);

    // The session itself is unaffected — retrieval practice does not need a
    // store to be worth doing…
    await expect(activityChip(viz)).toHaveText('5 answered · 0 skipped');
    await expect(viz.locator('[data-verdict]')).toHaveCount(1);
    // …and nothing anywhere claims a save that could not happen.
    await expect(headerLabel(page)).toHaveText('');
    await expect(page.locator('[data-lesson-stage]')).toBeHidden();
    const text = await page.locator('body').innerText();
    expect(text).not.toMatch(/\bsaved\b/i);

    expect(errors, 'no script may throw when storage is blocked').toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// axe, scoped to the visualizer in the state predict creates — a question
// strip, four buttons in a labelled group, two controls marked unavailable by
// `aria-disabled` with a described reason, and a verdict inside a live region.
// None of that exists until a reader turns the mode on, so a page-load scan
// (m4-lessons.spec.ts) cannot see it. Scoped, so this gates at zero SERIOUS as
// well as zero critical.
// ---------------------------------------------------------------------------
for (const theme of ['light', 'dark'] as const) {
  test(`axe: a predict session (${theme} theme) — zero critical, zero serious`, async ({
    page,
  }) => {
    await page.addInitScript((value) => {
      localStorage.setItem('theme', value);
    }, theme);
    const viz = await openBinary(page);
    await enablePredict(viz);
    // One graded answer, so the verdict, the activity chip and the "unavailable"
    // states are all on screen when the scan runs.
    await answer(viz, 'Not present');
    await expect(activityChip(viz)).toBeVisible();

    const results = await new AxeBuilder({ page })
      .include(BINARY_VIZ)
      .analyze();
    const blocking = results.violations
      .filter((v) => v.impact === 'critical' || v.impact === 'serious')
      .map((v) => `${v.impact} ${v.id}: ${v.help}`);
    expect(blocking).toEqual([]);
  });
}

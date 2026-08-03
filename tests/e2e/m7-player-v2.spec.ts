/**
 * M7.2 — Player v2 (docs/m7-ux-overhaul.md "Phase M7.2" → Player v2).
 *
 * "Make the player the hero" is design move (3): one consolidated control bar, a
 * legend that explains the colours, recovery from a bad experiment, a disclosed
 * input format, and lifecycle states that say which of loading/failed/ready the
 * reader is looking at. Everything here is DOM- or storage-shaped; the pure
 * halves (legend model, placeholder derivation, speed normalizer) live in
 * `tests/unit/viz-player-v2.test.ts`.
 *
 * Focus retention at the trace bounds (A11Y-1) is the one Player v2 behaviour
 * that is NOT here: it has its own file, `viz-focus-retention.spec.ts`.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const LESSON = '/learn/binary-search';
// The lesson hosts two array visualizers; scope to the binary-search one, as
// every other binary-search spec does.
const VIZ = '#viz-binary-search';
/** The authored example this lesson ships (`input` prop → `data-input`). */
const AUTHORED = { array: '[1,3,5,7,9,11]', target: '7', steps: 4 };

/** Scrolls the binary-search visualizer into view and waits for it to hydrate. */
async function hydrateViz(page: Page) {
  const viz = page.locator(`${VIZ} [data-viz]`);
  await viz.scrollIntoViewIfNeeded();
  await expect(viz).toHaveAttribute('data-viz-ready', 'true', {
    timeout: 15_000,
  });
  return viz;
}

test.describe('consolidated control bar', () => {
  test('every control is reachable and operable from the keyboard, in visual order', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(LESSON);
    await hydrateViz(page);

    // DOM order IS the visual order at every width (the bar reflows, it does not
    // reorder), so tabbing forward from the first transport button must walk the
    // bar left to right and then into the custom-input form. A mismatch here is
    // WCAG 2.4.3 and is invisible to every other assertion in the suite.
    const expected = [
      'vizBack',
      'vizPlay',
      'vizForward',
      'vizSlider',
      'vizSpeed',
      'vizArray',
      'vizTarget',
      'vizRun',
      'vizRestore',
    ];
    await page.locator(`${VIZ} [data-viz-reset]`).focus();
    for (const hook of expected) {
      await page.keyboard.press('Tab');
      expect(
        await page.evaluate(() =>
          Object.keys((document.activeElement as HTMLElement).dataset).find(
            (key) => key.startsWith('viz'),
          ),
        ),
        `tab order should reach ${hook}`,
      ).toBe(hook);
    }

    // Operable, not merely reachable: the slider is the scrubber, so arrow keys
    // on it must move the trace, and the speed <select> must take a value.
    const counter = page.locator(`${VIZ} [data-viz-counter]`);
    await page.locator(`${VIZ} [data-viz-slider]`).focus();
    await page.keyboard.press('ArrowRight');
    await expect(counter).toHaveText(`2 / ${AUTHORED.steps}`);
    await page.keyboard.press('Home');
    await expect(counter).toHaveText(`1 / ${AUTHORED.steps}`);

    // The scrubber names its position for assistive tech; the visible counter is
    // aria-hidden precisely so this is not announced twice.
    await expect(page.locator(`${VIZ} [data-viz-slider]`)).toHaveAttribute(
      'aria-valuetext',
      `Step 1 of ${AUTHORED.steps}`,
    );
    await expect(counter).toHaveAttribute('aria-hidden', 'true');
  });

  test('the play button reports state through its name only', async ({
    page,
  }) => {
    await page.goto(LESSON);
    await hydrateViz(page);

    const play = page.locator(`${VIZ} [data-viz-play]`);
    // Hover discoverability for the icon-only transport: `title` mirrors the
    // accessible name rather than adding a second, different string.
    for (const hook of ['reset', 'back', 'play', 'forward']) {
      const button = page.locator(`${VIZ} [data-viz-${hook}]`);
      const name = await button.getAttribute('aria-label');
      expect(name, `${hook} needs an accessible name`).toBeTruthy();
      await expect(button).toHaveAttribute('title', name!);
    }
    await expect(play).toHaveAccessibleName('Play');
  });
});

test.describe('legend', () => {
  test('lists exactly the highlight kinds the default trace uses', async ({
    page,
  }) => {
    await page.goto(LESSON);
    await hydrateViz(page);

    // Built from the trace at BUILD time, so it cannot list a colour the reader
    // will never see, nor omit one they will. Binary search emits active/range/
    // found and nothing else (see tests/unit/viz-player-v2.test.ts).
    const legend = page.locator(`${VIZ} [data-viz-legend]`);
    await expect(legend).toHaveAttribute('aria-label', /highlights/i);
    await expect(legend.locator('li')).toHaveText([
      'Current',
      /Range/,
      /Found/,
    ]);
    // Kinds this algorithm never emits must not appear — a hardcoded legend
    // would show all ten.
    await expect(legend).not.toContainText('Swapping');
    await expect(legend).not.toContainText('Visited');

    // Never colour-only: each pill carries a word, and the two shape-only cues
    // are the only ones allowed to skip the glyph.
    for (const item of await legend.locator('li').all()) {
      expect((await item.innerText()).trim().length).toBeGreaterThan(0);
    }
  });
});

test.describe('custom input', () => {
  test('helper text and the error share the field description, never replace it', async ({
    page,
  }) => {
    await page.goto(LESSON);
    await hydrateViz(page);

    const array = page.locator(`${VIZ} [data-viz-array]`);
    // aria-describedby lists BOTH ids, space-separated: the format disclosure
    // has to survive an error, and the error has to be announced with the
    // field. Overwriting the list with either one alone is how the other
    // silently stops being read out.
    const described = (await array.getAttribute('aria-describedby'))!;
    const ids = described.split(/\s+/).filter(Boolean);
    expect(ids.length).toBe(2);
    const [helpId, errId] = ids as [string, string];
    expect(helpId).toMatch(/-help$/);
    expect(errId).toMatch(/-err$/);

    // The help text discloses the format AND the real cap this algorithm's own
    // parseInput enforces (30 items), not a hardcoded number.
    const help = page.locator(`#${helpId}`);
    await expect(help).toBeVisible();
    await expect(help).toContainText('Up to 30');
    await expect(help).toContainText(AUTHORED.array);

    // Submit something invalid: the error appears, the field is marked, and the
    // description STILL names both nodes.
    await array.fill('[3,1,2]');
    await page.locator(`${VIZ} [data-viz-target]`).fill('2');
    await page.locator(`${VIZ} [data-viz-run]`).click();

    const error = page.locator(`#${errId}`);
    await expect(error).toBeVisible();
    await expect(error).toHaveAttribute('role', 'status');
    await expect(array).toHaveAttribute('aria-invalid', 'true');
    await expect(array).toHaveAttribute('aria-describedby', described);
    await expect(help).toBeVisible();

    // Fixing the input clears both the flag and the error text — a stale
    // description would keep being announced for the rest of the session.
    await array.fill(AUTHORED.array);
    await page.locator(`${VIZ} [data-viz-run]`).click();
    await expect(error).toBeHidden();
    await expect(array).not.toHaveAttribute('aria-invalid');
    await expect(error).toHaveText('');
  });

  test('"Restore example" puts the lesson\'s own example back after a custom run', async ({
    page,
  }) => {
    await page.goto(LESSON);
    await hydrateViz(page);

    const array = page.locator(`${VIZ} [data-viz-array]`);
    const target = page.locator(`${VIZ} [data-viz-target]`);
    const counter = page.locator(`${VIZ} [data-viz-counter]`);

    // A custom run first — restore has to undo a real experiment, not a
    // pristine state. The 10-cell drawing is what proves the experiment
    // happened: the step COUNT is not a signal (a longer array can produce a
    // trace of the same length, and every load resets the counter to 1).
    await array.fill('[2,4,6,8,10,12,14,16,18,20]');
    await target.fill('18');
    // Submitted with Enter from the field, which is how a keyboard user runs it.
    await page.keyboard.press('Enter');
    await expect(page.locator(`${VIZ} #i9`)).toBeVisible();

    // …and recovered from the keyboard too (M7.2 acceptance: the keyboard
    // journey covers restore-example).
    const restore = page.locator(`${VIZ} [data-viz-restore]`);
    await restore.focus();
    await expect(restore).toBeFocused();
    await page.keyboard.press('Enter');

    // Both fields carry the AUTHORED values (not just a re-run with the old
    // text left on screen), and the trace is the lesson's own again — six
    // cells, four steps.
    await expect(array).toHaveValue(AUTHORED.array);
    await expect(target).toHaveValue(AUTHORED.target);
    await expect(counter).toHaveText(`1 / ${AUTHORED.steps}`);
    await expect(page.locator(`${VIZ} #i5`)).toBeVisible();
    await expect(page.locator(`${VIZ} #i6`)).toHaveCount(0);
  });

  test('restoring also clears a pending error', async ({ page }) => {
    await page.goto(LESSON);
    await hydrateViz(page);

    const array = page.locator(`${VIZ} [data-viz-array]`);
    await array.fill('[9,2]');
    await page.locator(`${VIZ} [data-viz-run]`).click();
    await expect(page.locator(`${VIZ} [data-viz-error]`)).toBeVisible();

    // Recovery means recovery: the way out of a bad experiment cannot leave the
    // rejection sitting under the restored example.
    await page.locator(`${VIZ} [data-viz-restore]`).click();
    await expect(page.locator(`${VIZ} [data-viz-error]`)).toBeHidden();
    await expect(array).not.toHaveAttribute('aria-invalid');
  });
});

test.describe('speed preference', () => {
  test('pref:viz-speed survives a reload and applies to the player', async ({
    page,
  }) => {
    await page.goto(LESSON);
    await hydrateViz(page);

    const speed = page.locator(`${VIZ} [data-viz-speed]`);
    await speed.selectOption('2');
    expect(
      await page.evaluate(() => localStorage.getItem('pref:viz-speed')),
    ).toBe('2');

    await page.reload();
    await hydrateViz(page);
    // Restored on the control the reader sees…
    await expect(speed).toHaveValue('2');

    // …and on every OTHER visualizer on the page once it hydrates, because
    // playback speed is a property of the reader, not of one island. Each is
    // scrolled into view first: islands mount from an IntersectionObserver, and
    // an unmounted one is still showing its SSR default.
    const roots = page.locator('[data-viz]');
    const count = await roots.count();
    expect(count).toBeGreaterThan(1); // this lesson hosts two
    for (let i = 0; i < count; i += 1) {
      const root = roots.nth(i);
      await root.scrollIntoViewIfNeeded();
      await expect(root).toHaveAttribute('data-viz-ready', 'true', {
        timeout: 15_000,
      });
      await expect(root.locator('[data-viz-speed]')).toHaveValue('2');
    }
  });

  test('a stored speed that this build no longer offers is ignored', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem('pref:viz-speed', '9');
    });
    await page.goto(LESSON);
    await hydrateViz(page);

    // Clamped to the <select>'s own options: an unknown value must leave the 1×
    // default standing rather than putting the control in a state it cannot show.
    await expect(page.locator(`${VIZ} [data-viz-speed]`)).toHaveValue('1');
  });

  test('two visualizers on one page agree after a SINGLE change', async ({
    page,
  }) => {
    await page.goto(LESSON);

    // Both islands have to be mounted before the change: the sync is a
    // CustomEvent, and an island that has not hydrated yet is not listening —
    // it restores from storage instead, which is the reload path the test above
    // covers. This is the other half: live siblings, no reload.
    const roots = page.locator('[data-viz]');
    const count = await roots.count();
    expect(count, 'this lesson must host two visualizers').toBeGreaterThan(1);
    for (let i = 0; i < count; i += 1) {
      await roots.nth(i).scrollIntoViewIfNeeded();
      await expect(roots.nth(i)).toHaveAttribute('data-viz-ready', 'true', {
        timeout: 15_000,
      });
    }

    const [first, second] = [roots.nth(0), roots.nth(1)];
    await first.locator('[data-viz-speed]').selectOption('3');

    // The control the reader never touched follows, because playback speed is a
    // property of the reader, not of one island.
    await expect(second.locator('[data-viz-speed]')).toHaveValue('3');
    await expect(first.locator('[data-viz-speed]')).toHaveValue('3');
    expect(
      await page.evaluate(() => localStorage.getItem('pref:viz-speed')),
    ).toBe('3');

    // A matching <select> is not the same claim as a matching PLAYER: the
    // sibling's `setSpeed` must have been called too. That is observable
    // through the A11Y-6 policy, which mutes only above 1× — so a sibling still
    // running at 1× would leave the region polite here.
    const explain = second.locator('[data-viz-explain]');
    await second.locator('[data-viz-play]').click();
    await expect(explain).toHaveAttribute('aria-live', 'off');
    // Reset, not a second play-button click: `reset()` pauses whatever the state
    // is, whereas clicking play at the end of a trace REPLAYS it (VIZ-4).
    await second.locator('[data-viz-reset]').click();
    await expect(explain).toHaveAttribute('aria-live', 'polite');
  });
});

/**
 * A11Y-6 — the live-region policy (spec §10's explicit M7 exception).
 *
 * §10 otherwise requires the step explanation to be announced on every step. The
 * exception permits muting it "provided the final step is announced once on
 * auto-pause and every manual step still announces normally", which is three
 * coupled rules, not one: mute ONLY while autoplaying faster than 1×, unmute
 * BEFORE the final step is written (flipping `aria-live` back afterwards
 * announces nothing — the region has already stopped changing), and re-evaluate
 * the whole thing when the speed changes mid-run, which no Player callback
 * reports (`setSpeed` fires none).
 *
 * The muted-run assertions are made from a recorded mutation log rather than by
 * polling the attribute: what the exception constrains is the state the region
 * was in AT THE MOMENT each explanation was written, which a poll cannot see and
 * which is exactly where the ordering bug lives.
 */
test.describe('live-region policy (A11Y-6)', () => {
  /** Where the recorder parks its log on `window`. */
  const LOG = '__vizExplainLog';

  /** One mutation of the explanation region, in the order it happened. */
  interface ExplainMutation {
    kind: 'live' | 'text';
    /** `live` only: the value the attribute held BEFORE the write. */
    old?: string | null;
    /** `text` only: what was written into the region. */
    text?: string;
  }

  /** One explanation as announced: the text, and the live state it was written in. */
  interface Announcement {
    text: string;
    live: string | null;
  }

  const explainSel = `${VIZ} [data-viz-explain]`;

  /**
   * Starts recording `aria-live` writes and text writes on the explanation,
   * interleaved in mutation order.
   *
   * @param page - A page whose visualizer has hydrated.
   */
  async function recordExplain(page: Page): Promise<void> {
    await page.evaluate(
      ([selector, key]) => {
        const region = document.querySelector(selector);
        if (!region) throw new Error(`no explanation region at ${selector}`);
        const log: unknown[] = [];
        (window as unknown as Record<string, unknown>)[key] = log;
        new MutationObserver((records) => {
          for (const record of records) {
            if (record.type === 'attributes') {
              log.push({ kind: 'live', old: record.oldValue });
            } else {
              // `textContent = …` replaces the children, so the written string
              // is the added text node — never the region's CURRENT text, which
              // by callback time may already be a later step.
              log.push({
                kind: 'text',
                text: Array.from(record.addedNodes)
                  .map((node) => node.textContent ?? '')
                  .join(''),
              });
            }
          }
        }).observe(region, {
          attributes: true,
          attributeFilter: ['aria-live'],
          attributeOldValue: true,
          childList: true,
        });
      },
      [explainSel, LOG] as const,
    );
  }

  /**
   * Replays the recorded log as the sequence of announcements the reader got.
   *
   * A `MutationRecord` carries only the OLD attribute value, so each `aria-live`
   * write is resolved to the value it SET by reading the next write's old value
   * — and the last one from the attribute as it stands at the end. The records
   * are complete (an `attributeFilter` catches every write) and ordered, which
   * is what makes "was the region muted when this text landed?" answerable.
   *
   * @param page - The page holding the log.
   * @returns Every explanation written since recording began, with the live
   * state it was written into.
   */
  async function announcements(page: Page): Promise<Announcement[]> {
    const { log, live } = await page.evaluate(
      ([selector, key]) => ({
        log: ((window as unknown as Record<string, unknown>)[key] ??
          []) as ExplainMutation[],
        live:
          document.querySelector(selector)?.getAttribute('aria-live') ?? null,
      }),
      [explainSel, LOG] as const,
    );

    const writes = log.filter((entry) => entry.kind === 'live');
    const applied = writes.map((_, i) =>
      i + 1 < writes.length ? (writes[i + 1]?.old ?? null) : live,
    );

    // Recording only ever starts from the resting state, which the callers
    // assert before installing the observer.
    let current: string | null = 'polite';
    let seen = 0;
    const said: Announcement[] = [];
    for (const entry of log) {
      if (entry.kind === 'live') {
        current = applied[seen] ?? null;
        seen += 1;
      } else {
        said.push({ text: entry.text ?? '', live: current });
      }
    }
    return said;
  }

  /** Waits for autoplay to reach the end of the trace and stop there. */
  async function playToEnd(page: Page): Promise<void> {
    await page.locator(`${VIZ} [data-viz-play]`).click();
    await expect(page.locator(`${VIZ} [data-viz-counter]`)).toHaveText(
      `${AUTHORED.steps} / ${AUTHORED.steps}`,
      { timeout: 15_000 },
    );
    await expect(page.locator(`${VIZ} [data-viz-play]`)).not.toHaveAttribute(
      'data-playing',
    );
  }

  test('speed alone never mutes it — a manual step always announces', async ({
    page,
  }) => {
    await page.goto(LESSON);
    await hydrateViz(page);
    const explain = page.locator(explainSel);
    await expect(explain).toHaveAttribute('aria-live', 'polite');

    // 3× selected but nothing playing: stepping by hand is one deliberate act
    // per step, which is exactly the case the exception does NOT cover.
    await page.locator(`${VIZ} [data-viz-speed]`).selectOption('3');
    await expect(explain).toHaveAttribute('aria-live', 'polite');
    await page.locator(`${VIZ} [data-viz-forward]`).click();
    await expect(explain).toHaveAttribute('aria-live', 'polite');
    await expect(page.locator(`${VIZ} [data-viz-counter]`)).toHaveText(
      `2 / ${AUTHORED.steps}`,
    );
  });

  test('autoplay at 1× announces every step', async ({ page }) => {
    await page.goto(LESSON);
    await hydrateViz(page);
    const explain = page.locator(explainSel);
    await expect(explain).toHaveAttribute('aria-live', 'polite');
    await recordExplain(page);

    // Playing is not the trigger either: at 1× the trace advances at 900ms per
    // step, which a polite region can carry, so the mute would be a regression.
    await playToEnd(page);

    const said = await announcements(page);
    expect(said.length).toBe(AUTHORED.steps - 1);
    expect(said.map((a) => a.live)).toEqual(said.map(() => 'polite'));
  });

  test('above 1× the run is muted, and the final step is announced once', async ({
    page,
  }) => {
    await page.goto(LESSON);
    await hydrateViz(page);
    const explain = page.locator(explainSel);
    await expect(explain).toHaveAttribute('aria-live', 'polite');

    await page.locator(`${VIZ} [data-viz-speed]`).selectOption('3');
    await recordExplain(page);
    await playToEnd(page);

    const said = await announcements(page);
    expect(said.length).toBe(AUTHORED.steps - 1);
    // Every step of the flood is swallowed…
    expect(said.slice(0, -1).map((a) => a.live)).toEqual(
      said.slice(0, -1).map(() => 'off'),
    );

    // …except the one that says where the run ENDED, which lands in a region
    // that was already restored. This is the assertion that catches unmuting
    // AFTER the write: the log is ordered, so a late flip attributes 'off' to
    // this text and fails here, even though the attribute ends up 'polite'
    // either way.
    const last = said[said.length - 1]!;
    expect(last.live).toBe('polite');
    expect(last.text).toBe(await explain.textContent());
    // Once, not twice: a second write of the same string would be a repeat
    // announcement of the same step.
    expect(said.filter((a) => a.text === last.text).length).toBe(1);

    // And the region is left usable for the manual stepping that follows.
    await expect(explain).toHaveAttribute('aria-live', 'polite');
    await page.locator(`${VIZ} [data-viz-back]`).click();
    await expect(explain).toHaveAttribute('aria-live', 'polite');
    await expect(explain).not.toHaveText(last.text);
  });

  test('changing speed mid-run re-evaluates the mute', async ({ page }) => {
    await page.goto(LESSON);
    await hydrateViz(page);
    const explain = page.locator(explainSel);
    const counter = page.locator(`${VIZ} [data-viz-counter]`);
    await expect(explain).toHaveAttribute('aria-live', 'polite');

    // Start slow (1800ms per step) so the change below lands mid-run with room
    // to spare, and so the first step is provably written unmuted.
    await page.locator(`${VIZ} [data-viz-speed]`).selectOption('0.5');
    await recordExplain(page);
    await page.locator(`${VIZ} [data-viz-play]`).click();
    await expect(counter).toHaveText(`2 / ${AUTHORED.steps}`, {
      timeout: 15_000,
    });

    // The reader speeds the run up without touching anything else. `setSpeed`
    // fires no callback, so the policy is only re-evaluated if the `change`
    // listener does it by hand — this is the assertion for that wiring.
    await page.locator(`${VIZ} [data-viz-speed]`).selectOption('3');
    await expect(counter).toHaveText(`${AUTHORED.steps} / ${AUTHORED.steps}`, {
      timeout: 15_000,
    });

    const said = await announcements(page);
    expect(said.length).toBe(AUTHORED.steps - 1);
    expect(said[0]!.live, 'written before the speed change').toBe('polite');
    expect(said[1]!.live, 'written after it, with no other interaction').toBe(
      'off',
    );
    expect(said[said.length - 1]!.live, 'the final step still lands').toBe(
      'polite',
    );
  });
});

test.describe('canvas overflow (RSP-2)', () => {
  test('becomes a named, keyboard-reachable scroll region only while it overflows', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(LESSON);
    await hydrateViz(page);

    const canvas = page.locator(`${VIZ} [data-viz-canvas]`);

    // Six cells in a 1280px column: nothing overflows, so the canvas is only the
    // click-then-Space focus target — invisible to assistive tech, absent from
    // the tab order.
    await expect(canvas).toHaveAttribute('tabindex', '-1');
    await expect(canvas).not.toHaveAttribute('role');
    await expect(canvas).not.toHaveAttribute('aria-label');

    // 30 items (the parser's cap) cannot fit: now it is a real scroll container,
    // and a scroll container no keyboard can reach would be a 2.1.1 failure.
    const many = Array.from({ length: 30 }, (_, i) => (i + 1) * 2);
    await page.locator(`${VIZ} [data-viz-array]`).fill(`[${many.join(',')}]`);
    await page.locator(`${VIZ} [data-viz-target]`).fill('42');
    await page.locator(`${VIZ} [data-viz-run]`).click();

    await expect(canvas).toHaveAttribute('tabindex', '0');
    await expect(canvas).toHaveAttribute('role', 'group');
    await expect(canvas).toHaveAttribute('aria-label', /scrollable/i);
    expect(
      await canvas.evaluate((el) => el.scrollWidth - el.clientWidth),
    ).toBeGreaterThan(1);

    // While it IS a scroll region, ←/→ belong to it: the island must not steal
    // the keys that scroll the drawing, or its content is unreachable.
    const counter = page.locator(`${VIZ} [data-viz-counter]`);
    const before = await counter.textContent();
    await canvas.focus();
    await page.keyboard.press('ArrowRight');
    await expect(counter).toHaveText(before!);
    // Polled, not sampled: Chromium may animate a keyboard scroll, and what
    // matters is that the container moved at all.
    await expect
      .poll(() => canvas.evaluate((el) => el.scrollLeft))
      .toBeGreaterThan(0);

    // Back to the authored six-cell example → back to a plain focus target.
    await page.locator(`${VIZ} [data-viz-restore]`).click();
    await expect(canvas).toHaveAttribute('tabindex', '-1');
    await expect(canvas).not.toHaveAttribute('role');
  });
});

test.describe('lifecycle states', () => {
  /**
   * Freezes every island in its PRE-HYDRATION state, with JavaScript otherwise
   * enabled.
   *
   * The islands mount from an IntersectionObserver, so replacing it with a
   * no-op observer holds the exact markup a reader sees between first paint and
   * hydration — which is a real, if brief, state on a slow connection, and the
   * one the `disabled`-in-SSR recipe exists for. `javaScriptEnabled: false`
   * cannot be used for this: the noscript kill-switch hides the controls
   * entirely, which is a different state with different rules.
   */
  async function freezeBeforeMount(page: Page): Promise<void> {
    await page.addInitScript(() => {
      class IdleObserver {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
        takeRecords(): [] {
          return [];
        }
      }
      Object.defineProperty(window, 'IntersectionObserver', {
        configurable: true,
        writable: true,
        value: IdleObserver,
      });
    });
  }

  test('pre-hydration: controls are really disabled and nothing claims to be busy', async ({
    page,
  }) => {
    await freezeBeforeMount(page);
    await page.goto(LESSON);

    const viz = page.locator(`${VIZ} [data-viz]`);
    await viz.scrollIntoViewIfNeeded();
    await expect(viz).toHaveAttribute('data-viz-loading', 'true');
    await expect(viz).not.toHaveAttribute('data-viz-ready', 'true');

    // Before hydration the transport uses the REAL `disabled` attribute — a
    // pre-hydration click must not submit the actionless form or fake a step.
    // (After hydration it is aria-disabled only; see viz-focus-retention.)
    for (const hook of ['play', 'back', 'forward', 'reset']) {
      const button = page.locator(`${VIZ} [data-viz-${hook}]`);
      expect(
        await button.evaluate((el: HTMLButtonElement) => el.disabled),
        `${hook} must ship disabled pre-hydration`,
      ).toBe(true);
    }
    await expect(page.locator(`${VIZ} [data-viz-counter]`)).toHaveText('…');

    // aria-busy is set by JS only when a mount actually STARTS: an island four
    // screens away is deferred, not loading, and marking it busy would make a
    // lesson page announce several busy regions at once.
    await expect(viz).not.toHaveAttribute('aria-busy', 'true');

    // The static still is still on screen — the reader is never looking at a
    // blank box while the chunks arrive.
    await expect(page.locator(`${VIZ} [data-viz-canvas] > svg`)).toBeVisible();
  });

  test('pre-hydration has no critical axe violations', async ({ page }) => {
    await freezeBeforeMount(page);
    await page.goto(LESSON);
    await page.locator(`${VIZ} [data-viz]`).scrollIntoViewIfNeeded();

    // The lesson page is axe-scanned hydrated in binary-search.spec.ts; this is
    // the same page in the state it ships in, which no existing scan covers.
    const results = await new AxeBuilder({ page }).analyze();
    const critical = results.violations.filter((v) => v.impact === 'critical');
    expect(critical.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test('a renderer that cannot load says so, and hides the controls it cannot drive', async ({
    page,
  }) => {
    // The failed state is a terminal one, so it must be visibly different from
    // "loading" — the audit's complaint was that a dead viz looked like a slow
    // one forever. Forcing it needs an unknown renderer id, which is exactly
    // what a stale/partial View-Transition swap can leave behind. Hydrate
    // first, so the root is on screen and the re-init mounts immediately.
    await page.goto(LESSON);
    await hydrateViz(page);
    await page.evaluate((selector) => {
      const root = document.querySelector<HTMLElement>(
        `${selector} [data-viz]`,
      );
      if (!root) throw new Error('viz root not found');
      root.dataset['renderer'] = 'no-such-renderer';
      delete root.dataset['vizInit'];
      root.removeAttribute('data-viz-ready');
      document.dispatchEvent(new Event('astro:page-load'));
    }, VIZ);

    const viz = page.locator(`${VIZ} [data-viz]`);
    await expect(viz).toHaveAttribute('data-viz-failed', 'true');
    await expect(viz).not.toHaveAttribute('aria-busy', 'true');
    await expect(page.locator(`${VIZ} .viz-unavailable`)).toContainText(
      'could not load',
    );
    // Controls that cannot work are hidden, not left dimmed and clickable.
    await expect(page.locator(`${VIZ} .viz-controls`)).toBeHidden();
  });
});

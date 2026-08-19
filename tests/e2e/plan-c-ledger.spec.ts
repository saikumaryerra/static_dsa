/**
 * Plan C — the ledger and the instrument, asserted against the running site.
 *
 * These live here rather than in Vitest because every assertion is a question
 * about the built DOM, and the unit harness is `environment: 'node'` with no
 * DOM. The pure halves have their own files: `tests/unit/instrument-id.test.ts`
 * pins the id derivation (including the collision tiebreak, which no shipped
 * page currently triggers), and `tests/unit/ledger.test.ts` pins the ledger.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { curriculum } from './utils/mastery';
import { counter, hydrateViz } from './utils/predict';
import { scrollToInstant, waitForAnchorScroll } from './utils/scroll';

/** Every instrument root on the page, in document order, with its `id`. */
async function instrumentIds(page: Page): Promise<string[]> {
  return page
    .locator('[data-viz]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('id') ?? ''));
}

test.describe('stable instrument ids', () => {
  /**
   * The id was `viz-${Math.random()…}` — the last `Math.random()` in `src/`, so
   * no anchor into a run survived a rebuild. Asserting the SHAPE rather than a
   * literal is deliberate: the hash is over `Astro.url.pathname`, which can
   * normalize differently between `astro dev` and the built output, so a pinned
   * value would be a false anchor. What matters is that it is derived, that it
   * names its algorithm, and that a page's instruments never collide.
   */
  test('instrument ids are stable and name their algorithm', async ({
    page,
  }) => {
    await page.goto('/learn/binary-search');
    const ids = await instrumentIds(page);

    expect(ids).toHaveLength(2);
    expect(ids[0]).toMatch(/^viz-binary-search-[a-z0-9]+$/);
    expect(ids[1]).toMatch(/^viz-linear-search-[a-z0-9]+$/);
    expect(new Set(ids).size).toBe(2); // collision-free on a two-instrument page
  });

  /**
   * `sorting-basics` is the page that motivated the collision tiebreak: three
   * instruments from one lesson. They differ by algorithm, so the tiebreak must
   * NOT fire here — the common case stays clean, with no `-2` suffix anywhere.
   */
  test('three instruments on one lesson get three clean, distinct ids', async ({
    page,
  }) => {
    await page.goto('/learn/sorting-basics');
    const ids = await instrumentIds(page);

    expect(ids).toEqual([
      expect.stringMatching(/^viz-bubble-sort-[a-z0-9]+$/),
      expect.stringMatching(/^viz-selection-sort-[a-z0-9]+$/),
      expect.stringMatching(/^viz-insertion-sort-[a-z0-9]+$/),
    ]);
    expect(new Set(ids).size).toBe(3);
  });

  /**
   * The eight derived ids (`-explain`, `-err`, `-help`, …) are template
   * literals off the same uid, so they move with it for free. This pins the
   * relationship rather than any one value, because row anchors (`${uid}-row-N`)
   * and `<StepLink>` are built on exactly this contract.
   */
  test('the derived control ids hang off the instrument id', async ({
    page,
  }) => {
    await page.goto('/learn/binary-search');
    const viz = page.locator('[data-viz]').first();
    const uid = await viz.getAttribute('id');

    expect(uid).toBeTruthy();
    await expect(viz.locator('[data-viz-explain]')).toHaveAttribute(
      'id',
      `${uid}-explain`,
    );
  });
});

// ---------------------------------------------------------------------------
// Task 3 — the ledger's markup, server-rendered and inert until the island wakes
// ---------------------------------------------------------------------------

const LESSON = '/learn/binary-search';

/** The first instrument on the binary-search lesson, and its ledger. */
function ledgerOf(viz: Locator): Locator {
  return viz.locator('[data-ledger]');
}

test.describe('the ledger, server-rendered', () => {
  /**
   * The whole point of the component: the table is BUILD-TIME output of the same
   * trace the still came from, so it is there before a byte of the island runs.
   * Asserted with JavaScript disabled, because "server-rendered" is a claim that
   * only that mode can actually check.
   */
  test.describe('with JavaScript disabled', () => {
    test.use({ javaScriptEnabled: false });

    test('the table is the lesson, and its seek buttons are visibly unavailable', async ({
      page,
    }) => {
      await page.goto(LESSON);
      const viz = page.locator('[data-viz]').first();

      // The kill-switch takes the controls; it must not take the ledger, which
      // is why the ledger renders outside `.viz-controls`.
      await expect(viz.locator('.viz-controls')).toBeHidden();
      await expect(viz.locator('.viz-nojs-note')).toBeVisible();
      const ledger = ledgerOf(viz);
      await expect(ledger).toBeVisible();

      // A native <details>: closed by default, and openable with no JS at all.
      // A JS-toggled `hidden` would have left this reader no way in.
      await expect(ledger).not.toHaveAttribute('open', /.*/);
      const rows = ledger.locator('[data-ledger-row]');
      await expect(rows).toHaveCount(4);
      await ledger.locator('summary').click();
      await expect(ledger).toHaveAttribute('open', /.*/);
      await expect(rows.first()).toBeVisible();

      // Every seek button is a real, DISABLED button — never an enabled control
      // that silently does nothing, and never a `<tr role="button">`.
      const seeks = ledger.locator('[data-ledger-seek]');
      await expect(seeks).toHaveCount(4);
      for (let i = 0; i < 4; i += 1) {
        await expect(seeks.nth(i)).toBeDisabled();
      }
      // "Visibly unavailable", not merely inert — but on the AFFORDANCE
      // channel, not on opacity. The button's label is the step number, which
      // is data: `--disabled-opacity` would drop it to 2.15:1 against the well
      // and take a legible piece of the lesson below AA on the one page where
      // this table IS the lesson.
      const seek = await seeks.first().evaluate((el) => {
        const style = getComputedStyle(el);
        return {
          opacity: style.opacity,
          cursor: style.cursor,
          underline: style.textDecorationLine,
        };
      });
      expect(seek.opacity).toBe('1');
      expect(seek.cursor).toBe('not-allowed');
      expect(seek.underline).toBe('none');
    });
  });

  test('the row header is a rowheader, and it carries the button', async ({
    page,
  }) => {
    await page.goto(LESSON);
    const viz = await hydrateViz(page.locator('body'));
    const ledger = ledgerOf(viz);
    await ledger.locator('summary').click();

    // `<th scope="row">` — a `<tr role="button">` would destroy the
    // column-header association, which is the whole reason to build a table.
    await expect(ledger.getByRole('rowheader')).toHaveCount(4);
    // `#` plus the two the generic fallback derives (`what happened`,
    // `comparisons`) — the row NUMBER is not one of `Ledger.headers`.
    await expect(ledger.getByRole('columnheader')).toHaveCount(3);
    await expect(
      ledger.getByRole('rowheader').first().getByRole('button', {
        name: 'Go to step 1',
        includeHidden: true,
      }),
    ).toHaveCount(1);
  });

  /**
   * The table's accessible name comes from a visually-hidden `<caption>`, and
   * from nothing else. The abandoned build also pointed `aria-describedby` at
   * that same caption, so the name and the description were the identical
   * string — an AT user heard it twice for no information.
   */
  test('the caption names the table once, and is not repeated as a description', async ({
    page,
  }) => {
    await page.goto(LESSON);
    const viz = await hydrateViz(page.locator('body'));
    const ledger = ledgerOf(viz);
    await ledger.locator('summary').click();

    const table = ledger.getByRole('table');
    await expect(table).toHaveAccessibleName(/Binary search.*4 rows/);
    await expect(table).not.toHaveAttribute('aria-describedby', /.*/);
    // Visually hidden, not removed: `sr-only` clips it to a 1px box, so it is
    // still in the accessibility tree (asserted above) and painted nowhere.
    // Playwright calls a 1px clipped node "visible", so the box is what is
    // measured rather than that predicate.
    const box = await ledger
      .locator('caption')
      .evaluate((el) => el.getBoundingClientRect().width);
    expect(box).toBeLessThanOrEqual(1);
  });

  /** Row anchors hang off the instrument's stable uid (Task 1), 1-based. */
  test('every row carries a durable id derived from the instrument', async ({
    page,
  }) => {
    await page.goto(LESSON);
    const viz = page.locator('[data-viz]').first();
    const uid = await viz.getAttribute('id');

    const ids = await viz
      .locator('[data-ledger-row]')
      .evaluateAll((els) => els.map((el) => el.id));
    expect(ids).toEqual([
      `${uid}-row-1`,
      `${uid}-row-2`,
      `${uid}-row-3`,
      `${uid}-row-4`,
    ]);
  });

  /**
   * No authored run comes near the 200-row cap (the longest ships 33), so the
   * notice must be ABSENT here. Its presence on a four-step run would mean the
   * cap had started binding on content, which is the one thing §11's measurement
   * promises it never does.
   */
  test('no authored run is capped, so no run claims to be', async ({
    page,
  }) => {
    for (const path of [LESSON, '/learn/sorting-basics']) {
      await page.goto(path);
      await expect(page.locator('.viz-ledger__cap')).toHaveCount(0);
    }
  });

  /** Two instruments, two ledgers, two distinct disclosure labels (CNT-8). */
  test('two instruments on one page ship two distinct summaries', async ({
    page,
  }) => {
    await page.goto(LESSON);
    const summaries = await page
      .locator('[data-ledger] > summary')
      .evaluateAll((els) => els.map((el) => el.textContent?.trim() ?? ''));

    expect(summaries).toHaveLength(2);
    expect(new Set(summaries).size).toBe(2);
    for (const summary of summaries) {
      expect(summary).toContain('The run, written out');
    }
    // The space between the title and the count is load-bearing: accname joins
    // adjacent inline elements with NOTHING when the DOM has no whitespace
    // between them, and the first aria re-seed caught "…sorted array4 steps".
    expect(summaries[0]).toBe(
      'The run, written out — Binary search on a sorted array (4 steps)',
    );
  });
});

test.describe('showLedger, and the prop it must not contradict', () => {
  /**
   * /about and the dev gallery demonstrate the CHROME. A table of somebody
   * else's run is not what either page is showing.
   */
  test('/about hosts an instrument and no ledger', async ({ page }) => {
    await page.goto('/about');
    await expect(page.locator('[data-viz]')).toHaveCount(1);
    await expect(page.locator('[data-ledger]')).toHaveCount(0);
  });

  /**
   * The cost column inherits `showMetrics` INDEPENDENTLY of `showLedger`, so the
   * two props can never contradict each other. The rule is pure and pinned in
   * `tests/unit/ledger.test.ts`; what is asserted here is the other half of the
   * pair — that a lesson, which says nothing about either prop, still gets the
   * counter column.
   */
  test('a lesson keeps its cost column', async ({ page }) => {
    await page.goto(LESSON);
    const headers = await page
      .locator('[data-ledger]')
      .first()
      .locator('thead th')
      .evaluateAll((els) => els.map((el) => el.textContent?.trim() ?? ''));

    expect(headers).toEqual(['#', 'what happened', 'comparisons']);
  });
});

test.describe('the scrubber is revealed on focus, not deleted', () => {
  /**
   * The slider CANNOT be removed: `setupViz` early-exits without it, before the
   * abort controller, `mount()` and `data-viz-ready`, so the island would never
   * hydrate at all. This asserts the island DID hydrate and the slider is still
   * a real, reachable, operable control — only invisible until it takes focus.
   *
   * Permanent visual hiding would be a 2.4.7 failure: a sighted keyboard user
   * tabbing into a control with no visible focus indicator.
   */
  test('the slider is hidden at rest, visible while focused, and always operable', async ({
    page,
  }) => {
    await page.goto(LESSON);
    const viz = await hydrateViz(page.locator('body'));
    const slider = viz.locator('[data-viz-slider]');
    const opacity = () => slider.evaluate((el) => getComputedStyle(el).opacity);

    // At rest: painted away, but still laid out and still in the aria tree —
    // never `display: none` or `visibility: hidden`, either of which would take
    // it out of both.
    expect(Number(await opacity())).toBe(0);
    await expect(slider).toBeVisible();
    await expect(slider).toHaveAttribute('aria-valuetext', /^Step 1 of \d+$/);

    // Focused: revealed, with its name, and operable exactly as before.
    await slider.focus();
    expect(Number(await opacity())).toBe(1);
    await expect(viz.locator('.viz-scrub__label')).toBeVisible();
    await page.keyboard.press('End');
    await expect(viz.locator('[data-viz-counter]')).toHaveText('4 / 4');
  });
});

/**
 * The existing axe gate (`m4-lessons.spec.ts`) cannot see this table: a closed
 * `<details>` renders `display: none`, so every colour, name and region inside
 * it is invisible to a scan of the page as loaded. Opening them all first is the
 * only way the ledger is audited at all — and it immediately earned its keep:
 * the well is a scroll container in both axes, and before it was given
 * `tabindex="0"` axe reported `scrollable-region-focusable` (serious) on all
 * three sorting-basics wells, in both themes.
 */
test.describe('axe, with every ledger opened', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`sorting-basics scans clean in ${theme}`, async ({ page }) => {
      // The heaviest scan in the suite by some way: three hydrated instruments
      // plus 93 open ledger rows, measured at 9.5–11.5s locally and timed out at
      // the default 30s in the pinned container under worker contention. This is
      // the documented answer for a test that is genuinely slow rather than
      // stuck — the same contention already flakes the four shipped axe specs.
      test.slow();
      await page.addInitScript(
        (value) => localStorage.setItem('theme', value),
        theme,
      );
      // Three instruments, the longest authored runs on the site (29/33/31
      // rows), and therefore the widest and tallest wells.
      await page.goto('/learn/sorting-basics');
      const roots = page.locator('[data-viz]');
      const count = await roots.count();
      for (let i = 0; i < count; i += 1) {
        await roots.nth(i).scrollIntoViewIfNeeded();
        await expect(roots.nth(i)).toHaveAttribute('data-viz-ready', 'true', {
          timeout: 15_000,
        });
      }
      await page
        .locator('[data-ledger]')
        .evaluateAll((els) => els.forEach((el) => el.setAttribute('open', '')));

      const results = await new AxeBuilder({ page }).analyze();
      const offenders = results.violations
        .filter((v) => v.impact === 'critical' || v.impact === 'serious')
        .flatMap((v) =>
          v.nodes.map((n) => `${v.impact} ${v.id}: ${n.target.join(' ')}`),
        )
        // The same tracked Shiki code-comment contrast debt m4-lessons excludes.
        .filter((entry) => !/astro-code|data-language|\.line/.test(entry));

      expect(offenders).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// Task 4 — the island: the table follows the run, and its rows seek
// ---------------------------------------------------------------------------

/** The bubble-sort instrument on `sorting-basics`, and its authored run. */
const SORTING = '/learn/sorting-basics';
const BUBBLE = {
  authored: 29,
  custom: '[9,8,7,6,5,4,3,2,1]',
  steps: 82,
} as const;

/**
 * A 30-element descending array — the §11 input cap, and the worst case the row
 * cap was sized against. 901 steps, the exact number the design measured.
 */
const CAPPING = {
  input:
    '[30,29,28,27,26,25,24,23,22,21,20,19,18,17,16,15,14,13,12,11,10,9,8,7,6,5,4,3,2,1]',
  steps: 901,
} as const;

/** The one row the Player is on, if the table is showing it. */
function currentRow(ledger: Locator): Locator {
  return ledger.locator('[data-ledger-row][aria-current="step"]');
}

/** Every seek button that is a tab stop — the roving tabindex, read back. */
function tabStops(ledger: Locator): Locator {
  return ledger.locator('[data-ledger-seek][tabindex="0"]');
}

/**
 * A structural projection of one rendered ledger.
 *
 * Two renderers draw this table — `Ledger.astro` at build time and the island's
 * rebuild — so the only thing pinning them together is a comparison of what they
 * produce. Deliberately NOT `outerHTML`: Astro's template whitespace differs
 * from `createElement`'s by construction, and a test that failed on indentation
 * would be deleted rather than fixed.
 */
async function ledgerShape(ledger: Locator): Promise<unknown> {
  return ledger.evaluate((root) => ({
    count: root.querySelector('[data-ledger-count]')?.textContent ?? null,
    cap: root.querySelector('[data-ledger-cap]')?.textContent ?? null,
    caption: root.querySelector('caption')?.textContent?.trim() ?? null,
    headers: [...root.querySelectorAll('thead th')].map((th) => [
      th.tagName,
      th.className,
      th.getAttribute('scope'),
      th.textContent,
    ]),
    rows: [...root.querySelectorAll('tbody tr')].map((tr) => ({
      id: tr.id,
      index: tr.getAttribute('data-ledger-row'),
      current: tr.getAttribute('aria-current'),
      cells: [...tr.children].map((cell) => [
        cell.tagName,
        cell.className,
        cell.getAttribute('scope'),
        cell.textContent,
      ]),
      seek: [
        ...tr.querySelectorAll<HTMLButtonElement>('[data-ledger-seek]'),
      ].map((button) => [
        button.getAttribute('aria-label'),
        button.dataset['ledgerSeek'],
        button.tabIndex,
        button.disabled,
        button.type,
      ]),
    })),
  }));
}

test.describe('the ledger follows the run', () => {
  /**
   * THE DEFECT THIS TASK EXISTS TO FIX. The abandoned build derived the table
   * once, in frontmatter, and captured its rows at setup; neither `loadTrace`
   * call site touched it. A reader who ran their own input got the OLD table
   * beside the NEW drawing — at the input caps, a 29-row table against a
   * 901-step run, where the "you are here" mark simply vanishes.
   */
  test('a custom run replaces the table, and the mark still resolves', async ({
    page,
  }) => {
    await page.goto(SORTING);
    const viz = await hydrateViz(page.locator('body'));
    const ledger = ledgerOf(viz);
    const rows = ledger.locator('[data-ledger-row]');
    await ledger.locator('summary').click();

    await expect(rows).toHaveCount(BUBBLE.authored);
    await expect(ledger.locator('[data-ledger-count]')).toHaveText(
      `(${BUBBLE.authored} steps)`,
    );
    await expect(currentRow(ledger)).toHaveAttribute('data-ledger-row', '0');

    await viz.locator('[data-viz-array]').fill(BUBBLE.custom);
    await viz.locator('[data-viz-run]').click();
    await expect(counter(viz)).toHaveText(`1 / ${BUBBLE.steps}`);

    // The table is the new run's, in every part of itself: its rows, its
    // disclosure count, and the caption a screen reader hears.
    await expect(rows).toHaveCount(BUBBLE.steps);
    await expect(ledger.locator('[data-ledger-count]')).toHaveText(
      `(${BUBBLE.steps} steps)`,
    );
    await expect(ledger.getByRole('table')).toHaveAccessibleName(
      new RegExp(`${BUBBLE.steps} rows`),
    );
    // And the cells describe THIS run, not the previous one — the failure the
    // whole task is about is the old numbers printed beside the new drawing.
    // Row 2 is the first comparison, so it names the reader's own values.
    await expect(rows.nth(1)).toContainText(
      'Compare index 0 (9) and index 1 (8).',
    );

    // The reader's own disclosure state survives the swap: the rebuild replaces
    // the table's inner regions and never the `<details>` around them.
    await expect(ledger).toHaveAttribute('open', /.*/);

    // The "you are here" mark survives the swap and keeps tracking.
    await expect(currentRow(ledger)).toHaveAttribute('data-ledger-row', '0');
    await viz.locator('[data-viz-forward]').click();
    await expect(currentRow(ledger)).toHaveCount(1);
    await expect(currentRow(ledger)).toHaveAttribute('data-ledger-row', '1');
  });

  /**
   * The only thing pinning the island's DOM builder to the Astro template is a
   * comparison of the two, and "Restore example" is the one input where they
   * must agree exactly: it re-runs the AUTHORED trace, so the rebuilt table has
   * to come out identical to the one the build shipped — same ids, same classes,
   * same scopes, same cells, same roving tab stop.
   */
  test('rebuilding the authored run reproduces the server render exactly', async ({
    page,
  }) => {
    await page.goto(LESSON);
    const viz = await hydrateViz(page.locator('body'));
    const ledger = ledgerOf(viz);
    // Read AFTER hydration, so the comparison includes what `wireLedger` does to
    // the server's markup (buttons enabled, one roving tab stop, the mark on
    // row 0) rather than treating those as a difference.
    const server = await ledgerShape(ledger);

    // A run of a DIFFERENT length, so "the table came back" cannot pass by
    // never having changed: [1..20] target=0 collapses to the empty window in
    // six steps.
    await viz
      .locator('[data-viz-array]')
      .fill('[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]');
    await viz.locator('[data-viz-target]').fill('0');
    await viz.locator('[data-viz-run]').click();
    await expect(counter(viz)).toHaveText('1 / 6');

    await viz.locator('[data-viz-restore]').click();
    await expect(counter(viz)).toHaveText('1 / 4');
    expect(await ledgerShape(ledger)).toEqual(server);
  });
});

test.describe('the rows are the pointer scrub', () => {
  test('clicking a row seeks the player, and the mark follows', async ({
    page,
  }) => {
    await page.goto(LESSON);
    const viz = await hydrateViz(page.locator('body'));
    const ledger = ledgerOf(viz);
    await ledger.locator('summary').click();

    // Enabled — and the affordance is back with them. Task 3 shipped the
    // unavailable state on the AFFORDANCE channel rather than on opacity
    // (the label is the step NUMBER, which is data), so this is its inverse.
    const seek = ledger.getByRole('button', { name: 'Go to step 3' });
    await expect(seek).toBeEnabled();
    expect(await seek.evaluate((el) => getComputedStyle(el).cursor)).toBe(
      'pointer',
    );
    expect(
      await seek.evaluate((el) => getComputedStyle(el).textDecorationLine),
    ).toBe('underline');

    await seek.click();
    await expect(counter(viz)).toHaveText('3 / 4');
    await expect(currentRow(ledger)).toHaveAttribute('data-ledger-row', '2');
    // The drawing moved with it — the table seeks the one Player, and never
    // holds an index of its own.
    await expect(viz.locator('[data-viz-slider]')).toHaveValue('2');
  });

  /**
   * ONE tab stop for the whole table. A 200-row run would otherwise cost a
   * keyboard reader 200 stops to get past the instrument; the arrow keys move
   * between rows from the one stop, the way a grid of controls already behaves.
   */
  test('the table is one tab stop, and the arrow keys walk it', async ({
    page,
  }) => {
    await page.goto(LESSON);
    const viz = await hydrateViz(page.locator('body'));
    const ledger = ledgerOf(viz);
    await ledger.locator('summary').click();

    await expect(ledger.locator('[data-ledger-seek]')).toHaveCount(4);
    await expect(tabStops(ledger)).toHaveCount(1);
    await expect(tabStops(ledger)).toHaveAccessibleName('Go to step 1');

    await tabStops(ledger).focus();
    await page.keyboard.press('ArrowDown');
    await expect(counter(viz)).toHaveText('2 / 4');
    await expect(
      ledger.getByRole('button', { name: 'Go to step 2' }),
    ).toBeFocused();
    // The stop roves with the mark: still exactly one, and now on row 2.
    await expect(tabStops(ledger)).toHaveCount(1);
    await expect(tabStops(ledger)).toHaveAccessibleName('Go to step 2');

    await page.keyboard.press('End');
    await expect(counter(viz)).toHaveText('4 / 4');
    await page.keyboard.press('Home');
    await expect(counter(viz)).toHaveText('1 / 4');
    // Swallowed at the bound rather than wrapping or scrolling the page.
    await page.keyboard.press('ArrowUp');
    await expect(counter(viz)).toHaveText('1 / 4');
    await expect(tabStops(ledger)).toHaveCount(1);
  });

  /**
   * ←/→ belong to the well, not to the transport. The well is a scroll container
   * in BOTH axes by construction, and on a narrow screen the cost column is only
   * reachable by scrolling it sideways — stealing its keys for the step buttons
   * would leave that content unreachable by keyboard (2.1.1), which is the same
   * carve-out the canvas already has.
   */
  test('left and right inside the table do not step the player', async ({
    page,
  }) => {
    await page.goto(LESSON);
    const viz = await hydrateViz(page.locator('body'));
    const ledger = ledgerOf(viz);
    await ledger.locator('summary').click();

    await tabStops(ledger).focus();
    await page.keyboard.press('ArrowRight');
    await expect(counter(viz)).toHaveText('1 / 4');
    await page.keyboard.press('ArrowLeft');
    await expect(counter(viz)).toHaveText('1 / 4');
    // The transport still owns them everywhere else on the instrument.
    await viz.locator('[data-viz-play]').focus();
    await page.keyboard.press('ArrowRight');
    await expect(counter(viz)).toHaveText('2 / 4');
  });
});

test.describe('the row cap, on the path where it can actually bind', () => {
  /**
   * The server-rendered path can never reach the cap — the longest authored run
   * ships 33 rows against a cap of 200 — so this is the only place the rule is
   * observable at all. One rule, both paths: the same `buildLedger` call, the
   * same 200, and the same notice naming both numbers.
   */
  test('a 901-step custom run shows 200 rows and says so', async ({ page }) => {
    await page.goto(SORTING);
    const viz = await hydrateViz(page.locator('body'));
    const ledger = ledgerOf(viz);
    await ledger.locator('summary').click();
    await expect(ledger.locator('[data-ledger-cap]')).toHaveCount(0);

    await viz.locator('[data-viz-array]').fill(CAPPING.input);
    await viz.locator('[data-viz-run]').click();
    await expect(counter(viz)).toHaveText(`1 / ${CAPPING.steps}`);

    await expect(ledger.locator('[data-ledger-row]')).toHaveCount(200);
    // NO SILENT CAPS: both numbers, in words, with an action.
    await expect(ledger.locator('[data-ledger-cap]')).toHaveText(
      `Showing the first 200 of ${CAPPING.steps} steps. Narrow the input to see the whole run.`,
    );
    // The disclosure still reports the TRUE length of the run, because that is
    // what the reader asked for and what the transport is indexing into.
    await expect(ledger.locator('[data-ledger-count]')).toHaveText(
      `(${CAPPING.steps} steps)`,
    );
    await expect(ledger.getByRole('table')).toHaveAccessibleName(/200 rows/);

    // Past the cap there is no row to mark — `aria-current` stays off, which is
    // honest — but the table must not stop being reachable by keyboard, so the
    // one tab stop falls to the last rendered row.
    await viz.locator('[data-viz-slider]').fill('500');
    await expect(counter(viz)).toHaveText(`501 / ${CAPPING.steps}`);
    await expect(currentRow(ledger)).toHaveCount(0);
    await expect(tabStops(ledger)).toHaveCount(1);
    await expect(tabStops(ledger)).toHaveAccessibleName('Go to step 200');

    // And back inside it, the mark returns.
    await viz.locator('[data-viz-slider]').fill('12');
    await expect(currentRow(ledger)).toHaveAttribute('data-ledger-row', '12');

    // The notice goes when it stops being true — a cap that announced itself on
    // a run it did not bind would be the same lie in the other direction.
    await viz.locator('[data-viz-restore]').click();
    await expect(counter(viz)).toHaveText(`1 / ${BUBBLE.authored}`);
    await expect(ledger.locator('[data-ledger-cap]')).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Task 5 (P0) — the ledger is Predict mode's answer key
// ---------------------------------------------------------------------------

/**
 * Binary search's FOURTH row, verbatim.
 *
 * At step 3 the predictor asks what happens next and grades against
 * `trace[i + 1]`; this sentence is that step. The `mid` value in it answers the
 * other two questions the run asks. It is the sharpest available probe for "is
 * the answer on screen", because nothing else on the page prints `i + 1`.
 */
const ANSWER_KEY = 'Middle index 3 holds 7, which equals the target.';

/** The stated reason — the "with a reason" half of hiding the table. */
const PREDICT_NOTE =
  'Auto-play and scrubbing are off while Predict is on, and the run table is hidden — it would give the next step away. Step forward moves on without answering.';

/** The Predict toggle on the binary-search instrument. */
function predictToggleOf(viz: Locator): Locator {
  return viz.locator('[data-viz-predict]');
}

test.describe('Predict hides the ledger, because the ledger is the answer key', () => {
  /**
   * Predict grades ONE STEP AHEAD precisely so the answer is not on screen —
   * `binary-search.ts` says so — and every predictor grades against
   * `trace[i + 1]`. The ledger renders every step including that one, with its
   * state columns and its authored sentence. For bubble and insertion sort the
   * `swaps` column IS the grading expression (`nextSwaps > swaps ? 0 : 1`).
   *
   * HIDDEN, not blanked: blanking the rows past the current one still leaks
   * through the row count.
   */
  test('the whole table goes, and the note says why', async ({ page }) => {
    await page.goto(LESSON);
    const viz = await hydrateViz(page.locator('body'));
    const ledger = ledgerOf(viz);
    await ledger.locator('summary').click();

    // The leak, before the gate: the answer is right there, four rows down.
    await expect(ledger).toContainText(ANSWER_KEY);

    await predictToggleOf(viz).click();
    await expect(ledger).toBeHidden();
    // Not one row, not one cell, not the count of them.
    await expect(ledger.locator('[data-ledger-row]:visible')).toHaveCount(0);
    await expect(page.locator('[data-viz-predict-note]')).toHaveText(
      PREDICT_NOTE,
    );

    // And it comes back, in the state the reader left it in.
    await predictToggleOf(viz).click();
    await expect(ledger).toBeVisible();
    await expect(ledger).toHaveAttribute('open', /.*/);
    await expect(ledger).toContainText(ANSWER_KEY);
  });

  /**
   * "Styling a leak is not hiding it" is a rule this codebase already wrote
   * down, and these are the four channels that defeat opacity and colour. All
   * four are closed by one `hidden`, which is why the gate is an attribute
   * rather than a stylesheet.
   */
  test('hidden survives the four channels that defeat dimming', async ({
    page,
  }) => {
    await page.goto(LESSON);
    const viz = await hydrateViz(page.locator('body'));
    const ledger = ledgerOf(viz);
    await ledger.locator('summary').click();
    await predictToggleOf(viz).click();
    await expect(ledger).toBeHidden();

    // 1. The accessibility tree: no table, no rowheaders, no seek buttons.
    await expect(ledger.getByRole('table')).toHaveCount(0);
    await expect(ledger.getByRole('rowheader')).toHaveCount(0);
    await expect(ledger.getByRole('button')).toHaveCount(0);
    // 2. Select-all / find-in-page: `innerText` is the rendered text, so a
    //    display:none subtree contributes nothing to either.
    expect(await page.locator('body').innerText()).not.toContain(ANSWER_KEY);
    // 3. Print.
    await page.emulateMedia({ media: 'print' });
    await expect(ledger).toBeHidden();
    await page.emulateMedia({ media: 'screen' });
    // 4. Forced colors, which flattens every paint-level signal there is.
    await page.emulateMedia({ forcedColors: 'active' });
    await expect(ledger).toBeHidden();
    await page.emulateMedia({ forcedColors: 'none' });
  });

  /**
   * `?review=1` opens Predict automatically, so `/learn`'s spaced-review card is
   * precisely the deep link that would have landed a reader on the answer key —
   * and a passing session writes a REAL mastery state (`passFloor` is 3 here,
   * and a pass calls `recordPass` -> Practiced). This is the path the gate
   * exists for.
   */
  test('the review deep link cannot land on the answer key', async ({
    page,
  }) => {
    await page.goto(`${LESSON}?review=1`);
    const viz = await hydrateViz(page.locator('body'));

    // Predict really is on — otherwise "hidden" below would prove nothing.
    await expect(predictToggleOf(viz)).toHaveAttribute('aria-pressed', 'true');
    await expect(ledgerOf(viz)).toBeHidden();
    expect(await page.locator('body').innerText()).not.toContain(ANSWER_KEY);

    // The instrument beside it has no predictor, so nothing was taken from it:
    // the gate follows the mode, not the page.
    const linear = page.locator('[data-viz][data-algorithm="linear-search"]');
    await expect(ledgerOf(linear)).toBeVisible();
  });

  /**
   * The one in-mode action that rebuilds the hidden table.
   *
   * A predict session deliberately survives a custom run — it is how a reader
   * reaches the five-answer session bar on a lesson whose authored run is
   * shorter (`utils/predict.ts` says so) — and that path goes through
   * `applyTrace`, which redraws every row of the ledger. The gate has to hold
   * across it: `hidden` lives on the `<details>` and `setPredict` is its only
   * writer, so the rebuild must reconstruct the new run's rows UNDER a table
   * that is still gone.
   */
  test('a custom run mid-session rebuilds the table without revealing it', async ({
    page,
  }) => {
    await page.goto(LESSON);
    const viz = await hydrateViz(page.locator('body'));
    const ledger = ledgerOf(viz);
    await ledger.locator('summary').click();
    await predictToggleOf(viz).click();
    await expect(ledger).toBeHidden();

    await viz
      .locator('[data-viz-array]')
      .fill('[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]');
    await viz.locator('[data-viz-target]').fill('0');
    await viz.locator('[data-viz-run]').click();
    await expect(counter(viz)).toHaveText('1 / 6');

    // The rebuild happened — a locator counts nodes whether or not they are
    // painted, so this is the new run's six rows — and it is still hidden.
    await expect(ledger.locator('[data-ledger-row]')).toHaveCount(6);
    await expect(ledger).toBeHidden();
    expect(await page.locator('body').innerText()).not.toContain(
      'Search window is indices',
    );

    // And what comes back is THIS run, not the one the build shipped.
    await predictToggleOf(viz).click();
    await expect(ledger).toBeVisible();
    await expect(ledger.getByRole('table')).toHaveAccessibleName(/6 rows/);
  });

  /**
   * The second breach §4 found: the row buttons are a scrub channel, and the
   * slider's handler already declines while predicting — "scrubbing past a
   * question is the one thing predict mode exists to prevent".
   *
   * Forced through `evaluate` on purpose. A reader cannot reach these while the
   * table is hidden, so a normal click would only be re-proving the hiding; the
   * guard is what still holds if the hiding ever regresses, and only a
   * synthetic activation can see it.
   */
  test('row seeks are declined while predicting, like the slider', async ({
    page,
  }) => {
    await page.goto(LESSON);
    const viz = await hydrateViz(page.locator('body'));
    const ledger = ledgerOf(viz);
    await ledger.locator('summary').click();
    await predictToggleOf(viz).click();
    await expect(counter(viz)).toHaveText('1 / 4');

    const seek = ledger.locator('[data-ledger-seek]').nth(3);
    await seek.evaluate((el: HTMLElement) => el.click());
    await expect(counter(viz)).toHaveText('1 / 4');
    // The keyboard route through the same rows is guarded on the same flag.
    await seek.evaluate((el: HTMLElement) =>
      el.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
      ),
    );
    await expect(counter(viz)).toHaveText('1 / 4');

    // Turning it off restores both, so nothing about the decline is sticky.
    await predictToggleOf(viz).click();
    await ledger.locator('[data-ledger-seek]').nth(3).click();
    await expect(counter(viz)).toHaveText('4 / 4');
  });
});

// ---------------------------------------------------------------------------
// Task 6 — <StepLink>, and the three things sitting on top of a table row
// ---------------------------------------------------------------------------

/** The lesson's own link to step 4 — the row where the target is found. */
function stepLink(page: Page, step: number): Locator {
  return page.locator(`a[data-step-link][href$="-row-${step}"]`);
}

/**
 * Where the sticky chrome ends, measured rather than assumed.
 *
 * The site header is sticky at every width; the mini-ToC bar is sticky only
 * below 1024px, where it collapses from a rail into a bar. Taking the max of
 * whatever is actually sticky keeps one assertion honest at both widths.
 */
async function chromeBottom(page: Page): Promise<number> {
  return page.evaluate(() =>
    Math.max(
      0,
      ...[...document.querySelectorAll('header, .toc--inline')]
        .filter((el) => getComputedStyle(el).position === 'sticky')
        .map((el) => el.getBoundingClientRect().bottom),
    ),
  );
}

/** Everything about where the row ended up, in one round trip. */
async function landing(
  page: Page,
  step: number,
): Promise<{
  rowTop: number;
  rowBottom: number;
  wellTop: number;
  wellBottom: number;
  stickyHeadBottom: number;
  wellScrollTop: number;
  vizScrollTop: number;
  vizScrollLeft: number;
  vizOverflows: boolean;
}> {
  return page.evaluate((step) => {
    const link = document.querySelector<HTMLAnchorElement>(
      `a[data-step-link][href$="-row-${step}"]`,
    );
    const row = document.getElementById(
      link?.getAttribute('href')?.slice(1) ?? '',
    );
    const well = row?.closest<HTMLElement>('[data-ledger-well]');
    const viz = row?.closest<HTMLElement>('.viz');
    const head = well?.querySelector('thead th');
    const rowBox = row?.getBoundingClientRect();
    const wellBox = well?.getBoundingClientRect();
    return {
      rowTop: rowBox?.top ?? Number.NaN,
      rowBottom: rowBox?.bottom ?? Number.NaN,
      wellTop: wellBox?.top ?? Number.NaN,
      wellBottom: wellBox?.bottom ?? Number.NaN,
      stickyHeadBottom: head?.getBoundingClientRect().bottom ?? Number.NaN,
      wellScrollTop: well?.scrollTop ?? Number.NaN,
      vizScrollTop: viz?.scrollTop ?? Number.NaN,
      vizScrollLeft: viz?.scrollLeft ?? Number.NaN,
      vizOverflows:
        !!viz &&
        (viz.scrollHeight > viz.clientHeight ||
          viz.scrollWidth > viz.clientWidth),
    };
  }, step);
}

/**
 * `prefers-reduced-motion: reduce` throughout, and not for tidiness: the site
 * sets `scroll-behavior: smooth` under `no-preference` (M7.1 MOT-1), so every
 * assertion below would otherwise be racing an animation. Under `reduce` the
 * jump is instantaneous and what is measured is where the reader ends up.
 */
test.describe('<StepLink> — a sentence that points at a row', () => {
  // Per page rather than `test.use`: `reducedMotion` is a browser-context
  // option in this Playwright, not a test option, and `emulateMedia` is how the
  // rest of this suite already reaches the same media query.
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  /**
   * The defect this whole task exists for. A `<tr>` inherits no
   * `scroll-margin-top` — the only rule covering lesson-body content is scoped
   * to `h2`/`h3` — and every anchor target on a lesson page until now was a
   * heading, which is why nothing caught it. Measured before the fix, at
   * 900x800: the row landed at y=18.7 with the header ending at 64 and the
   * sticky ToC bar at 109. It was entirely behind the chrome.
   *
   * Deliberately WITHOUT `hydrateViz`: scrolling the instrument into view is
   * what mounts the island, so hydrating first would test the one state the
   * reader who clicks a link from the prose above is never in.
   */
  test('lands the row below the sticky header and the ToC bar', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto(LESSON);

    await stepLink(page, 4).click();
    await waitForAnchorScroll(page);

    const chrome = await chromeBottom(page);
    expect(chrome).toBeGreaterThan(100); // the ToC bar really is sticky here
    const at = await landing(page, 4);
    expect(at.rowTop).toBeGreaterThanOrEqual(chrome);
    // …and not so far down that the reader has to hunt for it.
    expect(at.rowTop).toBeLessThan(chrome + 32);
    // The disclosure opened, and the address bar kept the anchor so the reader
    // can share exactly the step they are reading.
    await expect(ledgerOf(page.locator('[data-viz]').first())).toHaveAttribute(
      'open',
      /.*/,
    );
    expect(page.url()).toContain('-row-4');
  });

  /**
   * Occluder two: the well's column headers are `position: sticky`, so the top
   * ~35px of the scroll region is not a place a row can be seen. "Inside the
   * well" and "visible" are different tests, and the well correction is what
   * separates them.
   */
  test('lands it clear of the well and of its sticky header row', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(LESSON);

    await stepLink(page, 4).click();
    await waitForAnchorScroll(page);

    const at = await landing(page, 4);
    // Inside the well's viewport…
    expect(at.rowTop).toBeGreaterThanOrEqual(at.wellTop - 1);
    expect(at.rowBottom).toBeLessThanOrEqual(at.wellBottom + 1);
    // …and below the header row that floats over the top of it.
    expect(at.rowTop).toBeGreaterThanOrEqual(at.stickyHeadBottom - 1);
    // The narrow well (12rem) cannot show four wrapped rows at once, so this is
    // a real correction rather than a no-op that happened to pass.
    expect(at.wellScrollTop).toBeGreaterThan(0);
  });

  /**
   * Occluder three, which the design flagged as UNVERIFIED: `.viz` is
   * `overflow: hidden`, which makes it a scroll container, and fragment
   * navigation scrolls every scrollable ancestor of its target — which would
   * move a row out from under the reader with no scrollbar to put it back.
   *
   * It cannot happen: the canvas and the well are both inner scrollers, so they
   * absorb the overflow before it reaches that box, which measures
   * `scrollHeight === clientHeight` and `scrollWidth === clientWidth`. This is
   * the regression test for the day something is added that can outgrow it.
   */
  test('never scrolls the instrument’s own overflow:hidden wrapper', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(LESSON);
    await stepLink(page, 4).click();
    await waitForAnchorScroll(page);

    const at = await landing(page, 4);
    expect(at.vizOverflows).toBe(false);
    expect(at.vizScrollTop).toBe(0);
    expect(at.vizScrollLeft).toBe(0);
  });

  /**
   * The island mounts from an `IntersectionObserver`, so this jump is what
   * STARTS the instrument it lands in — and the first thing the island does is
   * mark step 0's row. Marking used to scroll the well to whatever row it
   * marked, which yanked the reader from the row they had just asked for back
   * to row 1, a beat after they arrived. A mark that has not moved has nothing
   * to follow.
   */
  test('hydrating afterwards does not undo the jump', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(LESSON);
    await stepLink(page, 4).click();
    await waitForAnchorScroll(page);
    const before = await landing(page, 4);

    // The click scrolled the instrument into view, which is what mounts it.
    await expect(page.locator('[data-viz]').first()).toHaveAttribute(
      'data-viz-ready',
      'true',
      { timeout: 15_000 },
    );
    const after = await landing(page, 4);

    expect(after.wellScrollTop).toBe(before.wellScrollTop);
    expect(after.rowTop).toBeCloseTo(before.rowTop, 0);
    // The mark is still on step 1, where the Player is: the jump moved the
    // reader, not the run.
    await expect(
      currentRow(ledgerOf(page.locator('[data-viz]').first())),
    ).toHaveAttribute('data-ledger-row', '0');
  });

  /**
   * With no JavaScript the CSS is the whole mechanism, and it has to be — this
   * table IS the lesson for that reader. The two paths are asserted to land in
   * the same place, which is what makes the duplicated offset (CSS rule +
   * `getComputedStyle` read) a single source of truth rather than two.
   *
   * The `<details>` opens here without a line of site code: Chromium expands a
   * closed disclosure when a fragment navigation targets something inside it
   * (verified in the pinned container). Engine behaviour, relied on for the
   * no-JS path only — the script opens it explicitly everywhere else.
   */
  test.describe('with JavaScript disabled', () => {
    test.use({ javaScriptEnabled: false });

    test('the anchor alone lands in the same place', async ({ page }) => {
      await page.setViewportSize({ width: 900, height: 800 });
      await page.goto(LESSON);

      await stepLink(page, 4).click();
      await waitForAnchorScroll(page);

      const chrome = await chromeBottom(page);
      const at = await landing(page, 4);
      expect(at.rowTop).toBeGreaterThanOrEqual(chrome);
      expect(at.rowTop).toBeLessThan(chrome + 32);
      expect(at.rowTop).toBeGreaterThanOrEqual(at.stickyHeadBottom - 1);
    });
  });

  /**
   * The link cannot be a hole in the predict gate, and it cannot be a dead
   * click either — "a link that silently does nothing is worse than one that
   * isn't there". The table is the answer key while Predict is on, so the
   * reader is taken to the instrument's own note, which is visible only in that
   * mode and says why the table is gone.
   */
  test('while Predict is on it lands on the note, not on the answer', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto(LESSON);
    const viz = await hydrateViz(page.locator('body'));
    await predictToggleOf(viz).click();
    await expect(ledgerOf(viz)).toBeHidden();
    await scrollToInstant(page, 0);

    await stepLink(page, 4).click();
    await waitForAnchorScroll(page);

    // Nothing was revealed: the disclosure did not open and the answer is not
    // on the page in any channel.
    await expect(ledgerOf(viz)).toBeHidden();
    await expect(ledgerOf(viz)).not.toHaveAttribute('open', /.*/);
    expect(await page.locator('body').innerText()).not.toContain(ANSWER_KEY);

    // And the reader is somewhere that answers their question.
    const note = page.locator('[data-viz-predict-note]');
    await expect(note).toBeVisible();
    const chrome = await chromeBottom(page);
    const noteTop = await note.evaluate((el) => el.getBoundingClientRect().top);
    expect(noteTop).toBeGreaterThanOrEqual(chrome);
    expect(noteTop).toBeLessThan(chrome + 32);
  });

  /**
   * The half a build-time check cannot see. `<StepLink>` validates its algorithm
   * and renderer against the registry at build time, but it cannot know how long
   * the run is — that depends on the input the `<Visualizer>` was authored with
   * — nor that the instrument it names is the one on this page. So the site is
   * walked instead: every link, on every published lesson, must resolve.
   */
  test('every StepLink the site ships points at a row that exists', async ({
    page,
  }) => {
    const lessons = await curriculum(page);
    let found = 0;

    for (const lesson of lessons) {
      await page.goto(`/learn/${lesson.slug}`);
      const targets = await page
        .locator('a[data-step-link]')
        .evaluateAll((links) =>
          links.map((link) => ({
            href: link.getAttribute('href') ?? '',
            instrument: (link as HTMLElement).dataset['stepLink'] ?? '',
            resolves: !!document.getElementById(
              link.getAttribute('href')?.slice(1) ?? '',
            ),
            instrumentResolves: !!document.getElementById(
              (link as HTMLElement).dataset['stepLink'] ?? '',
            ),
          })),
        );

      for (const target of targets) {
        found += 1;
        expect(
          target.resolves,
          `${lesson.slug}: <StepLink> ${target.href} points at no row. The step number is past the end of that instrument's authored run, or the algorithm/renderer pair names a different instrument.`,
        ).toBe(true);
        expect(
          target.instrumentResolves,
          `${lesson.slug}: <StepLink> ${target.href} names instrument #${target.instrument}, which is not on this page.`,
        ).toBe(true);
      }
    }

    // The walk must not be able to pass by finding nothing.
    expect(found).toBeGreaterThan(0);
  });
});

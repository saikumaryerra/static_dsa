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
import { counter, hydrateViz } from './utils/predict';

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

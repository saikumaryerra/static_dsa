/**
 * M7.3 — the two rendering modes nobody looks at until a reader is stuck in one
 * (docs/m7-ux-overhaul.md, Phase M7.3: PRN-1 and HCM-1).
 *
 * PRINT. "Print this lesson" has to yield a study sheet, not a paper screenshot
 * of a web app: chrome that cannot be used on paper goes, the drawing and its
 * explanation stay, and the Practice answers come back. The one that actually
 * bites is colour — browsers drop background COLOURS when printing but never
 * text colours, so a dark-theme page printed as authored is near-white text on
 * white paper. `global.css`'s `@media print` block forces the light palette to
 * fix that, and it has to WIN over both dark selectors to do it: over
 * `[data-theme="dark"]` on specificity, and over the `prefers-color-scheme`
 * mirror — which still matches while printing — on source order alone. That is a
 * cascade claim, so it is asserted by reading back resolved colours, in both of
 * the ways a page can be dark.
 *
 * FORCED COLORS. In Windows High Contrast the engine overrides author `fill` and
 * `stroke`, so the drawing's whole colour layer — every `--hl-*` state, each a
 * `color-mix()` fill plus a matching stroke — collapses into one system colour,
 * and "comparing" and "found" stop being different pictures in the one module
 * this site exists for. The state has to survive on the channels forced colours
 * preserve: stroke width, dash pattern, and the glyph band. `emulateMedia` makes
 * the media query match, which is what the re-encoding hangs off.
 *
 * The forced-colors half is written against the MAPPING TABLE in
 * `Visualizer.astro` — all ten states, not a sample — because that table is the
 * design: it is the thing that has to stay collision-free as states are added,
 * and it is declared in three places (the visualizer's `is:global` block plus
 * the two build-time stills, which ship outside it and so carry their own
 * smaller copies).
 *
 * Both are invisible to every other suite: the visual baseline captures screen
 * media in one colour mode, and axe evaluates neither.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { computed, contrast, luminance, PAPER, parseRgb } from './utils/color';

const LESSON = '/learn/binary-search';
/** Wide enough that the rail and the one-row control bar are on screen first. */
const DESKTOP = { width: 1280, height: 1000 };

/** Layout-only height, readable even for a box the UA is not painting. */
function rectHeight(locator: Locator): Promise<number> {
  return locator.evaluate((el) => el.getBoundingClientRect().height);
}

/** The page's resolved text colour and canvas fill, as the engine reports them. */
async function palette(
  page: Page,
): Promise<{ text: string; background: string }> {
  return {
    // A body paragraph, not the h1: prose is what a printed sheet is mostly
    // made of, and it inherits `--text` through the same chain everything else
    // does.
    text: await computed(page.locator('.lesson-body p').first(), 'color'),
    background: await computed(page.locator('html'), 'backgroundColor'),
  };
}

/** The Practice disclosure whose answer this file checks, closed by default. */
function practiceAnswer(page: Page): Locator {
  return page
    .locator('details.collapsible')
    .filter({
      has: page.locator('summary', { hasText: 'Show answer to question 1' }),
    })
    .first();
}

// ---------------------------------------------------------------------------
// PRN-1 — the print stylesheet
// ---------------------------------------------------------------------------

test.describe('print stylesheet', () => {
  test.use({ viewport: DESKTOP });

  test('drops the chrome and keeps the lesson', async ({ page }) => {
    await page.goto(LESSON);

    // Every assertion here is a DELTA: asserting only the printed state would
    // pass just as well against a rule that hid these things on screen too.
    const chrome = [
      '.site-header',
      '.lesson__rail',
      '.viz-controls',
      '.whats-next',
      '.codetabs__copy',
    ];
    for (const selector of chrome) {
      await expect(page.locator(selector).first()).toBeVisible();
    }
    await expect(page.getByRole('contentinfo')).toBeVisible();

    await page.emulateMedia({ media: 'print' });

    for (const selector of chrome) {
      await expect(page.locator(selector).first()).toBeHidden();
    }
    await expect(page.getByRole('contentinfo')).toBeHidden();

    // What is left is the reason a lesson is worth printing at all.
    const viz = page.locator('#viz-binary-search');
    await expect(viz.locator('.viz-canvas svg')).toBeVisible();
    const explanation = viz.locator('.viz-explain');
    await expect(explanation).toBeVisible();
    await expect(explanation).not.toBeEmpty();
  });

  test('reveals the Practice answers', async ({ page }) => {
    await page.goto(LESSON);

    const answer = practiceAnswer(page).locator('.collapsible__content');
    // Closed on screen: `::details-content` is `content-visibility: hidden`, so
    // the answer is not laid out.
    expect(await rectHeight(answer)).toBe(0);

    await page.emulateMedia({ media: 'print' });

    // A printed worksheet with every answer still collapsed is not a study
    // sheet. `::details-content` is the only handle a UA offers on closed
    // content; on an engine without it the answers print collapsed, which is
    // the documented safe degradation (this suite runs Chromium, which has it).
    await expect.poll(() => rectHeight(answer)).toBeGreaterThan(0);
    await expect(answer).toContainText('About 10');
  });
});

/**
 * Asserts the whole colour contract for a page that is dark ON SCREEN: it is
 * really dark first, and printing inverts it to readable dark-on-light.
 *
 * Shared because there are two independent ways to be dark and each reaches the
 * print palette through a DIFFERENT selector in that block — one on specificity,
 * one on source order — so a fix that only lands one of them is a half-fix.
 *
 * @param page - A loaded lesson page in a dark theme.
 */
async function expectDarkPagePrintsLight(page: Page): Promise<void> {
  // On screen it really is dark — light text on a dark canvas. Without this the
  // print assertion below would pass on a page that was never dark at all.
  const screen = await palette(page);
  expect(luminance(parseRgb(screen.text))).toBeGreaterThan(
    luminance(parseRgb(screen.background)),
  );

  // `colorScheme` is restated rather than left to the context, and that is
  // load-bearing: if `emulateMedia` ever dropped it, the page would go LIGHT and
  // every assertion below would pass without the print block existing at all.
  // Stated here, `prefers-color-scheme: dark` provably still matches while
  // printing — which is the whole reason the override needs to win.
  await page.emulateMedia({ media: 'print', colorScheme: 'dark' });

  const paper = await palette(page);
  const ink = parseRgb(paper.text);
  const sheet = parseRgb(paper.background);
  // The inversion, which is the entire point of PRN-1…
  expect(luminance(ink)).toBeLessThan(luminance(sheet));
  // …and it is readable, not merely inverted.
  expect(contrast(ink, sheet)).toBeGreaterThanOrEqual(4.5);

  // The difficulty chip: a small filled label, and the piece of lesson chrome
  // whose legibility depends most on a fill the printer may never lay down.
  //
  // Its own fill is therefore the WRONG thing to score against, which is the
  // point of these two lines: browsers drop background colours when printing but
  // never text colours, so a chip whose dark-theme pair leaked onto paper would
  // still measure a perfectly healthy ratio against the fill it arrived with
  // and print as pale grey on blank white. Score against the PAPER instead —
  // the worst case a printer can actually produce — and check the direction
  // separately, so neither a light-on-light nor a dark-on-dark chip can pass.
  const chip = page.locator('.difficulty-chip').first();
  const chipInk = parseRgb(await computed(chip, 'color'));
  const chipFill = parseRgb(await computed(chip, 'backgroundColor'));
  expect(luminance(chipInk)).toBeLessThan(luminance(chipFill));
  expect(contrast(chipInk, PAPER)).toBeGreaterThanOrEqual(4.5);
}

test.describe('print stylesheet — OS dark, no stored preference, JS off', () => {
  // Init scripts never run under `javaScriptEnabled: false`, so the usual
  // localStorage theme forcing would silently record the LIGHT theme as the dark
  // case. Context `colorScheme` works in both modes, and tokens.css's
  // `prefers-color-scheme: dark` mirror paints the identical palette (pinned
  // byte-for-byte in tests/unit/tokens-contrast.test.ts). This is also the path
  // whose print override wins on SOURCE ORDER alone.
  test.use({
    viewport: DESKTOP,
    javaScriptEnabled: false,
    colorScheme: 'dark',
  });

  test('puts dark text on a light background', async ({ page }) => {
    await page.goto(LESSON);
    await expectDarkPagePrintsLight(page);
  });
});

test.describe('print stylesheet — an explicitly stored dark theme', () => {
  test.use({ viewport: DESKTOP });

  test('puts dark text on a light background', async ({ page }) => {
    // The `[data-theme="dark"]` path, which the print block beats on
    // specificity (`:root[data-theme='dark']` is (0,2,0) against its (0,1,0)).
    await page.addInitScript(() => {
      localStorage.setItem('theme', 'dark');
    });
    await page.goto(LESSON);
    await expectDarkPagePrintsLight(page);
  });
});

/**
 * Every ink inside the page's first code block, plus the block's own two.
 *
 * Read from the computed styles rather than from the `style` attributes Shiki
 * emits: the whole question is which of the two themes the CASCADE lands on, and
 * the attribute says only what was authored.
 *
 * @param page - A loaded lesson page.
 * @returns The block's base colour and fill, and one entry per `<span>` in it.
 */
async function codeInk(
  page: Page,
): Promise<{ base: string; background: string; inks: string[] }> {
  return page
    .locator('.astro-code')
    .first()
    .evaluate((pre) => {
      const style = getComputedStyle(pre);
      return {
        base: style.color,
        background: style.backgroundColor,
        inks: Array.from(pre.querySelectorAll('span')).map(
          (span) => getComputedStyle(span).color,
        ),
      };
    });
}

test.describe('print stylesheet — code blocks', () => {
  test.use({ viewport: DESKTOP });

  test('a dark-theme print emits the LIGHT Shiki theme, not near-white ink', async ({
    page,
  }) => {
    // The one colour on the page that does not come from a token, so forcing
    // the light token palette does nothing for it: Shiki writes the light theme
    // into inline `style` attributes and stashes the dark theme in
    // `--shiki-dark*` custom properties, which global.css binds with
    // `!important`. An `!important` binding outranks the inline light colours no
    // matter how the print rule is written, so the only fix is to scope the
    // binding to `screen` — and the only way to prove it landed is to read the
    // colours back in all three states.
    await page.goto(LESSON);
    const screenLight = await codeInk(page);
    expect(screenLight.inks.length).toBeGreaterThan(0);

    await page.emulateMedia({ colorScheme: 'dark' });
    const screenDark = await codeInk(page);
    // Non-vacuous in both directions: the dark binding really does repaint the
    // listing on screen, so the print assertion below is not just observing a
    // page that was never dark.
    expect(screenDark.inks).not.toEqual(screenLight.inks);
    expect(luminance(parseRgb(screenDark.base))).toBeGreaterThan(
      luminance(parseRgb(screenDark.background)),
    );

    await page.emulateMedia({ media: 'print', colorScheme: 'dark' });
    const printed = await codeInk(page);

    // Identical to the light rendering, span for span — the strongest available
    // form of "the dark binding is off paper", and one that keeps working if the
    // themes are ever swapped for different ones.
    expect(printed.base).toBe(screenLight.base);
    expect(printed.background).toBe(screenLight.background);
    expect(printed.inks).toEqual(screenLight.inks);

    // …and the consequence a reader cares about: dark ink on light paper.
    // Direction for every token, because a printer may drop the block's own
    // fill and leave the ink on blank white; the AA floor is asserted for the
    // base colour, which is what the bulk of a listing is set in.
    // (The syntax palette itself is github-light's, not this site's: its
    // parameter colour #E36209 measures 3.49:1 on white, which is a real gap
    // but one that predates M7.3 and is identical on screen — so it is reported
    // rather than gated here, where it would only ever fail for print.)
    const paper = luminance(parseRgb(printed.background));
    for (const ink of [printed.base, ...printed.inks]) {
      expect(luminance(parseRgb(ink)), `${ink} is not dark ink`).toBeLessThan(
        paper,
      );
    }
    expect(contrast(parseRgb(printed.base), PAPER)).toBeGreaterThanOrEqual(4.5);
  });
});

test.describe('print stylesheet — the still that actually prints', () => {
  test.use({ viewport: DESKTOP, javaScriptEnabled: false });

  test('keeps the build-time SVG and the step-0 explanation', async ({
    page,
  }) => {
    await page.goto(LESSON);
    await page.emulateMedia({ media: 'print' });

    const viz = page.locator('#viz-binary-search');
    await expect(viz.locator('.viz-canvas svg')).toBeVisible();
    await expect(viz.locator('.viz-cell')).not.toHaveCount(0);

    // `<desc>` mirrors `step.explanation` (design §3.1) and the visible
    // paragraph is rendered from the same string, so equality proves the frame
    // on paper and the sentence under it describe the SAME step.
    const description = await viz.locator('svg desc').first().textContent();
    expect((description ?? '').trim().length).toBeGreaterThan(0);
    await expect(viz.locator('.viz-explain')).toHaveText(
      (description ?? '').trim(),
    );
  });
});

// ---------------------------------------------------------------------------
// HCM-1 — forced colors
// ---------------------------------------------------------------------------

/**
 * The mapping table from `Visualizer.astro`'s forced-colors block, transcribed:
 * the state class, the stroke width forced colours must leave it with, and its
 * dash pattern (empty = solid). Widths are ordinal — thicker means "more
 * important right now" — and no two rows may share a (width, dash) pair, which
 * is the property the walk below actually checks.
 *
 * Two states are absent because the table itself says they need no rule and
 * says why: `is-pointer` draws no rect treatment at all, and `is-eliminated`
 * dims through `opacity`, which forced colours leave alone — asserted directly
 * in the same test rather than left as prose.
 */
const MAPPING: { state: string; width: number; dash: number[] }[] = [
  { state: '', width: 1.5, dash: [] }, // resting
  { state: 'is-range', width: 1.5, dash: [1, 4] },
  { state: 'is-frontier', width: 2, dash: [4, 3] },
  { state: 'is-compare', width: 2, dash: [10, 4] },
  { state: 'is-visited', width: 2, dash: [1, 3] },
  { state: 'is-swap', width: 2, dash: [2, 2] },
  { state: 'is-insert', width: 2, dash: [10, 3, 2, 3] },
  { state: 'is-delete', width: 2, dash: [2, 6] },
  { state: 'is-active', width: 3, dash: [] },
  { state: 'is-found', width: 4, dash: [] },
];

/** A rect's non-colour channels plus the two colours that must NOT vary. */
interface Pen {
  width: number;
  dash: number[];
  fill: string;
  stroke: string;
}

/**
 * Reads a rect's pen. Numbers, not strings: Chromium serializes these as
 * `"1.5px"` and `"10px, 4px"`, and a test that pinned that spelling would be
 * asserting a serialization rather than a design.
 *
 * @param locator - A single `<rect>` / `<circle>` element.
 * @returns Its stroke channels and its two colours.
 */
function pen(locator: Locator): Promise<Pen> {
  return locator.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      width: parseFloat(style.strokeWidth),
      dash: (style.strokeDasharray.match(/[\d.]+/g) ?? []).map(Number),
      fill: style.fill,
      stroke: style.stroke,
    };
  });
}

/** A (width, dash) pair as one comparable string, for collision checking. */
const channel = (p: { width: number; dash: number[] }): string =>
  `${p.width}px ${p.dash.length ? p.dash.join('-') : 'solid'}`;

/**
 * A rect's fill once its transition has landed.
 *
 * `.viz-cell__rect` transitions `fill`, and switching the media to forced
 * colours repaints every cell from its `color-mix()` tint to the system Canvas,
 * so a read taken a few frames later can catch an in-flight interpolation —
 * which Chromium reports as `oklab(…)` and which is neither value. Observed
 * exactly once while writing this file, which is once more than a colour
 * assertion gets to be a coin flip: wait for the plain `rgb()` a system colour
 * settles on instead. (Only sound under forced colours, where every settled fill
 * IS an `rgb()`; on screen the tints resolve to `color(srgb …)`.)
 *
 * @param locator - A single rect, under `forcedColors: 'active'`.
 * @returns Its settled fill.
 */
async function settledFill(locator: Locator): Promise<string> {
  await expect
    .poll(() => locator.evaluate((el) => getComputedStyle(el).fill))
    .toMatch(/^rgb\(/);
  return (await pen(locator)).fill;
}

test.describe('forced colors', () => {
  test.use({ viewport: DESKTOP });

  test('every state in the mapping table survives without colour', async ({
    page,
  }) => {
    // No one trace paints all ten — `is-range` belongs to binary search,
    // `is-swap` to the sorts, `is-frontier` to graph traversal, `is-insert` and
    // `is-delete` to the structure lessons — so covering the table from traces
    // would mean driving five lessons and still trusting that the set was
    // complete. The walk drives the states directly by class instead: this is a
    // test of the STYLE MAPPING, which is what the table is, and the next test
    // proves a real trace paints the same pens.
    await page.goto(LESSON);
    const rect = page.locator('#viz-binary-search .viz-cell__rect').first();
    await expect(rect).toBeVisible();

    await page.emulateMedia({ forcedColors: 'active' });

    const measured = await page.evaluate(
      (states) => {
        const cell = document.querySelector('#viz-binary-search .viz-cell')!;
        const box = cell.querySelector('.viz-cell__rect')!;
        const original = cell.getAttribute('class') ?? '';
        const read = (state: string) => {
          cell.setAttribute('class', state ? `viz-cell ${state}` : 'viz-cell');
          const style = getComputedStyle(box);
          return {
            state,
            width: parseFloat(style.strokeWidth),
            dash: (style.strokeDasharray.match(/[\d.]+/g) ?? []).map(Number),
            fill: style.fill,
            stroke: style.stroke,
          };
        };
        const out = states.map(read);
        cell.setAttribute('class', original);
        return out;
      },
      MAPPING.map((entry) => entry.state),
    );

    // 1. Each state carries the channels the table promises it.
    for (const [index, expected] of MAPPING.entries()) {
      const actual = measured[index]!;
      expect(
        { width: actual.width, dash: actual.dash },
        `${expected.state || 'resting'} does not match the mapping table`,
      ).toEqual({ width: expected.width, dash: expected.dash });
    }

    // 2. No two states collide. This is the assertion that fails when an
    //    eleventh state is added by copying a tenth — the failure mode the
    //    table exists to prevent, and the one no per-state assertion catches.
    const channels = measured.map(channel);
    expect(
      new Set(channels).size,
      `colliding pens: ${channels.join(', ')}`,
    ).toBe(MAPPING.length);

    // 3. …and colour genuinely carries nothing: every state is painted in the
    //    SAME system fill and stroke, so the ten pictures above are all the
    //    reader has. (Measured, not assumed: Chromium resolves `fill: Canvas`
    //    and `stroke: CanvasText` under this emulation, and both are identical
    //    across all ten states.)
    expect(new Set(measured.map((m) => m.fill)).size).toBe(1);
    expect(new Set(measured.map((m) => m.stroke)).size).toBe(1);

    // 4. The two states the table names as needing no rule, checked rather than
    //    trusted: `is-eliminated` still dims, because `opacity` is an alpha and
    //    not a colour, and `is-pointer` is left on the resting 1.5px pen — it is
    //    a caret, and the caret is its own glyph.
    const untouched = await page.evaluate(() => {
      const cell = document.querySelector('#viz-binary-search .viz-cell')!;
      const box = cell.querySelector('.viz-cell__rect')!;
      const original = cell.getAttribute('class') ?? '';
      cell.setAttribute('class', 'viz-cell is-eliminated');
      const dim = getComputedStyle(cell).opacity;
      cell.setAttribute('class', 'viz-cell is-pointer');
      const pointer = getComputedStyle(box).strokeWidth;
      cell.setAttribute('class', original);
      return { dim, pointer };
    });
    expect(Number(untouched.dim)).toBeLessThan(1);
    expect(parseFloat(untouched.pointer)).toBe(1.5);
  });

  test('a live trace paints the pens the table promises', async ({ page }) => {
    // Bubble sort, because binary search emits no `compare` highlight at all —
    // its probe is `active`. This is the lesson that shows both states.
    await page.goto('/learn/sorting-basics');
    const viz = page.locator('[data-viz][data-algorithm="bubble-sort"]');
    await viz.scrollIntoViewIfNeeded();
    await expect(viz).toHaveAttribute('data-viz-ready', 'true', {
      timeout: 15_000,
    });

    await page.emulateMedia({ forcedColors: 'active' });

    const expected = (state: string) =>
      MAPPING.find((entry) => entry.state === state)!;

    // Step forward until the first comparison. Bounded so a trace that never
    // compares fails on the assertion below rather than hanging.
    const compare = viz.locator('.viz-cell.is-compare .viz-cell__rect');
    const forward = viz.locator('[data-viz-forward]');
    for (let i = 0; i < 12 && (await compare.count()) === 0; i += 1) {
      await forward.click();
    }
    expect(await compare.count()).toBeGreaterThan(0);
    const comparing = await pen(compare.first());
    const comparingFill = await settledFill(compare.first());
    expect(channel(comparing)).toBe(channel(expected('is-compare')));
    // The dashed tie-line between the two cells being compared: a marker, not a
    // colour, and it is drawn in this same frame.
    await expect(viz.locator('.viz-tie')).not.toHaveCount(0);

    // Jump to the terminal frame, where every cell is `found`. End on a focused
    // range input is the same seek the scrubber performs.
    const slider = viz.locator('[data-viz-slider]');
    await slider.focus();
    await page.keyboard.press('End');
    const found = viz.locator('.viz-cell.is-found .viz-cell__rect');
    await expect(found.first()).toBeVisible();
    const settled = await pen(found.first());
    expect(channel(settled)).toBe(channel(expected('is-found')));

    // The two frames a reader is meant to tell apart, told apart on a channel
    // that is not colour — which is the requirement, restated on real output.
    expect(channel(comparing)).not.toBe(channel(settled));
    expect(comparingFill).toBe(await settledFill(found.first()));

    // And the glyph band survives as text: ✓ over every found cell.
    const marks = viz.locator('.viz-found-mark');
    await expect(marks.first()).toBeVisible();
    expect(await marks.allTextContents()).toContain('✓');
  });

  test('the home hero still re-encodes its two states', async ({ page }) => {
    // The stills ship OUTSIDE the visualizer island, so the island's
    // `is:global` hardening never reaches them and each carries its own smaller
    // copy. A copy is exactly the thing that rots quietly, which is why both
    // are checked here against the same table.
    await page.goto('/');
    const range = page.locator('.hero-demo .viz-cell.is-range .viz-cell__rect');
    const active = page.locator(
      '.hero-demo .viz-cell.is-active .viz-cell__rect',
    );
    await expect(range.first()).toBeVisible();
    await expect(active.first()).toBeVisible();

    // On screen the two are told apart by stroke colour (`--border-strong` vs
    // `--hl-active`). That is the channel forced colours takes away, so it is
    // also what makes the assertions below non-vacuous.
    expect((await pen(range.first())).stroke).not.toBe(
      (await pen(active.first())).stroke,
    );

    await page.emulateMedia({ forcedColors: 'active' });

    const dotted = await pen(range.first());
    const probed = await pen(active.first());
    const expected = (state: string) =>
      MAPPING.find((entry) => entry.state === state)!;
    expect(channel(dotted)).toBe(channel(expected('is-range')));
    expect(channel(probed)).toBe(channel(expected('is-active')));
    // Same system colours, so the pens are the whole difference.
    expect(dotted.stroke).toBe(probed.stroke);
    expect(dotted.fill).toBe(probed.fill);

    // The numerals are repainted too — an unrepainted `--text` fill would be
    // whatever the reader's palette is not.
    expect(
      await computed(
        page.locator('.hero-demo .viz-cell__value').first(),
        'fill',
      ),
    ).toBe(dotted.stroke);
    // …and the eliminated cells still recede, because `opacity` is an alpha
    // rather than a colour and survives untouched.
    expect(
      Number(
        await computed(
          page.locator('.hero-demo .viz-cell.is-eliminated').first(),
          'opacity',
        ),
      ),
    ).toBeLessThan(1);
  });

  test('the 404 still drops its wash rather than fading into the palette', async ({
    page,
  }) => {
    await page.goto('/404');
    const rect = page
      .locator('.notfound__canvas .viz-cell.is-eliminated .viz-cell__rect')
      .first();
    await expect(rect).toBeVisible();

    // Every cell in this frame is in the same state, so there is nothing to
    // re-encode — the risk here is the opposite one: the 0.42 `fill-opacity`
    // that makes the joke read as "ruled out" has no shades to spend once the
    // palette is the reader's, and would just dilute a system colour.
    expect(await computed(rect, 'fillOpacity')).toBe('0.42');

    await page.emulateMedia({ forcedColors: 'active' });

    expect(await computed(rect, 'fillOpacity')).toBe('1');
    // Painted in system colours, stated without hardcoding which ones the
    // emulation picked: the numerals take the same colour as the cell edge.
    expect(
      await computed(
        page.locator('.notfound__canvas .viz-cell__value').first(),
        'fill',
      ),
    ).toBe((await pen(rect)).stroke);
  });
});

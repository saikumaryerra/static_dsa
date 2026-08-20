/**
 * Plan A §3 — one drawing box per trace, asserted against the running site.
 *
 * Renderers size their `viewBox` from the CURRENT step, so a structure that grew
 * mid-run resized the canvas while the reader stepped — 825px on the BST, 535px
 * on stacks — moving the transport row out from under their thumb. `traceExtent`
 * reduces a whole trace to one box and the renderer is handed it before it draws
 * anything.
 *
 * These live here rather than in Vitest because every assertion is a question
 * about the DOM or about layout, and the unit harness is `environment: 'node'`
 * with no DOM. The pure halves — `fitToExtent`'s clamp and anchor arithmetic,
 * `traceExtent`'s reduction, and `measure`'s agreement with each renderer's own
 * drawing — are already covered in `tests/unit/extent.test.ts`,
 * `tests/unit/extent-trace.test.ts` and `tests/unit/renderers/measure.test.ts`.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';

import { openCustomInput } from './utils/disclosure';

/**
 * Scrolls a visualizer into view and waits for its island to hydrate.
 *
 * Same shape as `m7-player-v2.spec.ts`'s `hydrateViz` — `[data-viz]` is the
 * island root and `data-viz-ready="true"` is the only signal that the live
 * renderer has replaced the build-time still. Deliberately not a second
 * convention.
 */
async function hydrateViz(page: Page, scope = ''): Promise<Locator> {
  const viz = page.locator(`${scope} [data-viz]`.trim()).first();
  await viz.scrollIntoViewIfNeeded();
  await expect(viz).toHaveAttribute('data-viz-ready', 'true', {
    timeout: 15_000,
  });
  return viz;
}

/** One step's drawn geometry: the `viewBox` it declares and the box it occupies. */
interface Frame {
  viewBox: string | null;
  /** The canvas's laid-out height, rounded — what the reader's thumb feels. */
  height: number;
}

/**
 * Steps a hydrated visualizer from the first frame to the last, collecting each
 * step's drawn geometry.
 *
 * The trace length is read from the visible counter rather than probed by
 * clicking until Step forward goes dead: at a bound the island keeps the button
 * focusable and marks it `aria-disabled` (A11Y-1), so "is it disabled" is not a
 * question this suite should be betting a loop on.
 */
async function framesAcrossRun(viz: Locator): Promise<Frame[]> {
  const canvas = viz.locator('[data-viz-canvas]');
  const svg = canvas.locator('svg');
  const forward = viz.locator('[data-viz-forward]');
  const counter = viz.locator('[data-viz-counter]');

  const total = Number(((await counter.textContent()) ?? '').split('/')[1]);
  expect(total, 'the counter should report a multi-step trace').toBeGreaterThan(
    3,
  );

  const frames: Frame[] = [];
  for (let i = 0; i < total; i += 1) {
    if (i > 0) {
      await forward.click();
      // Wait for the step to land before measuring: a boundingBox read on the
      // previous frame would make this test pass for the wrong reason.
      await expect(counter).toHaveText(`${i + 1} / ${total}`);
    }
    const box = await canvas.boundingBox();
    frames.push({
      viewBox: await svg.getAttribute('viewBox'),
      height: Math.round(box?.height ?? 0),
    });
  }
  return frames;
}

/**
 * Asserts every frame drew the same box, naming what varied when one did not.
 *
 * The `viewBox` ATTRIBUTE is the load-bearing assertion and the rendered height
 * is corroboration, never the other way round. The canvas's `<svg>` is
 * `width: 100%; height: auto`, so its laid-out height is
 * `containerWidth × vbH / vbW` — a WIDTH-only change usually surfaces there, but
 * not always: once RSP-2's legibility floor binds (`min-width` from
 * `--viz-natural-w`, the n≈30 custom-input case on a 390px viewport) the height
 * settles at a fixed fraction of `vbH` and a width-only change becomes
 * invisible. `array`/`bars` is exactly the family that only ever varies in
 * width, so a bounding-box-only test would have passed over the defect this file
 * exists to catch.
 */
function expectFrozen(frames: Frame[], expected: string): void {
  const viewBoxes = new Set(frames.map((f) => f.viewBox));
  expect(
    [...viewBoxes],
    "the viewBox must be the whole trace's box on every step",
  ).toEqual([expected]);
  const heights = new Set(frames.map((f) => f.height));
  expect(
    [...heights].sort((a, b) => a - b),
    'the canvas resized under the reader while they stepped',
  ).toHaveLength(1);
}

test.describe('one viewBox per trace', () => {
  test('the BST canvas does not resize while stepping', async ({ page }) => {
    await page.goto('/learn/trees-bst');
    const viz = await hydrateViz(page);
    // The worst offender in the audit: the tree opened at 40x66 (an "empty tree"
    // label) and finished at 380x222, an 825px swing on a desktop viewport.
    expectFrozen(await framesAcrossRun(viz), '0 0 380 222');
  });

  test('the array canvas does not resize while stepping', async ({ page }) => {
    await page.goto('/learn/arrays');
    const viz = await hydrateViz(page);
    // ArrayRenderer is the one family that draws its own root `<svg>` instead of
    // going through `renderers/shared`'s `createRenderer`/`fitToExtent`, so its
    // extent path is separate code and needs its own coverage: `array-operations`
    // inserts a sixth cell mid-run and used to widen 322 -> 384 to make room.
    expectFrozen(await framesAcrossRun(viz), '0 0 384 132');
  });

  test('the stack grows upward from a ground line that stays put', async ({
    page,
  }) => {
    await page.goto('/learn/stacks');
    const viz = await hydrateViz(page);
    const canvas = viz.locator('[data-viz-canvas]');
    const forward = viz.locator('[data-viz-forward]');
    const counter = viz.locator('[data-viz-counter]');
    const total = Number(((await counter.textContent()) ?? '').split('/')[1]);

    // Freezing the BOX does not freeze the DRAWING: a stack is drawn from its
    // ground line up, so under the default top anchor a frozen box would slide
    // that line down on every push. StackRenderer therefore declares a bottom
    // anchor, and this is what that buys — slot 0's base sits on the same row of
    // the drawing for the whole run.
    const bases: number[] = [];
    const viewBoxes = new Set<string | null>();
    for (let i = 0; i < total; i += 1) {
      if (i > 0) {
        await forward.click();
        await expect(counter).toHaveText(`${i + 1} / ${total}`);
      }
      viewBoxes.add(await canvas.locator('svg').getAttribute('viewBox'));
      // Absent on the empty frames this run opens and closes with, which have no
      // slot 0 to anchor. Those two frames are the renderer's resting state and
      // are not what the anchor is about.
      const slot0 = canvas.locator('#s0');
      if ((await slot0.count()) === 0) continue;
      // Measured against the `<svg>`'s own top edge, not the viewport's: clicking
      // Step forward scrolls the button into view, so a viewport-relative y says
      // as much about the page's scroll offset as about the drawing.
      bases.push(
        await slot0.evaluate((el) => {
          const root = (el as SVGGraphicsElement).ownerSVGElement!;
          return Math.round(
            el.getBoundingClientRect().bottom -
              root.getBoundingClientRect().top,
          );
        }),
      );
    }

    expect([...viewBoxes]).toEqual(['0 0 168 220']);
    expect(
      bases.length,
      'the run should push at least one value',
    ).toBeGreaterThan(3);
    expect(
      [...new Set(bases)],
      'the bottom of the stack drifted while the reader stepped',
    ).toHaveLength(1);
  });
});

test.describe('a new trace brings its own box', () => {
  /** The lesson hosts two array visualizers; scope to the binary-search one. */
  const VIZ = '#viz-binary-search';

  test('a custom run and "Restore example" both refreeze the canvas', async ({
    page,
  }) => {
    await page.goto('/learn/binary-search');
    const viz = await hydrateViz(page, VIZ);
    const svg = viz.locator('[data-viz-canvas] svg');
    // The authored run is six cells wide.
    await expect(svg).toHaveAttribute('viewBox', '0 0 384 132');

    // `mount` runs once per island, so `setExtent` is the only channel that can
    // update the box afterwards. A twelve-item array needs a wider one, and it
    // must be applied BEFORE the redraw loadTrace triggers. (The form that
    // starts that run is behind a disclosure since amendment C-2; opening it is
    // not what this test is about, so it is done directly.)
    await openCustomInput(viz);
    await viz.locator('[data-viz-array]').fill('[1,2,3,4,5,6,7,8,9,10,11,12]');
    await viz.locator('[data-viz-target]').fill('9');
    await viz.locator('[data-viz-run]').click();
    await expect(svg).toHaveAttribute('viewBox', '0 0 756 132');

    // And back: "Restore example" is the SECOND loadTrace call site. It was the
    // easy one to miss, and missing it leaves the restored run drawing inside
    // the custom run's oversized box — a permanent band of empty canvas that no
    // other assertion in this suite would catch.
    await viz.locator('[data-viz-restore]').click();
    await expect(svg).toHaveAttribute('viewBox', '0 0 384 132');
  });
});

/**
 * Plan A §7 — the RSP-2 legibility floor, PINNED rather than changed.
 *
 * The floor is `Visualizer.astro`'s `min-width: calc(var(--viz-natural-w, 0px)
 * * 0.75)` on the canvas's `<svg>`. Plan A considered giving it a vertical twin
 * and measured the idea away — every `<svg>` is `xMidYMid meet` with
 * `height: auto`, so the scale is uniform and one axis already floors both;
 * there is no `max-height` anywhere in that file to overflow against; and
 * adding one would produce a canvas that overflows VERTICALLY while fitting
 * horizontally, which `measureCanvas` (it reads horizontal overflow alone)
 * would leave `tabindex="-1"`: an unreachable keyboard scroll region, the exact
 * WCAG 2.1.1 failure the floor's own comment says the design avoids.
 *
 * So there is no source change here, and these three tests are the finding.
 * What the frozen extent DID change for free is the first one: `measureCanvas`
 * reads `svg.viewBox.baseVal.width` live, and that value is now trace-constant,
 * so the floor stops moving mid-run and `remeasureIfResized`'s string compare
 * stops firing. That is asserted rather than plumbed — separate plumbing for it
 * would be dead code.
 */
test.describe('the legibility floor under a frozen extent', () => {
  // The 390px phone the 0.75 was chosen against.
  test.use({ viewport: { width: 390, height: 844 } });

  /** The lesson hosts two array visualizers; scope to the binary-search one. */
  const VIZ = '#viz-binary-search';

  test('--viz-natural-w holds still across a run on the renderer that grows most', async ({
    page,
  }) => {
    await page.goto('/learn/trees-bst');
    const viz = await hydrateViz(page);
    const canvas = viz.locator('[data-viz-canvas]');
    const forward = viz.locator('[data-viz-forward]');
    const counter = viz.locator('[data-viz-counter]');

    const total = Number(((await counter.textContent()) ?? '').split('/')[1]);
    expect(
      total,
      'the counter should report a multi-step trace',
    ).toBeGreaterThan(3);

    const seen = new Set<string>();
    for (let i = 0; i < total; i += 1) {
      if (i > 0) {
        await forward.click();
        await expect(counter).toHaveText(`${i + 1} / ${total}`);
      }
      seen.add(
        await canvas.evaluate((el) =>
          getComputedStyle(el).getPropertyValue('--viz-natural-w').trim(),
        ),
      );
    }

    // The VALUE, not merely the count: an unwritten custom property reads `''`
    // on every step, so a one-element set would pass for a floor that never
    // existed. 380 is the BST's frozen extent width, pinned above.
    expect([...seen], 'the legibility floor moved mid-run').toEqual(['380px']);
  });

  test('a horizontally overflowing canvas is still a reachable scroll region', async ({
    page,
  }) => {
    await page.goto('/learn/binary-search');
    const viz = await hydrateViz(page, VIZ);
    const canvas = viz.locator('[data-viz-canvas]');

    // Six cells fit, so the canvas is a click target for the Space/←/→
    // shortcuts and nothing more: out of the tab order, unnamed, no role.
    await expect(canvas).toHaveAttribute('tabindex', '-1');
    await expect(canvas).not.toHaveAttribute('role', 'group');

    // Twenty is the case the floor exists for: 0.75 of a 1252-unit drawing
    // cannot fit 390px, so the box must scroll instead of shrinking the digits.
    // DRIVEN rather than branched on — a conditional assertion would never take
    // this side at this viewport, and this side is the whole a11y argument
    // against a vertical twin.
    await openCustomInput(viz); // amendment C-2
    await viz
      .locator('[data-viz-array]')
      .fill('[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]');
    await viz.locator('[data-viz-target]').fill('13');
    await viz.locator('[data-viz-run]').click();
    await expect(canvas.locator('svg')).toHaveAttribute(
      'viewBox',
      '0 0 1252 132',
    );

    expect(
      await canvas.evaluate((el) => el.scrollWidth - el.clientWidth),
      'the floor should have made this drawing wider than its box',
    ).toBeGreaterThan(1);
    await expect(canvas).toHaveAttribute('tabindex', '0');
    await expect(canvas).toHaveAttribute('role', 'group');
    await expect(canvas).toHaveAttribute('aria-label', /scrollable diagram/);
  });

  test('the 6-cell default array still fits without scrolling at 390px', async ({
    page,
  }) => {
    await page.goto('/learn/binary-search');
    const viz = await hydrateViz(page, VIZ);
    // This is the 0.75's own documented rationale — it was chosen over the
    // intrinsic 100% because "a 6-cell default would otherwise start scrolling
    // on a 390px screen it currently fits". If this fails, the floor was
    // changed and the floor is what needs reverting, not this number.
    expect(
      await viz
        .locator('[data-viz-canvas]')
        .evaluate((el) => el.scrollWidth - el.clientWidth),
    ).toBeLessThanOrEqual(1);
  });
});

/**
 * Plan A §8 — the custom-input box accepts the format its own help text
 * advertises.
 *
 * The field said "Up to 30 whole numbers, comma-separated" and every array
 * `parseInput` required a `[…]` literal, so `9,2,7,4,1` + `4` was answered with
 * "Type an array and target, e.g. [1,3,5,7] target=5" — an instruction to fill
 * in the two fields the reader had just filled in. `composeCustomInput` wraps
 * the bare list, gated on the instrument's own AUTHORED input.
 *
 * The gate is the reason these are e2e and not only unit tests: the pure
 * composition is covered in `tests/unit/input-compose.test.ts`, but that the
 * ISLAND feeds it `data-input` rather than the build-time placeholder — whose
 * no-authored-input fallback is bracketed and would wrap a graph field — is a
 * fact about the running page.
 *
 * Every assertion here pairs "no error" with a POSITIVE signal that the run
 * actually happened. `[data-viz-error]` is hidden on first paint, so a dead
 * click passes a hidden-only assertion.
 */
test.describe('custom input accepts the advertised format', () => {
  /** The lesson hosts two array visualizers; scope to the binary-search one. */
  const VIZ = '#viz-binary-search';

  test('a bare comma-separated list runs on binary search', async ({
    page,
  }) => {
    await page.goto('/learn/binary-search');
    const viz = await hydrateViz(page, VIZ);
    const svg = viz.locator('[data-viz-canvas] svg');
    // The authored run is six cells wide (`viewWidth(6)` = 384).
    await expect(svg).toHaveAttribute('viewBox', '0 0 384 132');

    await openCustomInput(viz); // amendment C-2
    await viz.locator('[data-viz-array]').fill('1,3,5,7,9');
    await viz.locator('[data-viz-target]').fill('5');
    await viz.locator('[data-viz-run]').click();

    // Five cells: the trace was recomputed from the wrapped list, so the run is
    // the reader's own and not the authored one still sitting on screen.
    await expect(svg).toHaveAttribute('viewBox', '0 0 322 132');
    await expect(viz.locator('[data-viz-error]')).toBeHidden();
  });

  test('an unsorted bare list reaches the sorted-precondition message', async ({
    page,
  }) => {
    await page.goto('/learn/binary-search');
    const viz = await hydrateViz(page, VIZ);

    // The exact reproduction. Before the fix the bare list never got past the
    // "no `[…]` literal" branch, so binary search's ONE pedagogical error — the
    // sorted precondition the lesson is about — was unreachable for anyone who
    // typed what the help text asked for.
    await openCustomInput(viz); // amendment C-2
    await viz.locator('[data-viz-array]').fill('9,2,7,4,1');
    await viz.locator('[data-viz-target]').fill('4');
    await viz.locator('[data-viz-run]').click();

    await expect(viz.locator('[data-viz-error]')).toBeVisible();
    await expect(viz.locator('[data-viz-error-text]')).toHaveText(
      'Binary search needs a sorted array — try [1,3,5,7].',
    );
    // Attribution follows the prose (`core/error-field`): this message names the
    // array, so the array field is the one marked invalid and focused.
    await expect(viz.locator('[data-viz-array]')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expect(viz.locator('[data-viz-target]')).not.toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  test('the rewritten fallback still blames the array field', async ({
    page,
  }) => {
    await page.goto('/learn/binary-search');
    const viz = await hydrateViz(page, VIZ);

    // An empty first field is the branch the fallback message survives for: the
    // composer refuses to wrap `''` into `[]`, so `parseInput` still finds no
    // list. The message must keep the word "array" or `errorField` sends the
    // focus move to the TARGET field, which is the field that is fine.
    await openCustomInput(viz); // amendment C-2
    await viz.locator('[data-viz-array]').fill('');
    await viz.locator('[data-viz-target]').fill('4');
    await viz.locator('[data-viz-run]').click();

    await expect(viz.locator('[data-viz-error-text]')).toHaveText(
      'Enter an array of whole numbers, e.g. 1,3,5,7',
    );
    await expect(viz.locator('[data-viz-array]')).toBeFocused();
    await expect(viz.locator('[data-viz-array]')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  test('a graph instrument is unaffected by the wrap', async ({ page }) => {
    await page.goto('/learn/graph-traversal');
    // Two visualizers on this lesson (BFS then DFS); `.first()` is BFS.
    const viz = await hydrateViz(page);
    const canvas = viz.locator('[data-viz-canvas]');
    // The authored graph has six vertices, 0–5.
    await expect(canvas.locator('#n5')).toHaveCount(1);

    await openCustomInput(viz); // amendment C-2
    await viz.locator('[data-viz-array]').fill('0-1,1-2');
    await viz.locator('[data-viz-target]').fill('1');
    await viz.locator('[data-viz-run]').click();

    // Three vertices, drawn: the edge list reached `parseInput` verbatim. Had
    // the wrap fired it would have arrived as `[0-1,1-2]` and been rejected as
    // a bad edge token.
    await expect(viz.locator('[data-viz-error]')).toBeHidden();
    await expect(canvas.locator('#n2')).toHaveCount(1);
    await expect(canvas.locator('#n3')).toHaveCount(0);
  });

  test('a DP instrument with no target field is unaffected by the wrap', async ({
    page,
  }) => {
    await page.goto('/learn/dynamic-programming');
    // Two visualizers (tabulation then memoization); `.first()` is tabulation.
    // It renders NO target field, so the composer's second argument is `''` —
    // the case where a wrapped `[8]` would have been read as a list, not an `n`.
    const viz = await hydrateViz(page);
    const canvas = viz.locator('[data-viz-canvas]');
    await expect(viz.locator('[data-viz-target]')).toHaveCount(0);
    // The authored run is n=6, so the table holds cells i0–i6.
    await expect(canvas.locator('#i6')).toHaveCount(1);

    await openCustomInput(viz); // amendment C-2
    await viz.locator('[data-viz-array]').fill('8');
    await viz.locator('[data-viz-run]').click();

    await expect(viz.locator('[data-viz-error]')).toBeHidden();
    await expect(canvas.locator('#i8')).toHaveCount(1);
  });
});

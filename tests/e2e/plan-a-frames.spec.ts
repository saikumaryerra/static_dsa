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
    // must be applied BEFORE the redraw loadTrace triggers.
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

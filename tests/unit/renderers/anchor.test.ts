/**
 * The anchor reaches the BUILD-TIME still, not just the hydrated drawing.
 *
 * `createRenderer` and `renderStaticSvg` both take the anchor as a trailing
 * OPTIONAL fourth argument that defaults to `TOP_LEFT`, so a module can pass it
 * to one and forget it on the other and nothing complains — not the compiler,
 * not `measure.test.ts` (which renders without an extent, where the anchor is
 * unreachable), not `fitToExtent`'s own unit tests (which pass the anchor
 * directly). The failure is silent and asymmetric: the still would draw the call
 * stack 174 units above where the island redraws it a moment later, so the
 * drawing would jump at hydration and the printed/JS-off page would be wrong
 * permanently. "The two paths cannot drift because both call `fitToExtent`" is
 * the contract's central claim, and this is the half of it a node harness can
 * check.
 *
 * The three instruments below are the only anchored ones (`TOP_LEFT` is a no-op
 * offset, so the other eight modules have nothing to forget), and each is driven
 * with the input its lesson authors, so the asserted offset is the one that
 * really ships. The hydrated half of the claim is asserted in
 * `tests/e2e/plan-a-frames.spec.ts`, which steps the live stack and checks its
 * base never moves.
 */
import { describe, expect, it } from 'vitest';
import { traceExtent } from '../../../src/viz/core/extent';
import type {
  Algorithm,
  RendererModule,
  Step,
} from '../../../src/viz/core/types';
import { stackOperations } from '../../../src/viz/algorithms/stack-operations';
import { recursionCallStack } from '../../../src/viz/algorithms/recursion-callstack';
import { heapOperations } from '../../../src/viz/algorithms/heap-operations';
import { stackRenderer } from '../../../src/viz/renderers/StackRenderer';
import { callStackRenderer } from '../../../src/viz/renderers/CallStackRenderer';
import { heapRenderer } from '../../../src/viz/renderers/HeapRenderer';

const A = <T>(x: T): Algorithm<unknown, unknown> =>
  x as unknown as Algorithm<unknown, unknown>;

/**
 * Each anchored renderer, its lesson's authored input, and the offset step 0's
 * drawing must receive inside the whole trace's frozen box.
 *
 * The offsets are written out rather than recomputed from the anchor: a test
 * that re-derives the number it is checking passes for any anchor at all.
 */
const anchored: {
  name: string;
  algo: Algorithm<unknown, unknown>;
  renderer: RendererModule<unknown>;
  input: string;
  /** Bottom-anchored: the ground line under slot 0 must not slide down. */
  transform: string;
}[] = [
  {
    name: 'stack',
    algo: A(stackOperations),
    renderer: stackRenderer,
    input: '[12,34,56]',
    transform: 'translate(0 116)',
  },
  {
    name: 'callStack',
    algo: A(recursionCallStack),
    renderer: callStackRenderer,
    input: '4',
    transform: 'translate(0 174)',
  },
  {
    name: 'heap',
    algo: A(heapOperations),
    renderer: heapRenderer,
    input: '[5,9,3,12,8,15]',
    // Centre-x: the heap already centres each tree level on its content width,
    // so centring the whole drawing keeps the root still across a level gain.
    // 98, not 123: step 0 is the empty heap, whose natural box is floored at
    // 130 units by its own "empty heap" label (Plan A §4), not 80.
    transform: 'translate(98 0)',
  },
];

describe('an anchored renderer applies its ANCHOR through renderStatic', () => {
  for (const { name, algo, renderer, input, transform } of anchored) {
    it(`${name}: the still offsets its drawing inside the frozen box`, () => {
      const trace = algo.run(algo.parseInput(input)) as Step<unknown>[];
      const extent = traceExtent(renderer.measure, trace);
      const natural = renderer.measure(trace[0]!);
      // The fixture is only meaningful while step 0 is SMALLER than the trace's
      // box — with no reserved space there is no offset to get wrong.
      expect(
        natural.w < extent.w || natural.h < extent.h,
        `${name}'s authored run no longer grows; pick a fixture that does`,
      ).toBe(true);

      const svg = renderer.renderStatic(trace[0]!, {
        title: '',
        idBase: 'a',
        extent,
      });
      expect(svg).toContain(`viewBox="0 0 ${extent.w} ${extent.h}"`);
      expect(svg).toContain(`<g transform="${transform}"`);
    });

    it(`${name}: draws unshifted when no extent is supplied`, () => {
      // The dev gallery and the renderer unit tests render without an extent,
      // and `fitToExtent` must stay a no-op there — an anchor that offset an
      // un-frozen drawing would push it straight out of its own box.
      const trace = algo.run(algo.parseInput(input)) as Step<unknown>[];
      const svg = renderer.renderStatic(trace[0]!, { title: '', idBase: 'a' });
      expect(svg).not.toContain('<g transform="translate(');
    });
  }
});

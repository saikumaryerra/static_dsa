/**
 * `traceExtent` — the max-reduction that turns a whole trace into one box.
 * Pure and injected-`measure`, so it needs no renderer here.
 */
import { describe, expect, it } from 'vitest';
import { traceExtent } from '../../src/viz/core/extent';
import type { Extent, Step } from '../../src/viz/core/types';

const steps = (...boxes: Extent[]): Step<Extent>[] =>
  boxes.map((b) => ({ state: b, explanation: 'x' }));

describe('traceExtent', () => {
  it('takes the max of each axis independently', () => {
    const trace = steps(
      { w: 40, h: 200 },
      { w: 380, h: 66 },
      { w: 100, h: 100 },
    );
    expect(traceExtent((s) => s.state, trace)).toEqual({ w: 380, h: 200 });
  });

  it('returns the single box for a one-step trace', () => {
    expect(traceExtent((s) => s.state, steps({ w: 12, h: 34 }))).toEqual({
      w: 12,
      h: 34,
    });
  });

  it('throws on an empty trace rather than inventing a zero box', () => {
    // `steps()` and not a bare `[]`: an empty array literal leaves TState
    // inferred as `unknown`, so `s.state` stops being an `Extent` and the file
    // fails `astro check` (tsconfig includes the test tree).
    expect(() => traceExtent((s) => s.state, steps())).toThrow(/empty trace/);
  });

  it('throws on a non-finite or non-positive measurement', () => {
    expect(() =>
      traceExtent(() => ({ w: Number.NaN, h: 10 }), steps({ w: 1, h: 1 })),
    ).toThrow(/measurement/);
    expect(() =>
      traceExtent(() => ({ w: 0, h: 10 }), steps({ w: 1, h: 1 })),
    ).toThrow(/measurement/);
  });
});

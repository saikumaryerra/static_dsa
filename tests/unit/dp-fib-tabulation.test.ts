import { describe, expect, it } from 'vitest';
import {
  dpFibTabulation,
  type DpFibInput,
} from '../../src/viz/algorithms/dp-fib-tabulation';
import type { Highlight } from '../../src/viz/core/types';

/** Flattens every id of a given highlight kind across the whole trace, in order. */
function insertedIndices(
  trace: ReturnType<typeof dpFibTabulation.run>,
): number[] {
  return trace.flatMap((s) =>
    (s.highlights ?? [])
      .filter((h: Highlight) => h.kind === 'insert')
      .flatMap((h) => h.ids.map((id) => Number(id.slice(1)))),
  );
}

describe('dpFibTabulation.run', () => {
  it('computes the correct final table for n = 6 (fib(6) = 8, dp[0] = 0)', () => {
    const trace = dpFibTabulation.run({ n: 6 });
    const final = trace[trace.length - 1]!;
    expect(final.state.table).toEqual([0, 1, 1, 2, 3, 5, 8]);
    expect(final.state.table[0]).toBe(0);
    expect(final.explanation).toMatch(/dp\[6\] = 8/);
    // The answer cell carries the final `found` highlight.
    expect(final.highlights).toEqual([{ kind: 'found', ids: ['i6'] }]);
  });

  it('fills the table strictly left → right', () => {
    const trace = dpFibTabulation.run({ n: 6 });
    // Base cases (i0, i1) then each dp[i] filled in ascending order.
    expect(insertedIndices(trace)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('marks each computed cell active with its two neighbours as compare deps', () => {
    const trace = dpFibTabulation.run({ n: 6 });
    const readStep = trace.find((s) =>
      (s.highlights ?? []).some((h) => h.kind === 'active'),
    )!;
    const kinds = (readStep.highlights ?? []).map((h) => h.kind);
    expect(kinds).toContain('active');
    // Two dependency `compare` highlights (dp[i-1], dp[i-2]) → tie-lines.
    expect(kinds.filter((k) => k === 'compare')).toHaveLength(2);
  });

  it('records the number of additions in metrics', () => {
    const trace = dpFibTabulation.run({ n: 6 });
    expect(trace[trace.length - 1]!.metrics?.['additions']).toBe(5); // i = 2..6
  });

  it('states the addition count in the final explanation (A11Y-2)', () => {
    const trace = dpFibTabulation.run({ n: 6 });
    const last = trace[trace.length - 1]!;
    // The metrics pill and the aria-live explanation must agree.
    expect(last.explanation).toContain(
      `after ${last.metrics!['additions']} additions`,
    );
    // Singular when the fill needs a single addition (n = 2).
    const small = dpFibTabulation.run({ n: 2 });
    expect(small[small.length - 1]!.explanation).toContain('after 1 addition.');
  });

  it('handles the n = 0 and n = 1 edge cases', () => {
    expect(dpFibTabulation.run({ n: 0 })[0]!.state.table).toEqual([null]);
    const last0 = dpFibTabulation.run({ n: 0 });
    expect(last0[last0.length - 1]!.state.table).toEqual([0]);
    const last1 = dpFibTabulation.run({ n: 1 });
    expect(last1[last1.length - 1]!.state.table).toEqual([0, 1]);
  });

  it('deep-copies snapshots (mutating a later step leaves earlier steps intact)', () => {
    const trace = dpFibTabulation.run({ n: 6 });
    const final = trace[trace.length - 1]!;
    final.state.table[0] = 999;
    expect(trace[0]!.state.table.every((v) => v === null)).toBe(true);
  });
});

describe('dpFibTabulation.parseInput', () => {
  it('parses a bare number', () => {
    expect(dpFibTabulation.parseInput('6')).toEqual({
      n: 6,
    } satisfies DpFibInput);
  });

  it('rejects non-numeric input', () => {
    expect(dpFibTabulation.parseInput('abc')).toEqual({
      error: 'Type a whole number for n, e.g. 6',
    });
  });

  it('rejects negative n', () => {
    expect(dpFibTabulation.parseInput('-3')).toEqual({
      error: 'n must be 0 or greater — Fibonacci is undefined below 0.',
    });
  });

  it('rejects n over the cap', () => {
    expect(dpFibTabulation.parseInput('31')).toEqual({
      error: 'Keep n at 30 or less so the table stays readable.',
    });
  });
});

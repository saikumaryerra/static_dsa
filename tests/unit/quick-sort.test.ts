import { describe, expect, it } from 'vitest';
import { quickSort } from '../../src/viz/algorithms/quick-sort';
import type { Highlight } from '../../src/viz/core/types';

function highlightsOfKind(
  trace: ReturnType<typeof quickSort.run>,
  kind: Highlight['kind'],
): Highlight[] {
  return trace.flatMap((step) =>
    (step.highlights ?? []).filter((h) => h.kind === kind),
  );
}

describe('quickSort.run', () => {
  it('sorts the default input ascending', () => {
    const trace = quickSort.run(quickSort.defaultInput());
    expect(trace[trace.length - 1]!.state.array).toEqual([1, 2, 3, 5, 7, 9]);
  });

  it('sorts an arbitrary array preserving multiset', () => {
    const input = { array: [8, 3, 8, 1, 9, 2, 7, 0, 3] };
    const trace = quickSort.run(input);
    expect(trace[trace.length - 1]!.state.array).toEqual(
      [...input.array].sort((a, b) => a - b),
    );
  });

  it('marks the pivot with an active "pivot" caret during partition', () => {
    const trace = quickSort.run(quickSort.defaultInput());
    const pivots = trace.flatMap((s) =>
      (s.highlights ?? []).filter(
        (h) => h.kind === 'active' && h.meta?.['label'] === 'pivot',
      ),
    );
    expect(pivots.length).toBeGreaterThan(0);
  });

  it('emits compare, swap, and pivot-placed (found) highlights', () => {
    const trace = quickSort.run(quickSort.defaultInput());
    expect(highlightsOfKind(trace, 'compare').length).toBeGreaterThan(0);
    expect(highlightsOfKind(trace, 'swap').length).toBeGreaterThan(0);
    expect(highlightsOfKind(trace, 'found').length).toBeGreaterThan(0);
  });

  it('counts comparisons and swaps in metrics', () => {
    const trace = quickSort.run(quickSort.defaultInput());
    const metrics = trace[trace.length - 1]!.metrics!;
    expect(metrics['comparisons']).toBeGreaterThan(0);
    expect(metrics['swaps']).toBeGreaterThanOrEqual(0);
  });

  it('states the comparison and swap counts in the final explanation (A11Y-2)', () => {
    const trace = quickSort.run(quickSort.defaultInput());
    const last = trace[trace.length - 1]!;
    // The metrics pills and the aria-live explanation must agree.
    expect(last.explanation).toContain(
      `${last.metrics!['comparisons']} comparisons, ${last.metrics!['swaps']} swaps`,
    );
  });

  it('handles an already-sorted array (worst case) correctly', () => {
    const trace = quickSort.run({ array: [1, 2, 3, 4, 5] });
    expect(trace[trace.length - 1]!.state.array).toEqual([1, 2, 3, 4, 5]);
  });

  it('deep-copies snapshots (mutating a later step leaves earlier steps intact)', () => {
    const trace = quickSort.run(quickSort.defaultInput());
    trace[trace.length - 1]!.state.array[0] = 999;
    expect(trace[0]!.state.array).toEqual([5, 2, 9, 1, 7, 3]);
  });
});

describe('quickSort.parseInput', () => {
  it('parses a bracketed array', () => {
    expect(quickSort.parseInput('[5,2,9]')).toEqual({ array: [5, 2, 9] });
  });

  it('rejects a string with no array', () => {
    expect(quickSort.parseInput('nope')).toEqual({
      error: 'Type an array to sort, e.g. [5,2,9,1,7]',
    });
  });

  it('rejects arrays longer than 30', () => {
    const raw = `[${Array.from({ length: 31 }, (_, i) => i).join(',')}]`;
    expect(quickSort.parseInput(raw)).toEqual({
      error: 'Keep the array to 30 numbers or fewer.',
    });
  });
});

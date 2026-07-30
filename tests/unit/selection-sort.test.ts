import { describe, expect, it } from 'vitest';
import { selectionSort } from '../../src/viz/algorithms/selection-sort';
import type { Highlight } from '../../src/viz/core/types';

function highlightsOfKind(
  trace: ReturnType<typeof selectionSort.run>,
  kind: Highlight['kind'],
): Highlight[] {
  return trace.flatMap((step) =>
    (step.highlights ?? []).filter((h) => h.kind === kind),
  );
}

describe('selectionSort.run', () => {
  it('sorts the default input ascending', () => {
    const trace = selectionSort.run(selectionSort.defaultInput());
    expect(trace[trace.length - 1]!.state.array).toEqual([1, 2, 3, 5, 7, 9]);
  });

  it('sorts an arbitrary array preserving multiset', () => {
    const input = { array: [3, 1, 2, 3, -5, 10] };
    const out =
      selectionSort.run(input)[selectionSort.run(input).length - 1]!.state
        .array;
    expect(out).toEqual([...input.array].sort((a, b) => a - b));
  });

  it('does at most n-1 swaps (one placement per pass)', () => {
    const trace = selectionSort.run(selectionSort.defaultInput());
    const swaps = highlightsOfKind(trace, 'swap').length;
    expect(swaps).toBeLessThanOrEqual(5); // n-1 for a length-6 array
    expect(highlightsOfKind(trace, 'compare').length).toBeGreaterThan(0);
  });

  it('marks the running minimum with an active "min" caret', () => {
    const trace = selectionSort.run(selectionSort.defaultInput());
    const minMarks = trace.flatMap((s) =>
      (s.highlights ?? []).filter(
        (h) => h.kind === 'active' && h.meta?.['label'] === 'min',
      ),
    );
    expect(minMarks.length).toBeGreaterThan(0);
  });

  it('counts comparisons and swaps in metrics', () => {
    const trace = selectionSort.run(selectionSort.defaultInput());
    const metrics = trace[trace.length - 1]!.metrics!;
    expect(metrics['comparisons']).toBeGreaterThan(0);
    expect(metrics['swaps']).toBeGreaterThanOrEqual(0);
  });

  it('deep-copies snapshots (mutating a later step leaves earlier steps intact)', () => {
    const trace = selectionSort.run(selectionSort.defaultInput());
    trace[trace.length - 1]!.state.array[0] = 999;
    expect(trace[0]!.state.array).toEqual([5, 2, 9, 1, 7, 3]);
  });
});

describe('selectionSort.parseInput', () => {
  it('parses a bracketed array', () => {
    expect(selectionSort.parseInput('[5,2,9]')).toEqual({ array: [5, 2, 9] });
  });

  it('rejects a string with no array', () => {
    expect(selectionSort.parseInput('nope')).toEqual({
      error: 'Type an array to sort, e.g. [5,2,9,1,7]',
    });
  });

  it('rejects arrays longer than 30', () => {
    const raw = `[${Array.from({ length: 31 }, (_, i) => i).join(',')}]`;
    expect(selectionSort.parseInput(raw)).toEqual({
      error: 'Keep the array to 30 numbers or fewer.',
    });
  });
});

import { describe, expect, it } from 'vitest';
import { mergeSort } from '../../src/viz/algorithms/merge-sort';
import type { Highlight } from '../../src/viz/core/types';

function highlightsOfKind(
  trace: ReturnType<typeof mergeSort.run>,
  kind: Highlight['kind'],
): Highlight[] {
  return trace.flatMap((step) =>
    (step.highlights ?? []).filter((h) => h.kind === kind),
  );
}

describe('mergeSort.run', () => {
  it('sorts the default input ascending', () => {
    const trace = mergeSort.run(mergeSort.defaultInput());
    expect(trace[trace.length - 1]!.state.array).toEqual([1, 2, 3, 5, 7, 9]);
  });

  it('sorts an arbitrary array preserving multiset', () => {
    const input = { array: [10, -1, 3, 3, 7, 2, 8, 0] };
    const trace = mergeSort.run(input);
    expect(trace[trace.length - 1]!.state.array).toEqual(
      [...input.array].sort((a, b) => a - b),
    );
  });

  it('emits divide steps and range highlights framing sub-arrays', () => {
    const trace = mergeSort.run(mergeSort.defaultInput());
    expect(trace.some((s) => /Divide indices/.test(s.explanation))).toBe(true);
    expect(highlightsOfKind(trace, 'range').length).toBeGreaterThan(0);
  });

  it('marks each merged write with an active "k" caret', () => {
    const trace = mergeSort.run(mergeSort.defaultInput());
    const writes = trace.flatMap((s) =>
      (s.highlights ?? []).filter(
        (h) => h.kind === 'active' && h.meta?.['label'] === 'k',
      ),
    );
    expect(writes.length).toBeGreaterThan(0);
  });

  it('counts comparisons in metrics', () => {
    const trace = mergeSort.run(mergeSort.defaultInput());
    expect(trace[trace.length - 1]!.metrics!['comparisons']).toBeGreaterThan(0);
  });

  it('states the comparison count in the final explanation (A11Y-2)', () => {
    const trace = mergeSort.run(mergeSort.defaultInput());
    const last = trace[trace.length - 1]!;
    // The metrics pill and the aria-live explanation must agree.
    expect(last.explanation).toContain(
      `after ${last.metrics!['comparisons']} comparisons`,
    );
  });

  it('handles a single-element array', () => {
    const trace = mergeSort.run({ array: [7] });
    expect(trace[trace.length - 1]!.state.array).toEqual([7]);
  });

  it('deep-copies snapshots (mutating a later step leaves earlier steps intact)', () => {
    const trace = mergeSort.run(mergeSort.defaultInput());
    trace[trace.length - 1]!.state.array[0] = 999;
    expect(trace[0]!.state.array).toEqual([5, 2, 9, 1, 7, 3]);
  });
});

describe('mergeSort.parseInput', () => {
  it('parses a bracketed array', () => {
    expect(mergeSort.parseInput('[5,2,9]')).toEqual({ array: [5, 2, 9] });
  });

  it('rejects a string with no array', () => {
    expect(mergeSort.parseInput('nope')).toEqual({
      error: 'Type an array to sort, e.g. [5,2,9,1,7]',
    });
  });

  it('rejects arrays longer than 30', () => {
    const raw = `[${Array.from({ length: 31 }, (_, i) => i).join(',')}]`;
    expect(mergeSort.parseInput(raw)).toEqual({
      error: 'Keep the array to 30 numbers or fewer.',
    });
  });
});

describe('mergeSort predict-mode exclusion (M8.2)', () => {
  it('ships no predictStep: it counts comparisons only, so there is no swap to predict', () => {
    expect(mergeSort.predictStep).toBeUndefined();
    const trace = mergeSort.run(mergeSort.defaultInput());
    for (const step of trace) {
      expect(step.metrics).not.toHaveProperty('swaps');
    }
  });
});

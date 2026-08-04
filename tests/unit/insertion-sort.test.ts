import { describe, expect, it } from 'vitest';
import { insertionSort } from '../../src/viz/algorithms/insertion-sort';
import type { Highlight } from '../../src/viz/core/types';

function highlightsOfKind(
  trace: ReturnType<typeof insertionSort.run>,
  kind: Highlight['kind'],
): Highlight[] {
  return trace.flatMap((step) =>
    (step.highlights ?? []).filter((h) => h.kind === kind),
  );
}

describe('insertionSort.run', () => {
  it('sorts the default input ascending', () => {
    const trace = insertionSort.run(insertionSort.defaultInput());
    expect(trace[trace.length - 1]!.state.array).toEqual([1, 2, 3, 5, 7, 9]);
  });

  it('sorts an arbitrary array preserving multiset', () => {
    const input = { array: [9, 8, 7, 6, 5, 5, 1] };
    const trace = insertionSort.run(input);
    expect(trace[trace.length - 1]!.state.array).toEqual(
      [...input.array].sort((a, b) => a - b),
    );
  });

  it('marks the value being inserted with an active "key" caret', () => {
    const trace = insertionSort.run(insertionSort.defaultInput());
    const keyMarks = trace.flatMap((s) =>
      (s.highlights ?? []).filter(
        (h) => h.kind === 'active' && h.meta?.['label'] === 'key',
      ),
    );
    expect(keyMarks.length).toBeGreaterThan(0);
  });

  it('does no swaps on an already-sorted array', () => {
    const trace = insertionSort.run({ array: [1, 2, 3, 4, 5] });
    expect(highlightsOfKind(trace, 'swap')).toHaveLength(0);
    expect(trace[trace.length - 1]!.metrics!['swaps']).toBe(0);
  });

  it('emits compare and swap highlights on unsorted input', () => {
    const trace = insertionSort.run(insertionSort.defaultInput());
    expect(highlightsOfKind(trace, 'compare').length).toBeGreaterThan(0);
    expect(highlightsOfKind(trace, 'swap').length).toBeGreaterThan(0);
  });

  it('states the comparison and swap counts in the final explanation (A11Y-2)', () => {
    const trace = insertionSort.run(insertionSort.defaultInput());
    const last = trace[trace.length - 1]!;
    // The metrics pills and the aria-live explanation must agree.
    expect(last.explanation).toContain(
      `${last.metrics!['comparisons']} comparisons, ${last.metrics!['swaps']} swaps`,
    );
  });

  it('deep-copies snapshots (mutating a later step leaves earlier steps intact)', () => {
    const trace = insertionSort.run(insertionSort.defaultInput());
    trace[trace.length - 1]!.state.array[0] = 999;
    expect(trace[0]!.state.array).toEqual([5, 2, 9, 1, 7, 3]);
  });
});

describe('insertionSort.parseInput', () => {
  it('parses a bracketed array', () => {
    expect(insertionSort.parseInput('[5,2,9]')).toEqual({ array: [5, 2, 9] });
  });

  it('rejects a string with no array', () => {
    expect(insertionSort.parseInput('nope')).toEqual({
      error: 'Type an array to sort, e.g. [5,2,9,1,7]',
    });
  });

  it('rejects arrays longer than 30', () => {
    const raw = `[${Array.from({ length: 31 }, (_, i) => i).join(',')}]`;
    expect(insertionSort.parseInput(raw)).toEqual({
      error: 'Keep the array to 30 numbers or fewer.',
    });
  });
});

describe('insertionSort.predictStep (M8.2)', () => {
  it('asks only on compare steps, and never on the last one', () => {
    const input = insertionSort.defaultInput();
    const trace = insertionSort.run(input);
    let asked = 0;
    for (let i = 0; i < trace.length; i += 1) {
      const q = insertionSort.predictStep!(trace, i, input);
      const isCompare = (trace[i]!.highlights ?? []).some(
        (h) => h.kind === 'compare',
      );
      const isLast = i === trace.length - 1;
      expect(q !== null).toBe(isCompare && !isLast);
      if (q) asked += 1;
    }
    expect(asked).toBeGreaterThan(0);
  });

  it('grades every compare against what the next step actually does', () => {
    // The swap-based variant shifts by ADJACENT swaps, so a compare's own swap
    // is the very next step and the cumulative metric delta grades it honestly.
    for (const array of [[5, 2, 9, 1, 7, 3], [1, 2, 3, 4], [4, 4, 2], [7]]) {
      const input = { array };
      const trace = insertionSort.run(input);
      for (let i = 0; i < trace.length; i += 1) {
        const q = insertionSort.predictStep!(trace, i, input);
        if (!q) continue;
        const swapsNext = (trace[i + 1]!.highlights ?? []).some(
          (h) => h.kind === 'swap',
        );
        expect(q.choices[q.correctIndex]).toBe(swapsNext ? 'Swap' : 'No swap');
      }
    }
  });

  it('offers the two neutral choices — no score, no ratio', () => {
    const input = insertionSort.defaultInput();
    const trace = insertionSort.run(input);
    const q = trace
      .map((_, i) => insertionSort.predictStep!(trace, i, input))
      .find((candidate) => candidate !== null)!;
    expect(q.choices).toEqual(['Swap', 'No swap']);
    expect(q.prompt).toBe('Do these two values swap in the next step?');
  });
});

import { describe, expect, it } from 'vitest';
import { bubbleSort } from '../../src/viz/algorithms/bubble-sort';
import type { Highlight } from '../../src/viz/core/types';

function highlightsOfKind(
  trace: ReturnType<typeof bubbleSort.run>,
  kind: Highlight['kind'],
): Highlight[] {
  return trace.flatMap((step) =>
    (step.highlights ?? []).filter((h) => h.kind === kind),
  );
}

const isSorted = (a: number[]): boolean =>
  a.every((v, i) => i === 0 || a[i - 1]! <= v);

describe('bubbleSort.run', () => {
  it('sorts the default input ascending', () => {
    const trace = bubbleSort.run(bubbleSort.defaultInput());
    const last = trace[trace.length - 1]!;
    expect(last.state.array).toEqual([1, 2, 3, 5, 7, 9]);
    expect(isSorted(last.state.array)).toBe(true);
  });

  it('sorts an arbitrary array and never loses or duplicates values', () => {
    const input = { array: [4, 4, 1, 9, 0, -3, 8] };
    const trace = bubbleSort.run(input);
    const out = trace[trace.length - 1]!.state.array;
    expect(out).toEqual([...input.array].sort((a, b) => a - b));
  });

  it('emits compare and swap highlights', () => {
    const trace = bubbleSort.run(bubbleSort.defaultInput());
    expect(highlightsOfKind(trace, 'compare').length).toBeGreaterThan(0);
    expect(highlightsOfKind(trace, 'swap').length).toBeGreaterThan(0);
  });

  it('counts comparisons and swaps in metrics', () => {
    const trace = bubbleSort.run(bubbleSort.defaultInput());
    const metrics = trace[trace.length - 1]!.metrics!;
    expect(metrics['comparisons']).toBeGreaterThan(0);
    expect(metrics['swaps']).toBeGreaterThan(0);
    // Swaps never exceed comparisons.
    expect(metrics['swaps']).toBeLessThanOrEqual(metrics['comparisons']!);
  });

  it('states the comparison and swap counts in the final explanation (A11Y-2)', () => {
    const trace = bubbleSort.run(bubbleSort.defaultInput());
    const last = trace[trace.length - 1]!;
    // The metrics pills and the aria-live explanation must agree.
    expect(last.explanation).toContain(
      `${last.metrics!['comparisons']} comparisons, ${last.metrics!['swaps']} swaps`,
    );
  });

  it('exits early with zero swaps on an already-sorted array', () => {
    const trace = bubbleSort.run({ array: [1, 2, 3, 4] });
    expect(highlightsOfKind(trace, 'swap')).toHaveLength(0);
    expect(trace.some((s) => /already sorted/.test(s.explanation))).toBe(true);
  });

  it('handles a single-element array', () => {
    const trace = bubbleSort.run({ array: [42] });
    expect(trace[trace.length - 1]!.state.array).toEqual([42]);
  });

  it('deep-copies snapshots (mutating a later step leaves earlier steps intact)', () => {
    const trace = bubbleSort.run(bubbleSort.defaultInput());
    trace[trace.length - 1]!.state.array[0] = 999;
    expect(trace[0]!.state.array).toEqual([5, 2, 9, 1, 7, 3]);
  });
});

describe('bubbleSort.parseInput', () => {
  it('parses a bracketed array', () => {
    expect(bubbleSort.parseInput('[5,2,9,1,7]')).toEqual({
      array: [5, 2, 9, 1, 7],
    });
  });

  it('rejects a string with no array', () => {
    expect(bubbleSort.parseInput('nope')).toEqual({
      error: 'Type an array to sort, e.g. [5,2,9,1,7]',
    });
  });

  it('rejects non-integer values', () => {
    expect(bubbleSort.parseInput('[1,x]')).toEqual({
      error: 'Use whole numbers only, e.g. [5,2,9,1,7]',
    });
  });

  it('rejects arrays longer than 30', () => {
    const raw = `[${Array.from({ length: 31 }, (_, i) => i).join(',')}]`;
    expect(bubbleSort.parseInput(raw)).toEqual({
      error: 'Keep the array to 30 numbers or fewer.',
    });
  });
});

describe('bubbleSort.predictStep (M8.2)', () => {
  it('asks only on compare steps, and never on the last one', () => {
    const input = bubbleSort.defaultInput();
    const trace = bubbleSort.run(input);
    let asked = 0;
    for (let i = 0; i < trace.length; i += 1) {
      const q = bubbleSort.predictStep!(trace, i, input);
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
    // Bubble sort is an ADJACENT-swap sort: a compare's own swap is the very
    // next step, so the cumulative metric delta and the next step's `swap`
    // highlight always agree. (Quick/selection sort break exactly this.)
    for (const array of [[5, 2, 9, 1, 7, 3], [1, 2, 3, 4], [3, 3, 1], [42]]) {
      const input = { array };
      const trace = bubbleSort.run(input);
      for (let i = 0; i < trace.length; i += 1) {
        const q = bubbleSort.predictStep!(trace, i, input);
        if (!q) continue;
        const swapsNext = (trace[i + 1]!.highlights ?? []).some(
          (h) => h.kind === 'swap',
        );
        expect(q.choices[q.correctIndex]).toBe(swapsNext ? 'Swap' : 'No swap');
      }
    }
  });

  it('offers the two neutral choices — no score, no ratio', () => {
    const input = bubbleSort.defaultInput();
    const trace = bubbleSort.run(input);
    const q = trace
      .map((_, i) => bubbleSort.predictStep!(trace, i, input))
      .find((candidate) => candidate !== null)!;
    expect(q.choices).toEqual(['Swap', 'No swap']);
    expect(q.prompt).toBe('Do these two values swap in the next step?');
  });
});

import { describe, expect, it } from 'vitest';
import {
  binarySearch,
  type BinarySearchInput,
} from '../../src/viz/algorithms/binary-search';
import type { Highlight } from '../../src/viz/core/types';

/** Collects every highlight of a given kind across a whole trace. */
function highlightsOfKind(
  trace: ReturnType<typeof binarySearch.run>,
  kind: Highlight['kind'],
): Highlight[] {
  return trace.flatMap((step) =>
    (step.highlights ?? []).filter((h) => h.kind === kind),
  );
}

describe('binarySearch.run', () => {
  it('ends in a `found` highlight on the correct index for a present target', () => {
    const trace = binarySearch.run({ array: [1, 3, 5, 7], target: 5 });
    const last = trace[trace.length - 1]!;

    expect(last.state.foundIndex).toBe(2);
    expect(last.highlights).toContainEqual({ kind: 'found', ids: ['i2'] });
    // The very last step is the terminal found step.
    expect(last.explanation).toMatch(/Found 5 at index 2/);
  });

  it('ends with an empty range and a "not in the array" explanation for an absent target', () => {
    const trace = binarySearch.run({ array: [1, 3, 5, 7], target: 4 });
    const last = trace[trace.length - 1]!;

    // Empty window: lo has passed hi.
    expect(last.state.lo).toBeGreaterThan(last.state.hi);
    expect(last.explanation).toMatch(/not in the array/);
    // No `found` highlight anywhere in the trace, and no found index.
    expect(highlightsOfKind(trace, 'found')).toHaveLength(0);
    expect(last.state.foundIndex).toBeNull();
    // The terminal step carries no in-range cells.
    expect(last.highlights ?? []).toHaveLength(0);
  });

  it('emits the default input trace ending in found (defaultInput present target)', () => {
    const trace = binarySearch.run(binarySearch.defaultInput());
    const last = trace[trace.length - 1]!;
    expect(last.state.foundIndex).toBe(3); // value 7 at index 3 in [1,3,5,7,9,11]
  });

  it('deep-copies snapshots: mutating a later step leaves earlier steps intact', () => {
    const trace = binarySearch.run({ array: [1, 3, 5, 7], target: 5 });
    const firstBefore = trace[0]!.state.array[0];

    // Corrupt the last step's array; earlier snapshots must be untouched.
    trace[trace.length - 1]!.state.array[0] = 999;

    expect(trace[0]!.state.array[0]).toBe(firstBefore);
    expect(trace[0]!.state.array[0]).not.toBe(999);
  });

  it('states the comparison count in the final explanation (A11Y-2)', () => {
    const trace = binarySearch.run({ array: [1, 3, 5, 7, 9, 11], target: 11 });
    const last = trace[trace.length - 1]!;
    // The metrics pill and the aria-live explanation must agree.
    expect(last.explanation).toContain(
      `after ${last.metrics!['comparisons']} comparisons`,
    );
  });

  it('says "1 comparison", not "1 comparisons", after a single probe', () => {
    const trace = binarySearch.run({ array: [5], target: 5 });
    expect(trace[trace.length - 1]!.explanation).toContain(
      'after 1 comparison.',
    );
  });

  it('reports comparisons as a monotonic non-decreasing metric', () => {
    const trace = binarySearch.run({ array: [1, 3, 5, 7, 9, 11], target: 11 });
    let previous = -1;
    for (const step of trace) {
      const comparisons = step.metrics?.['comparisons'] ?? 0;
      expect(comparisons).toBeGreaterThanOrEqual(previous);
      previous = comparisons;
    }
  });
});

describe('binarySearch.parseInput', () => {
  it('parses a valid "[..] target=n" string into typed input', () => {
    expect(binarySearch.parseInput('[1,3,5,7] target=5')).toEqual({
      array: [1, 3, 5, 7],
      target: 5,
    } satisfies BinarySearchInput);
  });

  it('tolerates whitespace and negative numbers', () => {
    expect(binarySearch.parseInput('[ -3, 0, 4 ]  target = -3')).toEqual({
      array: [-3, 0, 4],
      target: -3,
    });
  });

  it('rejects a string with no array, with a friendly message', () => {
    expect(binarySearch.parseInput('target=5')).toEqual({
      error: 'Type an array and target, e.g. [1,3,5,7] target=5',
    });
  });

  it('rejects a missing target', () => {
    expect(binarySearch.parseInput('[1,3,5,7]')).toEqual({
      error: 'Add a target, e.g. [1,3,5,7] target=5',
    });
  });

  it('rejects non-integer values', () => {
    expect(binarySearch.parseInput('[1,2,x] target=5')).toEqual({
      error: 'Use whole numbers only, e.g. [1,3,5,7]',
    });
  });

  it('rejects arrays longer than 30 (the input cap)', () => {
    const thirtyOne = Array.from({ length: 31 }, (_, i) => i);
    const raw = `[${thirtyOne.join(',')}] target=5`;
    expect(binarySearch.parseInput(raw)).toEqual({
      error: 'Keep the array to 30 numbers or fewer.',
    });
  });

  it('rejects an unsorted array (the binary-search precondition)', () => {
    expect(binarySearch.parseInput('[3,1,2] target=2')).toEqual({
      error: 'Binary search needs a sorted array — try [1,3,5,7].',
    });
  });
});

describe('binarySearch.predictStep (M8.2)', () => {
  /** The question for step `i`, or `null`. */
  const ask = (
    input: BinarySearchInput,
    i: number,
  ): ReturnType<NonNullable<typeof binarySearch.predictStep>> =>
    binarySearch.predictStep!(binarySearch.run(input), i, input);

  it('returns null on the last step — there is no successor to grade against', () => {
    const input: BinarySearchInput = { array: [1, 3, 5, 7], target: 5 };
    const trace = binarySearch.run(input);
    expect(ask(input, trace.length - 1)).toBeNull();
    // Every earlier step DOES have a question — binary search always decides.
    for (let i = 0; i < trace.length - 1; i += 1) {
      expect(ask(input, i)).not.toBeNull();
    }
  });

  it('checks foundIndex FIRST: the hit grades "Found it", not a left/right read', () => {
    // [1,3,5,7] target 5: step 1 probes index 1 (3 < 5), step 2 probes index 2
    // and hits. That hit's value (5) is NOT less than the target, so a grader
    // that compared before checking foundIndex would answer "Go left".
    const input: BinarySearchInput = { array: [1, 3, 5, 7], target: 5 };
    expect(binarySearch.run(input)[2]!.state.foundIndex).toBe(2);
    expect(ask(input, 1)!.choices[ask(input, 1)!.correctIndex]).toBe(
      'Found it',
    );
  });

  it('checks the empty-window terminal before reading array[mid]', () => {
    // [1,3,5,7] target 4 ends with mid === null. A grader that read
    // array[mid] first would get `undefined`, and `undefined < 4` is false —
    // silently answering "Go left" on the step where the search gives up.
    const input: BinarySearchInput = { array: [1, 3, 5, 7], target: 4 };
    const trace = binarySearch.run(input);
    const terminal = trace[trace.length - 1]!;
    expect(terminal.state.mid).toBeNull();
    expect(terminal.state.foundIndex).toBeNull();

    const q = ask(input, trace.length - 2)!;
    expect(q.choices[q.correctIndex]).toBe('Not present');
  });

  it('grades the next probe against the target, not the lo/hi window', () => {
    // Probe below the target → the search moves right.
    const right: BinarySearchInput = { array: [1, 3, 5, 7, 9, 11], target: 11 };
    expect(binarySearch.run(right)[1]!.state.mid).toBe(2); // holds 5
    const qRight = ask(right, 0)!;
    expect(qRight.choices[qRight.correctIndex]).toBe('Go right');

    // Probe above the target → the search moves left.
    const left: BinarySearchInput = { array: [1, 3, 5, 7], target: 1 };
    expect(binarySearch.run(left)[1]!.state.mid).toBe(1); // holds 3
    const qLeft = ask(left, 0)!;
    expect(qLeft.choices[qLeft.correctIndex]).toBe('Go left');
  });

  it('offers the four fixed choices with a correctIndex inside them, at every step', () => {
    const inputs: BinarySearchInput[] = [
      binarySearch.defaultInput(),
      { array: [1, 3, 5, 7], target: 4 },
      { array: [], target: 5 },
      { array: [5], target: 5 },
    ];
    for (const input of inputs) {
      const trace = binarySearch.run(input);
      for (let i = 0; i < trace.length; i += 1) {
        const q = binarySearch.predictStep!(trace, i, input);
        if (!q) continue;
        expect(q.choices).toEqual([
          'Go left',
          'Go right',
          'Found it',
          'Not present',
        ]);
        // §11.2 caps choices at 4.
        expect(q.choices.length).toBeLessThanOrEqual(4);
        expect(q.correctIndex).toBeGreaterThanOrEqual(0);
        expect(q.correctIndex).toBeLessThan(q.choices.length);
      }
    }
  });
});

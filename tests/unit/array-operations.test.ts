import { describe, expect, it } from 'vitest';
import {
  arrayOperations,
  type ArrayOperationsInput,
} from '../../src/viz/algorithms/array-operations';
import type { Highlight } from '../../src/viz/core/types';

/** Collects every highlight of a given kind across a whole trace. */
function highlightsOfKind(
  trace: ReturnType<typeof arrayOperations.run>,
  kind: Highlight['kind'],
): Highlight[] {
  return trace.flatMap((step) =>
    (step.highlights ?? []).filter((h) => h.kind === kind),
  );
}

describe('arrayOperations.run', () => {
  it('runs access → insert → delete and ends with the transformed array', () => {
    const trace = arrayOperations.run(arrayOperations.defaultInput());
    const last = trace[trace.length - 1]!;
    // Start [10,20,30,40,50]: insert 25 at index 1, delete index 3 (value 30).
    expect(last.state.array).toEqual([10, 25, 20, 40, 50]);
  });

  it('accesses the requested index with an `active` "read" marker (O(1))', () => {
    const trace = arrayOperations.run(arrayOperations.defaultInput());
    const readStep = trace.find((step) =>
      (step.highlights ?? []).some(
        (h) => h.kind === 'active' && h.meta?.['label'] === 'read',
      ),
    );
    expect(readStep).toBeDefined();
    expect(readStep!.highlights).toContainEqual({
      kind: 'active',
      ids: ['i2'],
      meta: { label: 'read' },
    });
  });

  it('marks the insert (+) at the target index and a delete (✕)', () => {
    const trace = arrayOperations.run(arrayOperations.defaultInput());
    expect(highlightsOfKind(trace, 'insert')).toContainEqual({
      kind: 'insert',
      ids: ['i1'],
    });
    expect(highlightsOfKind(trace, 'delete')).toContainEqual({
      kind: 'delete',
      ids: ['i3'],
    });
  });

  it('keeps the whole array visible via a full-range highlight on step 0', () => {
    const trace = arrayOperations.run(arrayOperations.defaultInput());
    expect(trace[0]!.highlights).toContainEqual({
      kind: 'range',
      ids: ['i0', 'i1', 'i2', 'i3', 'i4'],
    });
  });

  it('counts one shift per moved element (metric is non-decreasing)', () => {
    const trace = arrayOperations.run(arrayOperations.defaultInput());
    let previous = 0;
    for (const step of trace) {
      const shifts = step.metrics?.['shifts'] ?? 0;
      expect(shifts).toBeGreaterThanOrEqual(previous);
      previous = shifts;
    }
    // 4 shifts to insert at index 1, then 2 shifts to delete index 3.
    expect(trace[trace.length - 1]!.metrics?.['shifts']).toBe(6);
  });

  it('handles an empty array without throwing', () => {
    const trace = arrayOperations.run({
      array: [],
      accessIndex: 0,
      insertIndex: 0,
      insertValue: 1,
      deleteIndex: 0,
    });
    expect(trace).toHaveLength(1);
    expect(trace[0]!.state.array).toEqual([]);
  });

  it('deep-copies snapshots: mutating a later step leaves earlier steps intact', () => {
    const trace = arrayOperations.run(arrayOperations.defaultInput());
    const firstBefore = trace[0]!.state.array[0];
    trace[trace.length - 1]!.state.array[0] = 999;
    expect(trace[0]!.state.array[0]).toBe(firstBefore);
    expect(trace[0]!.state.array[0]).not.toBe(999);
  });
});

describe('arrayOperations.parseInput', () => {
  it('parses an array and reads target= as the access index', () => {
    expect(arrayOperations.parseInput('[10,20,30,40] target=1')).toEqual({
      array: [10, 20, 30, 40],
      accessIndex: 1,
      insertIndex: 1,
      insertValue: 41,
      deleteIndex: 2,
    } satisfies ArrayOperationsInput);
  });

  it('rejects a string with no array', () => {
    expect(arrayOperations.parseInput('nope')).toEqual({
      error: 'Type an array, e.g. [10,20,30,40,50]',
    });
  });

  it('rejects non-integer values', () => {
    expect(arrayOperations.parseInput('[1,x,3]')).toEqual({
      error: 'Use whole numbers only, e.g. [10,20,30,40,50]',
    });
  });

  it('rejects an empty array', () => {
    expect(arrayOperations.parseInput('[]')).toEqual({
      error: 'Add at least one number, e.g. [10,20,30,40,50]',
    });
  });

  it('rejects arrays longer than 30 (the input cap)', () => {
    const raw = `[${Array.from({ length: 31 }, (_, i) => i).join(',')}]`;
    expect(arrayOperations.parseInput(raw)).toEqual({
      error: 'Keep the array to 30 numbers or fewer.',
    });
  });
});

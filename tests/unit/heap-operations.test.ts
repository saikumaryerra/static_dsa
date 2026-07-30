import { describe, expect, it } from 'vitest';
import {
  heapOperations,
  type HeapOperationsInput,
} from '../../src/viz/algorithms/heap-operations';
import type { Highlight } from '../../src/viz/core/types';

function highlightsOfKind(
  trace: ReturnType<typeof heapOperations.run>,
  kind: Highlight['kind'],
): Highlight[] {
  return trace.flatMap((step) =>
    (step.highlights ?? []).filter((h) => h.kind === kind),
  );
}

/** True when every parent is ≥ its children (max-heap property). */
function isMaxHeap(heap: number[]): boolean {
  for (let i = 1; i < heap.length; i += 1) {
    if (heap[(i - 1) >> 1]! < heap[i]!) return false;
  }
  return true;
}

describe('heapOperations.run', () => {
  it('builds a valid max-heap from the input values', () => {
    const trace = heapOperations.run(heapOperations.defaultInput());
    const last = trace[trace.length - 1]!;
    expect(last.state.heap).toEqual([15, 9, 12, 5, 8, 3]);
    expect(isMaxHeap(last.state.heap)).toBe(true);
    expect(last.state.heap[0]).toBe(15); // largest at the root
  });

  it('emits compare and swap steps that mirror in the backing array', () => {
    const trace = heapOperations.run(heapOperations.defaultInput());
    expect(highlightsOfKind(trace, 'compare').length).toBeGreaterThan(0);
    expect(highlightsOfKind(trace, 'swap').length).toBeGreaterThan(0);
    // The renderer reads comparing/swapping index pairs off the state.
    const comparing = trace.filter((s) => s.state.comparing !== undefined);
    const swapping = trace.filter((s) => s.state.swapping !== undefined);
    expect(comparing.length).toBeGreaterThan(0);
    expect(swapping.length).toBeGreaterThan(0);
    for (const step of swapping) {
      expect(step.state.swapping).toHaveLength(2);
    }
  });

  it('counts comparisons and swaps in metrics', () => {
    const trace = heapOperations.run(heapOperations.defaultInput());
    const last = trace[trace.length - 1]!;
    expect(last.metrics?.['comparisons']).toBe(7);
    expect(last.metrics?.['swaps']).toBe(5);
  });

  it('inserting one value needs no swaps and holds the heap property', () => {
    const trace = heapOperations.run({ values: [42] });
    const last = trace[trace.length - 1]!;
    expect(last.state.heap).toEqual([42]);
    expect(highlightsOfKind(trace, 'swap')).toHaveLength(0);
    expect(isMaxHeap(last.state.heap)).toBe(true);
  });

  it('keeps a valid heap after every insertion, not just at the end', () => {
    const trace = heapOperations.run({ values: [1, 2, 3, 4, 5, 6, 7] });
    const last = trace[trace.length - 1]!;
    expect(isMaxHeap(last.state.heap)).toBe(true);
    expect(last.state.heap[0]).toBe(7);
  });

  it('deep-copies snapshots: mutating a later step leaves earlier steps intact', () => {
    const trace = heapOperations.run(heapOperations.defaultInput());
    const firstLen = trace[1]!.state.heap.length;
    trace[trace.length - 1]!.state.heap.push(999);
    expect(trace[1]!.state.heap.length).toBe(firstLen);
  });
});

describe('heapOperations.parseInput', () => {
  it('parses a list of values', () => {
    expect(heapOperations.parseInput('[5,9,3,12,8,15]')).toEqual({
      values: [5, 9, 3, 12, 8, 15],
    } satisfies HeapOperationsInput);
  });

  it('rejects a string with no array', () => {
    expect(heapOperations.parseInput('nope')).toEqual({
      error: 'Type values to insert, e.g. [5,9,3,12,8,15]',
    });
  });

  it('rejects non-integer values', () => {
    expect(heapOperations.parseInput('[1,x]')).toEqual({
      error: 'Use whole numbers only, e.g. [5,9,3,12,8,15]',
    });
  });

  it('rejects an empty list', () => {
    expect(heapOperations.parseInput('[]')).toEqual({
      error: 'Add at least one value, e.g. [5,9,3,12,8,15]',
    });
  });

  it('rejects more than 15 values (the item cap)', () => {
    const raw = `[${Array.from({ length: 16 }, (_, i) => i).join(',')}]`;
    expect(heapOperations.parseInput(raw)).toEqual({
      error: 'Keep it to 15 values or fewer.',
    });
  });
});

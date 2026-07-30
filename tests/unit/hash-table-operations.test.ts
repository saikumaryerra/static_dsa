import { describe, expect, it } from 'vitest';
import {
  hashTableOperations,
  type HashTableOperationsInput,
} from '../../src/viz/algorithms/hash-table-operations';
import type { Highlight } from '../../src/viz/core/types';

function highlightsOfKind(
  trace: ReturnType<typeof hashTableOperations.run>,
  kind: Highlight['kind'],
): Highlight[] {
  return trace.flatMap((step) =>
    (step.highlights ?? []).filter((h) => h.kind === kind),
  );
}

describe('hashTableOperations.run', () => {
  it('chains collided keys, producing a bucket with a chain of length > 1', () => {
    const trace = hashTableOperations.run(hashTableOperations.defaultInput());
    const last = trace[trace.length - 1]!;
    // capacity 5: 11,6 -> bucket 1; 15,20 -> bucket 0; 24 -> bucket 4.
    expect(last.state.buckets[0]!.map((e) => e.key)).toEqual([15, 20]);
    expect(last.state.buckets[1]!.map((e) => e.key)).toEqual([11, 6]);
    expect(last.state.buckets[4]!.map((e) => e.key)).toEqual([24]);
    // At least one chain longer than one entry — a visible collision.
    expect(last.state.buckets.some((chain) => chain.length > 1)).toBe(true);
    expect(last.state.buckets).toHaveLength(5);
  });

  it('probes a bucket for every key and marks each insert', () => {
    const trace = hashTableOperations.run(hashTableOperations.defaultInput());
    // Five keys inserted -> five insert markers (one per key).
    expect(highlightsOfKind(trace, 'insert')).toHaveLength(5);
    // The second key in bucket 1 is chained at position 1.
    expect(highlightsOfKind(trace, 'insert')).toContainEqual({
      kind: 'insert',
      ids: ['h1_1'],
    });
  });

  it('counts collisions and search comparisons in metrics', () => {
    const trace = hashTableOperations.run(hashTableOperations.defaultInput());
    const last = trace[trace.length - 1]!;
    expect(last.metrics?.['collisions']).toBe(2); // 6 into b1, 20 into b0
    expect(last.metrics?.['comparisons']).toBe(2); // walk 11 then match 6
  });

  it('search present key ends with a `found` highlight on the matched entry', () => {
    const trace = hashTableOperations.run(hashTableOperations.defaultInput());
    const found = highlightsOfKind(trace, 'found');
    expect(found).toContainEqual({ kind: 'found', ids: ['h1_1'] });
    expect(trace[trace.length - 1]!.explanation).toContain('Found 6');
  });

  it('search absent key ends not-found with no `found` highlight', () => {
    const trace = hashTableOperations.run({
      keys: [11, 24],
      capacity: 5,
      searchTarget: 99,
    });
    expect(highlightsOfKind(trace, 'found')).toHaveLength(0);
    expect(trace[trace.length - 1]!.explanation).toContain('not in the table');
  });

  it('skips a duplicate key (insert-if-absent) instead of chaining a second copy', () => {
    // 5 and 10 both hash to bucket 0; the repeated 5 is already present and skipped.
    const trace = hashTableOperations.run({
      keys: [5, 10, 5],
      capacity: 5,
      searchTarget: null,
    });
    const last = trace[trace.length - 1]!;
    expect(last.state.buckets[0]!.map((e) => e.key)).toEqual([5, 10]);
    // Two real inserts (5, 10) despite three keys — the duplicate chains nothing.
    expect(highlightsOfKind(trace, 'insert')).toHaveLength(2);
    // A collision is only counted for 10 (distinct key into an occupied bucket).
    expect(last.metrics?.['collisions']).toBe(1);
    expect(trace.some((s) => /already in bucket 0/.test(s.explanation))).toBe(
      true,
    );
  });

  it('handles a single key with no collisions', () => {
    const trace = hashTableOperations.run({
      keys: [7],
      capacity: 5,
      searchTarget: null,
    });
    const last = trace[trace.length - 1]!;
    expect(last.state.buckets[2]!.map((e) => e.key)).toEqual([7]);
    expect(highlightsOfKind(trace, 'found')).toHaveLength(0);
  });

  it('deep-copies snapshots: mutating a later step leaves earlier steps intact', () => {
    const trace = hashTableOperations.run(hashTableOperations.defaultInput());
    const firstBuckets = trace[0]!.state.buckets.length;
    trace[trace.length - 1]!.state.buckets[1]!.push({ key: 999 });
    expect(trace[0]!.state.buckets[1]).toEqual([]);
    expect(trace[0]!.state.buckets.length).toBe(firstBuckets);
  });
});

describe('hashTableOperations.parseInput', () => {
  it('parses keys, capacity, and search target', () => {
    expect(
      hashTableOperations.parseInput('[11,24,6,15,20] cap=5 target=6'),
    ).toEqual({
      keys: [11, 24, 6, 15, 20],
      capacity: 5,
      searchTarget: 6,
    } satisfies HashTableOperationsInput);
  });

  it('defaults capacity and search target when omitted', () => {
    expect(hashTableOperations.parseInput('[11,24]')).toEqual({
      keys: [11, 24],
      capacity: 7,
      searchTarget: 24,
    } satisfies HashTableOperationsInput);
  });

  it('rejects a string with no key list', () => {
    expect(hashTableOperations.parseInput('nope')).toEqual({
      error: 'Type keys to insert, e.g. [11,24,6,15] cap=5',
    });
  });

  it('rejects negative keys (the hash is key % capacity)', () => {
    expect(hashTableOperations.parseInput('[1,-2]')).toEqual({
      error: 'Use non-negative whole numbers for keys, e.g. [11,24,6,15]',
    });
  });

  it('rejects an empty key list', () => {
    expect(hashTableOperations.parseInput('[]')).toEqual({
      error: 'Add at least one key, e.g. [11,24,6,15]',
    });
  });

  it('rejects more than 30 keys (the key cap)', () => {
    const raw = `[${Array.from({ length: 31 }, (_, i) => i).join(',')}]`;
    expect(hashTableOperations.parseInput(raw)).toEqual({
      error: 'Keep it to 30 keys or fewer.',
    });
  });

  it('rejects a capacity above 30 (the bucket cap)', () => {
    expect(hashTableOperations.parseInput('[1,2] cap=31')).toEqual({
      error: 'Keep capacity to 30 buckets or fewer.',
    });
  });
});

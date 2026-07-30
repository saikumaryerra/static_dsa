import { describe, expect, it } from 'vitest';
import {
  linkedListOperations,
  type LinkedListOperationsInput,
} from '../../src/viz/algorithms/linked-list-operations';
import type { Highlight } from '../../src/viz/core/types';

function highlightsOfKind(
  trace: ReturnType<typeof linkedListOperations.run>,
  kind: Highlight['kind'],
): Highlight[] {
  return trace.flatMap((step) =>
    (step.highlights ?? []).filter((h) => h.kind === kind),
  );
}

describe('linkedListOperations.run', () => {
  it('traverses, inserts after curr, then deletes, ending with the right list', () => {
    const trace = linkedListOperations.run(linkedListOperations.defaultInput());
    const last = trace[trace.length - 1]!;
    // [12,34,56,78]: insert 40 after node 1 -> [12,34,40,56,78]; delete node 3 (56).
    expect(last.state.nodes.map((n) => n.value)).toEqual([12, 34, 40, 78]);
  });

  it('splices the new node in with an `insert` marker at its index', () => {
    const trace = linkedListOperations.run(linkedListOperations.defaultInput());
    expect(highlightsOfKind(trace, 'insert')).toContainEqual({
      kind: 'insert',
      ids: ['n2'],
    });
  });

  it('unlinks a node with a `delete` marker', () => {
    const trace = linkedListOperations.run(linkedListOperations.defaultInput());
    expect(highlightsOfKind(trace, 'delete')).toContainEqual({
      kind: 'delete',
      ids: ['n3'],
    });
  });

  it('marks traversed nodes visited and counts hops', () => {
    const trace = linkedListOperations.run(linkedListOperations.defaultInput());
    expect(highlightsOfKind(trace, 'visited')).toContainEqual({
      kind: 'visited',
      ids: ['n0'],
    });
    expect(trace[trace.length - 1]!.metrics?.['hops']).toBe(1);
  });

  it('keeps a head pointer on every step and is always singly linked', () => {
    const trace = linkedListOperations.run(linkedListOperations.defaultInput());
    for (const step of trace) {
      expect(step.state.kind).toBe('singly');
      expect(step.state.pointers?.some((p) => p.name === 'head')).toBe(true);
    }
  });

  it('handles an empty list without throwing', () => {
    const trace = linkedListOperations.run({
      values: [],
      traverseTo: 0,
      insertValue: 1,
      deleteIndex: 1,
    });
    expect(trace).toHaveLength(1);
    expect(trace[0]!.state.nodes).toEqual([]);
  });

  it('deep-copies snapshots: mutating a later step leaves earlier steps intact', () => {
    const trace = linkedListOperations.run(linkedListOperations.defaultInput());
    const firstBefore = trace[0]!.state.nodes[0]!.value;
    trace[trace.length - 1]!.state.nodes[0]!.value = 999;
    expect(trace[0]!.state.nodes[0]!.value).toBe(firstBefore);
  });
});

describe('linkedListOperations.parseInput', () => {
  it('parses a list and reads target= as how far to traverse', () => {
    expect(linkedListOperations.parseInput('[12,34,56,78] target=2')).toEqual({
      values: [12, 34, 56, 78],
      traverseTo: 2,
      insertValue: 79,
      deleteIndex: 2,
    } satisfies LinkedListOperationsInput);
  });

  it('rejects a string with no list', () => {
    expect(linkedListOperations.parseInput('nope')).toEqual({
      error: 'Type a list, e.g. [12,34,56,78]',
    });
  });

  it('rejects non-integer values', () => {
    expect(linkedListOperations.parseInput('[1,x]')).toEqual({
      error: 'Use whole numbers only, e.g. [12,34,56,78]',
    });
  });

  it('rejects an empty list', () => {
    expect(linkedListOperations.parseInput('[]')).toEqual({
      error: 'Add at least one node, e.g. [12,34,56,78]',
    });
  });

  it('rejects lists longer than 30 (the node cap)', () => {
    const raw = `[${Array.from({ length: 31 }, (_, i) => i).join(',')}]`;
    expect(linkedListOperations.parseInput(raw)).toEqual({
      error: 'Keep the list to 30 nodes or fewer.',
    });
  });
});

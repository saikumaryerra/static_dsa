import { describe, expect, it } from 'vitest';
import {
  stackOperations,
  type StackOperationsInput,
} from '../../src/viz/algorithms/stack-operations';
import type { Highlight } from '../../src/viz/core/types';

function highlightsOfKind(
  trace: ReturnType<typeof stackOperations.run>,
  kind: Highlight['kind'],
): Highlight[] {
  return trace.flatMap((step) =>
    (step.highlights ?? []).filter((h) => h.kind === kind),
  );
}

describe('stackOperations.run', () => {
  it('pushes every value then pops the stack empty', () => {
    const trace = stackOperations.run(stackOperations.defaultInput());
    const last = trace[trace.length - 1]!;
    expect(last.state.items).toEqual([]);
    expect(last.metrics?.['pushes']).toBe(3);
    expect(last.metrics?.['pops']).toBe(3);
  });

  it('pushes onto ascending slot ids with `insert` markers', () => {
    const trace = stackOperations.run(stackOperations.defaultInput());
    const inserts = highlightsOfKind(trace, 'insert').map((h) => h.ids[0]);
    expect(inserts).toEqual(['s0', 's1', 's2']);
  });

  it('pops in LIFO order: the last pushed slot is deleted first', () => {
    const trace = stackOperations.run(stackOperations.defaultInput());
    const deletes = highlightsOfKind(trace, 'delete').map((h) => h.ids[0]);
    expect(deletes).toEqual(['s2', 's1', 's0']);
  });

  it('tracks the top with a named pointer caret', () => {
    const trace = stackOperations.run(stackOperations.defaultInput());
    const pushStep = trace[3]!; // after pushing 12,34,56 the top is slot 2
    expect(pushStep.highlights).toContainEqual({
      kind: 'pointer',
      ids: ['s2'],
      meta: { label: 'top' },
    });
  });

  it('reaches its tallest state after all pushes', () => {
    const trace = stackOperations.run(stackOperations.defaultInput());
    expect(trace[3]!.state.items).toEqual([12, 34, 56]);
    expect(trace[3]!.state.top).toBe(2);
  });

  it('deep-copies snapshots: mutating a later step leaves earlier steps intact', () => {
    const trace = stackOperations.run(stackOperations.defaultInput());
    const built = trace[3]!.state.items.slice();
    // Corrupt the final (empty) step's items — an earlier full step must survive.
    trace[3]!.state.items.push(999);
    // The step-1 snapshot (just [12]) is independent of step-3's array.
    expect(trace[1]!.state.items).toEqual([12]);
    expect(built).toEqual([12, 34, 56]);
  });
});

describe('stackOperations.parseInput', () => {
  it('parses the values to push', () => {
    expect(stackOperations.parseInput('[12,34,56]')).toEqual({
      values: [12, 34, 56],
    } satisfies StackOperationsInput);
  });

  it('rejects a string with no array', () => {
    expect(stackOperations.parseInput('nope')).toEqual({
      error: 'Type values to push, e.g. [12,34,56]',
    });
  });

  it('rejects non-integer values', () => {
    expect(stackOperations.parseInput('[1,x]')).toEqual({
      error: 'Use whole numbers only, e.g. [12,34,56]',
    });
  });

  it('rejects an empty array', () => {
    expect(stackOperations.parseInput('[]')).toEqual({
      error: 'Add at least one value, e.g. [12,34,56]',
    });
  });

  it('rejects more than 12 values (the item cap)', () => {
    const raw = `[${Array.from({ length: 13 }, (_, i) => i).join(',')}]`;
    expect(stackOperations.parseInput(raw)).toEqual({
      error: 'Keep it to 12 values or fewer.',
    });
  });
});

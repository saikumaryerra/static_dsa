import { describe, expect, it } from 'vitest';
import {
  queueOperations,
  type QueueOperationsInput,
} from '../../src/viz/algorithms/queue-operations';
import type { Highlight } from '../../src/viz/core/types';

function highlightsOfKind(
  trace: ReturnType<typeof queueOperations.run>,
  kind: Highlight['kind'],
): Highlight[] {
  return trace.flatMap((step) =>
    (step.highlights ?? []).filter((h) => h.kind === kind),
  );
}

describe('queueOperations.run', () => {
  it('ends with the ring in its wrapped-around state', () => {
    const trace = queueOperations.run(queueOperations.defaultInput());
    const last = trace[trace.length - 1]!;
    // After the scripted ops the occupied run is 30,40,50 then 60 wrapped to slot 0.
    expect(last.state.slots).toEqual([60, null, 30, 40, 50]);
    expect(last.state.head).toBe(2);
    expect(last.state.tail).toBe(0);
    expect(last.state.size).toBe(4);
    expect(last.metrics?.['enqueues']).toBe(6);
    expect(last.metrics?.['dequeues']).toBe(2);
  });

  it('produces a wrap-around step (rear past the array end)', () => {
    const trace = queueOperations.run(queueOperations.defaultInput());
    const wrapStep = trace.find(
      (step) =>
        step.state.circular &&
        step.state.size > 0 &&
        step.state.head + step.state.size > step.state.slots.length,
    );
    expect(wrapStep).toBeDefined();
    expect(wrapStep!.explanation).toMatch(/wrap/i);
  });

  it('marks enqueues with insert and dequeues with delete', () => {
    const trace = queueOperations.run(queueOperations.defaultInput());
    expect(highlightsOfKind(trace, 'insert').length).toBe(6);
    expect(highlightsOfKind(trace, 'delete').length).toBe(2);
  });

  it('carries front/rear pointer carets while the queue is non-empty', () => {
    const trace = queueOperations.run(queueOperations.defaultInput());
    const pointers = highlightsOfKind(trace, 'pointer');
    expect(pointers.length).toBeGreaterThan(0);
    const labels = new Set(pointers.map((p) => p.meta?.['label']));
    expect(labels.has('front')).toBe(true);
    expect(labels.has('rear')).toBe(true);
  });

  it('states the enqueue and dequeue totals on whichever step ends the trace (A11Y-2)', () => {
    const trace = queueOperations.run(queueOperations.defaultInput());
    const last = trace[trace.length - 1]!;
    // The metrics pills and the aria-live explanation must agree.
    expect(last.explanation).toContain(
      `${last.metrics!['enqueues']} enqueues, ${last.metrics!['dequeues']} dequeues`,
    );
    // Even a refused enqueue carries the totals when that no-op ends the run.
    const full = queueOperations.run({
      capacity: 1,
      operations: [
        { kind: 'enqueue', value: 1 },
        { kind: 'enqueue', value: 2 },
      ],
    });
    expect(full[full.length - 1]!.explanation).toContain(
      '1 enqueue, 0 dequeues.',
    );
  });

  it('refuses to enqueue into a full ring (no-op step)', () => {
    const trace = queueOperations.run({
      capacity: 1,
      operations: [
        { kind: 'enqueue', value: 1 },
        { kind: 'enqueue', value: 2 },
      ],
    });
    const last = trace[trace.length - 1]!;
    expect(last.state.size).toBe(1);
    expect(last.state.slots).toEqual([1]);
    expect(last.explanation).toMatch(/full/i);
  });

  it('refuses to dequeue an empty ring (no-op step)', () => {
    const trace = queueOperations.run({
      capacity: 2,
      operations: [{ kind: 'dequeue' }],
    });
    expect(trace[trace.length - 1]!.explanation).toMatch(/empty/i);
  });

  it('deep-copies snapshots: mutating a later step leaves earlier steps intact', () => {
    const trace = queueOperations.run(queueOperations.defaultInput());
    const firstSlots = trace[0]!.state.slots.slice();
    trace[trace.length - 1]!.state.slots[0] = 999;
    expect(trace[0]!.state.slots).toEqual(firstSlots);
  });
});

describe('queueOperations.parseInput', () => {
  it('parses values into a fitted ring of enqueue operations', () => {
    expect(queueOperations.parseInput('[10,20,30]')).toEqual({
      capacity: 3,
      operations: [
        { kind: 'enqueue', value: 10 },
        { kind: 'enqueue', value: 20 },
        { kind: 'enqueue', value: 30 },
      ],
    } satisfies QueueOperationsInput);
  });

  it('rejects a string with no array', () => {
    expect(queueOperations.parseInput('nope')).toEqual({
      error: 'Type values to enqueue, e.g. [10,20,30]',
    });
  });

  it('rejects non-integer values', () => {
    expect(queueOperations.parseInput('[1,x]')).toEqual({
      error: 'Use whole numbers only, e.g. [10,20,30]',
    });
  });

  it('rejects an empty array', () => {
    expect(queueOperations.parseInput('[]')).toEqual({
      error: 'Add at least one value, e.g. [10,20,30]',
    });
  });

  it('rejects more than 12 values (the capacity cap)', () => {
    const raw = `[${Array.from({ length: 13 }, (_, i) => i).join(',')}]`;
    expect(queueOperations.parseInput(raw)).toEqual({
      error: 'Keep it to 12 values or fewer.',
    });
  });
});

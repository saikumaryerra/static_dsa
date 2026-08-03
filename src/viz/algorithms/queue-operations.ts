/**
 * Queue Operations — instrumented demo for the Queues lesson (site spec §5 L5,
 * §11.4). Runs a fixed-capacity circular queue through enqueues and dequeues,
 * culminating in a wrap-around: once the front has advanced, the rear reuses the
 * freed slots at the start of the array instead of running off the end. Both
 * enqueue and dequeue are O(1).
 *
 * TState matches QueueRenderer's `QueueState` ({ slots, head, tail, size,
 * circular }). `head` is the front index, `tail` the last occupied index; all
 * `capacity` slots are always present (empty = null). `insert` marks an enqueue
 * at the rear, `delete` a dequeue at the front, and `pointer` carets track
 * front/rear. Imports only core types + `snapshot` + the pure `slotId` helper
 * (never a renderer — architecture §3).
 */
import type { Algorithm, Highlight, Step, Trace } from '../core/types';
import { snapshot } from '../core/snapshot';
import { slotId } from '../core/ids';

/** Sanity cap on capacity so the fixed slot row stays readable. */
const MAX_CAPACITY = 12;

/** One scripted queue operation. */
export type QueueOp = { kind: 'enqueue'; value: number } | { kind: 'dequeue' };

/** Typed input: the ring's capacity and the operations to replay. */
export interface QueueOperationsInput {
  capacity: number;
  operations: QueueOp[];
}

/** Snapshot state QueueRenderer draws. */
export interface QueueOperationsState {
  slots: (number | null)[];
  head: number;
  tail: number;
  size: number;
  circular: boolean;
}

/**
 * Front/rear pointer highlights for the current occupied run. When the queue
 * holds a single item, front and rear coincide, so we emit one combined caret to
 * avoid two labels landing on top of each other.
 */
function frontRear(cap: number, head: number, size: number): Highlight[] {
  if (size === 0) return [];
  const last = (head + size - 1) % cap;
  if (last === head) {
    return [
      { kind: 'pointer', ids: [slotId(head)], meta: { label: 'front·rear' } },
    ];
  }
  return [
    { kind: 'pointer', ids: [slotId(head)], meta: { label: 'front' } },
    { kind: 'pointer', ids: [slotId(last)], meta: { label: 'rear' } },
  ];
}

/**
 * Replays `input.operations` on a ring of `input.capacity` slots, emitting one
 * `Step` per operation (a dequeue is two steps: mark the front, then advance).
 * Each step deep-copies its state via `snapshot()` (site spec §11.4). Enqueues
 * into a full ring and dequeues from an empty ring emit an explanatory no-op step.
 */
function run(input: QueueOperationsInput): Trace<QueueOperationsState> {
  const cap = input.capacity;
  const slots: (number | null)[] = new Array<number | null>(cap).fill(null);
  let head = 0;
  let size = 0;
  const trace: Trace<QueueOperationsState> = [];
  const metrics = { enqueues: 0, dequeues: 0 };

  /**
   * The metrics pills in words, e.g. `"5 enqueues, 2 dequeues"`. The final step
   * states them so the pills' payoff also reaches the `aria-live` explanation
   * and the SVG `<desc>` (A11Y-2).
   */
  const tally = (): string =>
    `${metrics.enqueues} enqueue${metrics.enqueues === 1 ? '' : 's'}, ${metrics.dequeues} dequeue${metrics.dequeues === 1 ? '' : 's'}`;

  const push = (explanation: string, highlights: Highlight[]): void => {
    const tail = size > 0 ? (head + size - 1) % cap : head;
    trace.push({
      state: snapshot({ slots: [...slots], head, tail, size, circular: true }),
      explanation,
      highlights,
      metrics: { ...metrics },
    } satisfies Step<QueueOperationsState>);
  };

  // Step 0: an empty ring of fixed slots.
  push(
    `A circular queue reuses a fixed array of ${cap} slots. front marks where we remove, rear where we add; both wrap around the ends.`,
    [],
  );

  for (const op of input.operations) {
    if (op.kind === 'enqueue') {
      if (size === cap) {
        push(
          `The queue is full (${cap}/${cap}) — ${op.value} cannot be enqueued until something is dequeued.`,
          frontRear(cap, head, size),
        );
        continue;
      }
      const pos = (head + size) % cap;
      const wrapped = pos < head; // rear has looped past the array end
      slots[pos] = op.value;
      size += 1;
      metrics.enqueues += 1;
      push(
        wrapped
          ? `Enqueue ${op.value} — the rear wraps around to index ${pos}, reusing a freed slot. This is what makes the queue "circular".`
          : `Enqueue ${op.value} at the rear (index ${pos}).`,
        [{ kind: 'insert', ids: [slotId(pos)] }, ...frontRear(cap, head, size)],
      );
    } else {
      if (size === 0) {
        push('The queue is empty — there is nothing to dequeue.', []);
        continue;
      }
      const frontPos = head;
      const value = slots[frontPos]!;
      // Mark the front item while it is still present (matches the demo pattern).
      push(`Dequeue removes ${value} from the front (index ${frontPos}).`, [
        { kind: 'delete', ids: [slotId(frontPos)] },
        ...frontRear(cap, head, size),
      ]);
      slots[frontPos] = null;
      head = (head + 1) % cap;
      size -= 1;
      metrics.dequeues += 1;
      push(
        size > 0
          ? `${value} is gone; front advances to index ${head}. The freed slot ${frontPos} can be reused later.`
          : `${value} is gone; the queue is now empty.`,
        frontRear(cap, head, size),
      );
    }
  }

  // Which step ends the trace depends on the last operation (enqueue, dequeue,
  // or a full/empty no-op), so the totals are appended to whichever step that
  // turned out to be. Only the explanation changes; the snapshot is untouched.
  const finalStep = trace[trace.length - 1]!;
  finalStep.explanation = `${finalStep.explanation} ${tally()}.`;

  return trace;
}

/**
 * Parses the custom-input box, e.g. `"[10,20,30]"`, into a run that enqueues each
 * value into a ring sized to fit them. The generic form's `target=` field is
 * ignored. Returns `{ error }` (never throws) and enforces the capacity cap.
 */
function parseInput(raw: string): QueueOperationsInput | { error: string } {
  const text = raw.trim();
  const arrayMatch = text.match(/\[([^\]]*)\]/);

  if (!arrayMatch) {
    return { error: 'Type values to enqueue, e.g. [10,20,30]' };
  }

  const inner = arrayMatch[1]!.trim();
  const values: number[] = [];
  if (inner.length > 0) {
    for (const token of inner.split(',')) {
      const t = token.trim();
      if (!/^-?\d+$/.test(t)) {
        return { error: 'Use whole numbers only, e.g. [10,20,30]' };
      }
      values.push(Number(t));
    }
  }

  if (values.length === 0) {
    return { error: 'Add at least one value, e.g. [10,20,30]' };
  }
  if (values.length > MAX_CAPACITY) {
    return { error: `Keep it to ${MAX_CAPACITY} values or fewer.` };
  }

  return {
    capacity: values.length,
    operations: values.map((value) => ({ kind: 'enqueue', value }) as QueueOp),
  };
}

/** The registered Queue Operations demo (default trace shows a wrap-around). */
export const queueOperations: Algorithm<
  QueueOperationsInput,
  QueueOperationsState
> = {
  id: 'queue-operations',
  label: 'Circular queue enqueue and dequeue',
  run,
  defaultInput: () => ({
    capacity: 5,
    operations: [
      { kind: 'enqueue', value: 10 },
      { kind: 'enqueue', value: 20 },
      { kind: 'enqueue', value: 30 },
      { kind: 'dequeue' },
      { kind: 'dequeue' },
      { kind: 'enqueue', value: 40 },
      { kind: 'enqueue', value: 50 },
      { kind: 'enqueue', value: 60 },
    ],
  }),
  parseInput,
};

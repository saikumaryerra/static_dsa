/**
 * Stack Operations — instrumented demo for the Stacks lesson (site spec §5 L4,
 * §11.4). Builds a stack up by pushing each input value, then tears it down by
 * popping — so the reader sees LIFO directly: the last value pushed is the first
 * one popped. Both push and pop touch only the top, so both are O(1).
 *
 * TState matches StackRenderer's `StackState` ({ items, top }). Index 0 is the
 * BOTTOM; the last item is the top. `insert` marks a push, `delete` marks a pop,
 * and a `pointer` caret tracks the top. Imports only core types + `snapshot` +
 * the pure `slotId` helper (never a renderer — architecture §3).
 */
import type { Algorithm, Highlight, Step, Trace } from '../core/types';
import { snapshot } from '../core/snapshot';
import { slotId } from '../core/ids';

/**
 * Per-renderer sanity cap. The spec allows arrays ≤ 30, but a stack is drawn
 * vertically, so we keep it shorter to stay readable (still within the spec cap).
 */
const MAX_ITEMS = 12;

/** Typed input: the values to push, in order, onto an initially empty stack. */
export interface StackOperationsInput {
  values: number[];
}

/** Snapshot state StackRenderer draws. */
export interface StackOperationsState {
  items: number[];
  top?: number;
}

/** Pointer highlight on the current top slot (named caret "top"). */
const topPointer = (index: number): Highlight => ({
  kind: 'pointer',
  ids: [slotId(index)],
  meta: { label: 'top' },
});

/**
 * Runs the push-all-then-pop-all demo, emitting one `Step` per operation (a pop
 * is two steps: mark the doomed item, then remove it). Each step deep-copies its
 * state via `snapshot()` (site spec §11.4).
 */
function run(input: StackOperationsInput): Trace<StackOperationsState> {
  const items: number[] = [];
  const trace: Trace<StackOperationsState> = [];
  const metrics = { pushes: 0, pops: 0 };

  const push = (explanation: string, highlights: Highlight[]): void => {
    const top = items.length > 0 ? items.length - 1 : undefined;
    trace.push({
      state: snapshot({
        items: [...items],
        ...(top === undefined ? {} : { top }),
      }),
      explanation,
      highlights,
      metrics: { ...metrics },
    } satisfies Step<StackOperationsState>);
  };

  // Step 0: an empty stack.
  push(
    'A stack is LIFO — last in, first out. It starts empty; we only ever add or remove at the top.',
    [],
  );

  // --- Build up: push each value onto the top ---
  for (const value of input.values) {
    items.push(value);
    metrics.pushes += 1;
    const top = items.length - 1;
    push(
      `Push ${value} onto the top (index ${top}). Adding at the top is O(1).`,
      [{ kind: 'insert', ids: [slotId(top)] }, topPointer(top)],
    );
  }

  // --- Tear down: pop from the top until empty, revealing LIFO order ---
  while (items.length > 0) {
    const top = items.length - 1;
    const value = items[top]!;
    // Mark the doomed item while it is still present (matches the demo pattern).
    push(
      `Pop the top item (${value}) from index ${top}. Removing from the top is O(1).`,
      [{ kind: 'delete', ids: [slotId(top)] }],
    );
    items.pop();
    metrics.pops += 1;
    if (items.length > 0) {
      const newTop = items.length - 1;
      push(
        `${value} is gone. ${items[newTop]} is now the top — the value pushed just before it.`,
        [topPointer(newTop)],
      );
    } else {
      push(`${value} is gone. The stack is empty again.`, []);
    }
  }

  return trace;
}

/**
 * Parses the custom-input box, e.g. `"[12,34,56]"`, into the values to push.
 * The generic form's `target=` field is ignored. Returns `{ error }` (never
 * throws) and enforces the item cap.
 */
function parseInput(raw: string): StackOperationsInput | { error: string } {
  const text = raw.trim();
  const arrayMatch = text.match(/\[([^\]]*)\]/);

  if (!arrayMatch) {
    return { error: 'Type values to push, e.g. [12,34,56]' };
  }

  const inner = arrayMatch[1]!.trim();
  const values: number[] = [];
  if (inner.length > 0) {
    for (const token of inner.split(',')) {
      const t = token.trim();
      if (!/^-?\d+$/.test(t)) {
        return { error: 'Use whole numbers only, e.g. [12,34,56]' };
      }
      values.push(Number(t));
    }
  }

  if (values.length === 0) {
    return { error: 'Add at least one value, e.g. [12,34,56]' };
  }
  if (values.length > MAX_ITEMS) {
    return { error: `Keep it to ${MAX_ITEMS} values or fewer.` };
  }

  return { values };
}

/** The registered Stack Operations demo. */
export const stackOperations: Algorithm<
  StackOperationsInput,
  StackOperationsState
> = {
  id: 'stack-operations',
  label: 'Stack push and pop (LIFO)',
  run,
  defaultInput: () => ({ values: [12, 34, 56] }),
  parseInput,
};

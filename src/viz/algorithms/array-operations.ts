/**
 * Array Operations — instrumented demo for the Arrays lesson (site spec §5 L2,
 * §11.4). Walks one array through the three defining operations so the reader
 * feels their cost:
 *   1. ACCESS by index — one direct jump, O(1).
 *   2. INSERT at an index — every later element shifts right first, O(n).
 *   3. DELETE at an index — every later element shifts left to close the gap, O(n).
 *
 * TState is ArrayRenderer's `ArrayWindowState` shape ({ array, ... }). Because
 * ArrayRenderer dims any cell that is not in a highlight, every step carries a
 * full-array `range` highlight so the whole array stays visible; the `range`
 * bracket doubles as an index-bounds cue (lo = first index, hi = last). The cell
 * in play is marked `active`/`insert`/`delete`. Imports only core types +
 * `snapshot` + the pure `cellId` helper (never a renderer — architecture §3).
 */
import type { Algorithm, Highlight, Step, Trace } from '../core/types';
import { snapshot } from '../core/snapshot';
import { cellId } from '../core/ids';

/** Hard cap on custom-array length (CLAUDE.md / site spec §11.4: arrays ≤ 30). */
const MAX_ARRAY_LENGTH = 30;

/**
 * Typed input: the starting array plus the indices/value the scripted demo uses.
 * Every index is clamped in `run` so custom input can never go out of bounds.
 */
export interface ArrayOperationsInput {
  array: number[];
  accessIndex: number;
  insertIndex: number;
  insertValue: number;
  deleteIndex: number;
}

/** Snapshot state ArrayRenderer draws (extras are informational, unused here). */
export interface ArrayOperationsState {
  array: number[];
}

/** `range` highlight over every current index, so no cell is dimmed as "eliminated". */
function fullRange(length: number): Highlight {
  const ids: string[] = [];
  for (let i = 0; i < length; i += 1) ids.push(cellId(i));
  return { kind: 'range', ids };
}

/** Clamp `i` into `[0, length - 1]` (or 0 for an empty array). */
const clampIndex = (i: number, length: number): number =>
  length === 0 ? 0 : Math.min(Math.max(Math.trunc(i), 0), length - 1);

/**
 * Runs the access → insert → delete demo on `input.array`, emitting one `Step`
 * per meaningful move (each shift is its own step, so the O(n) cost is visible).
 * Each step deep-copies its state via `snapshot()` (site spec §11.4), and the
 * working array mirrors exactly what the code samples in the lesson do.
 */
function run(input: ArrayOperationsInput): Trace<ArrayOperationsState> {
  const working = [...input.array];
  const trace: Trace<ArrayOperationsState> = [];
  const metrics = { shifts: 0 };

  const push = (
    array: number[],
    explanation: string,
    highlights: Highlight[],
  ): void => {
    trace.push({
      state: snapshot({ array }),
      explanation,
      highlights,
      metrics: { ...metrics },
    } satisfies Step<ArrayOperationsState>);
  };

  // Step 0: the array as it starts. The range bracket marks the valid indices.
  push(
    working,
    working.length === 0
      ? 'An empty array — there are no slots to work with yet.'
      : `An array stores ${working.length} items in contiguous slots, each with an index from 0 to ${working.length - 1}.`,
    working.length === 0 ? [] : [fullRange(working.length)],
  );

  if (working.length === 0) return trace;

  // --- 1. Access: O(1) direct jump ---
  const accessAt = clampIndex(input.accessIndex, working.length);
  push(
    working,
    `Access index ${accessAt} directly. The computer jumps straight to its address and reads ${working[accessAt]} — one step, O(1), no matter how large the array is.`,
    [
      fullRange(working.length),
      { kind: 'active', ids: [cellId(accessAt)], meta: { label: 'read' } },
    ],
  );

  // --- 2. Insert at an index: shift the tail right, then drop the value in (O(n)) ---
  const insertAt = clampIndex(input.insertIndex, working.length + 1);
  push(
    working,
    `Insert ${input.insertValue} at index ${insertAt}. Everything from index ${insertAt} onward must shift one slot to the right to make room — that is why insertion is O(n).`,
    [fullRange(working.length)],
  );

  // Grow by one, then copy from the right so no value is overwritten before it moves.
  working.push(working[working.length - 1] as number);
  for (let i = working.length - 1; i > insertAt; i -= 1) {
    working[i] = working[i - 1] as number;
    metrics.shifts += 1;
    push(working, `Shift the value from index ${i - 1} into index ${i}.`, [
      fullRange(working.length),
      { kind: 'active', ids: [cellId(i)], meta: { label: 'shift' } },
    ]);
  }
  working[insertAt] = input.insertValue;
  push(
    working,
    `The gap is open, so drop ${input.insertValue} into index ${insertAt}. The array now holds ${working.length} items.`,
    [fullRange(working.length), { kind: 'insert', ids: [cellId(insertAt)] }],
  );

  // --- 3. Delete at an index: mark it, then shift the tail left to close the gap (O(n)) ---
  const deleteAt = clampIndex(input.deleteIndex, working.length);
  push(
    working,
    `Delete index ${deleteAt} (value ${working[deleteAt]}). Removing it leaves a gap that later elements fill by shifting left — also O(n).`,
    [fullRange(working.length), { kind: 'delete', ids: [cellId(deleteAt)] }],
  );
  for (let i = deleteAt; i < working.length - 1; i += 1) {
    working[i] = working[i + 1] as number;
    metrics.shifts += 1;
    push(working, `Shift the value from index ${i + 1} into index ${i}.`, [
      fullRange(working.length),
      { kind: 'active', ids: [cellId(i)], meta: { label: 'shift' } },
    ]);
  }
  working.pop();
  push(
    working,
    `Drop the now-duplicate last slot. Deletion is complete — the array holds ${working.length} items.`,
    working.length === 0 ? [] : [fullRange(working.length)],
  );

  return trace;
}

/**
 * Parses the custom-input box, e.g. `"[10,20,30,40] target=1"`, into typed
 * input. The array comes from the array literal; the optional `target=` value
 * (the generic form's second field) is read as the access index. The other
 * operation indices are derived sensibly and clamped in `run`. Returns
 * `{ error }` (never throws) and enforces the ≤ 30 cap.
 */
function parseInput(raw: string): ArrayOperationsInput | { error: string } {
  const text = raw.trim();
  const arrayMatch = text.match(/\[([^\]]*)\]/);
  const targetMatch = text.match(/target\s*=\s*(-?\d+)/i);

  if (!arrayMatch) {
    return { error: 'Type an array, e.g. [10,20,30,40,50]' };
  }

  const inner = arrayMatch[1]!.trim();
  const array: number[] = [];
  if (inner.length > 0) {
    for (const token of inner.split(',')) {
      const t = token.trim();
      if (!/^-?\d+$/.test(t)) {
        return { error: 'Use whole numbers only, e.g. [10,20,30,40,50]' };
      }
      array.push(Number(t));
    }
  }

  if (array.length === 0) {
    return { error: 'Add at least one number, e.g. [10,20,30,40,50]' };
  }
  if (array.length > MAX_ARRAY_LENGTH) {
    return { error: 'Keep the array to 30 numbers or fewer.' };
  }

  // Access index: the optional target field, else the middle of the array.
  const accessIndex = targetMatch
    ? Number(targetMatch[1])
    : Math.floor(array.length / 2);
  // Insert just after the front; delete near the middle. Both clamped in run.
  const insertIndex = Math.min(1, array.length);
  const insertValue = Math.max(...array) + 1;
  const deleteIndex = Math.floor(array.length / 2);

  return { array, accessIndex, insertIndex, insertValue, deleteIndex };
}

/** The registered Array Operations demo. */
export const arrayOperations: Algorithm<
  ArrayOperationsInput,
  ArrayOperationsState
> = {
  id: 'array-operations',
  label: 'Array access, insert, and delete',
  run,
  defaultInput: () => ({
    array: [10, 20, 30, 40, 50],
    accessIndex: 2,
    insertIndex: 1,
    insertValue: 25,
    deleteIndex: 3,
  }),
  parseInput,
};

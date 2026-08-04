/**
 * Binary Search — instrumented algorithm (site spec §11.4, architecture §7).
 *
 * A recognizable iterative binary search that, instead of just returning an
 * index, emits one `Step` per compare so the Player can walk through the search
 * window narrowing. Imports only core types + the `snapshot` helper and the
 * renderer's pure `cellId` string helper (architecture §8 — the one allowed
 * renderer→algorithm import, a pure function, no structural coupling).
 */
import type {
  Algorithm,
  Highlight,
  PredictQuestion,
  Step,
  Trace,
} from '../core/types';
import { snapshot } from '../core/snapshot';
import { cellId } from '../core/ids';

/** Typed input for binary search: a sorted array and the value to find. */
export interface BinarySearchInput {
  array: number[];
  target: number;
}

/**
 * Snapshot state for a binary-search step: the array plus the live search
 * window (`lo..hi`), the current probe (`mid`, `null` before the first / after
 * the last compare), and the found index (`null` until/unless the target hits).
 */
export interface BinarySearchState {
  array: number[];
  lo: number;
  mid: number | null;
  hi: number;
  foundIndex: number | null;
}

/** Hard cap on custom-array length (CLAUDE.md / site spec §11.4: arrays ≤ 30). */
const MAX_ARRAY_LENGTH = 30;

/** Builds `range` highlights over the inclusive window `lo..hi` (empty when lo > hi). */
function rangeHighlight(lo: number, hi: number): Highlight {
  const ids: string[] = [];
  for (let i = lo; i <= hi; i += 1) ids.push(cellId(i));
  return { kind: 'range', ids };
}

/**
 * Runs binary search on `input.array` for `input.target`, emitting one `Step`
 * per compare. Each step deep-copies its state via `snapshot()` so earlier
 * windows are never corrupted by later mutations (site spec §11.4).
 *
 * - Present target → final step carries a `found` highlight on the hit index.
 * - Absent target → final step has an empty range and a "not in the array"
 *   explanation, with no `found` highlight anywhere.
 */
function run(input: BinarySearchInput): Trace<BinarySearchState> {
  const { array, target } = input;
  const trace: Trace<BinarySearchState> = [];
  const metrics = { comparisons: 0 };

  let lo = 0;
  let hi = array.length - 1;

  /**
   * The comparison metric in words, e.g. `"1 comparison"` / `"3 comparisons"`.
   * The final step states it so the metrics pill's payoff also reaches the
   * `aria-live` explanation and the SVG `<desc>` (A11Y-2).
   */
  const comparisonCount = (): string =>
    `${metrics.comparisons} comparison${metrics.comparisons === 1 ? '' : 's'}`;

  /** Pushes a deep-copied step; metrics spread is a shallow copy of flat counters. */
  const push = (
    state: BinarySearchState,
    explanation: string,
    highlights: Highlight[],
  ): void => {
    trace.push({
      state: snapshot(state),
      explanation,
      highlights,
      metrics: { ...metrics },
    } satisfies Step<BinarySearchState>);
  };

  // Step 0: the initial state — full array is the search window, no probe yet.
  push(
    { array, lo, mid: null, hi, foundIndex: null },
    array.length === 0
      ? `The array is empty, so ${target} cannot be found.`
      : `Ready. Searching for ${target} in a sorted array of ${array.length} ${
          array.length === 1 ? 'item' : 'items'
        }. The whole array is the search window.`,
    array.length === 0 ? [] : [rangeHighlight(lo, hi)],
  );

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const midValue = array[mid] as number;
    metrics.comparisons += 1;

    if (midValue === target) {
      // Found: final step highlights the hit cell.
      push(
        { array, lo, mid, hi, foundIndex: mid },
        `Middle index ${mid} holds ${midValue}, which equals the target. Found ${target} at index ${mid} after ${comparisonCount()}.`,
        [{ kind: 'found', ids: [cellId(mid)] }],
      );
      return trace;
    }

    if (midValue < target) {
      // Compare, then discard the lower half.
      push(
        { array, lo, mid, hi, foundIndex: null },
        `Search window is indices ${lo}–${hi}; middle index ${mid} holds ${midValue}, which is less than ${target}. Discard the left half and search the right.`,
        [rangeHighlight(lo, hi), { kind: 'active', ids: [cellId(mid)] }],
      );
      lo = mid + 1;
    } else {
      // Compare, then discard the upper half.
      push(
        { array, lo, mid, hi, foundIndex: null },
        `Search window is indices ${lo}–${hi}; middle index ${mid} holds ${midValue}, which is greater than ${target}. Discard the right half and search the left.`,
        [rangeHighlight(lo, hi), { kind: 'active', ids: [cellId(mid)] }],
      );
      hi = mid - 1;
    }
  }

  // Exhausted: the window collapsed (lo > hi) without a hit.
  push(
    { array, lo, mid: null, hi, foundIndex: null },
    `Search window is empty — ${target} is not in the array after ${comparisonCount()}.`,
    [],
  );
  return trace;
}

/**
 * Parses the custom-input box, e.g. `"[1,3,5,7] target=5"`, into typed input.
 * Returns `{ error }` with a friendly message (never throws) for each failure,
 * enforcing the ≤ 30 cap and the sorted precondition the lesson teaches.
 */
function parseInput(raw: string): BinarySearchInput | { error: string } {
  const text = raw.trim();

  // Pull the "[...]" array literal and the "target=<int>" tail.
  const arrayMatch = text.match(/\[([^\]]*)\]/);
  const targetMatch = text.match(/target\s*=\s*(-?\d+)/i);

  if (!arrayMatch) {
    return { error: 'Type an array and target, e.g. [1,3,5,7] target=5' };
  }
  if (!targetMatch) {
    return { error: 'Add a target, e.g. [1,3,5,7] target=5' };
  }

  const inner = arrayMatch[1]!.trim();
  const array: number[] = [];
  if (inner.length > 0) {
    for (const raw of inner.split(',')) {
      const token = raw.trim();
      // Whole numbers only — reject decimals, letters, empty cells.
      if (!/^-?\d+$/.test(token)) {
        return { error: 'Use whole numbers only, e.g. [1,3,5,7]' };
      }
      array.push(Number(token));
    }
  }

  if (array.length > MAX_ARRAY_LENGTH) {
    return { error: 'Keep the array to 30 numbers or fewer.' };
  }

  // Binary search's precondition: the array must be sorted ascending.
  // SPEC-GAP: the spec doesn't say whether to auto-sort or reject an unsorted
  // array. We REJECT because the lesson teaches the sorted precondition, so
  // surfacing it is the pedagogically correct behavior (architecture §7). Flag
  // for review.
  for (let i = 1; i < array.length; i += 1) {
    if (array[i]! < array[i - 1]!) {
      return {
        error: 'Binary search needs a sorted array — try [1,3,5,7].',
      };
    }
  }

  return { array, target: Number(targetMatch[1]) };
}

/**
 * Predict-the-Step choices, in fixed display order (§11.2 caps choices at 4 —
 * binary search is the algorithm that needs all four).
 */
const PREDICT_CHOICES = ['Go left', 'Go right', 'Found it', 'Not present'];

/**
 * The "what does the search do next?" question for step `i` (M8.2), graded
 * against `trace[i + 1]` — the step the Player already holds.
 *
 * The order of the checks below is LOAD-BEARING:
 *   1. no successor → `null` (the last step has nothing to predict);
 *   2. `foundIndex !== null` → the probe hit the target;
 *   3. `mid === null` → the empty-window terminal → the target is absent;
 *   4. otherwise compare the next probe's value against the target.
 * Reading `array[mid]` before check 3 would dereference `array[null]` on that
 * terminal step and misgrade "not present" as "go left".
 *
 * `lo`/`hi` are deliberately NOT consulted: `run` pushes each compare BEFORE it
 * narrows the window, so a `lo`/`hi` delta gives no signal on step 0 and
 * afterwards only restates the decision the current step's explanation has
 * already spelled out on screen.
 */
function predictStep(
  trace: Trace<BinarySearchState>,
  i: number,
  input: BinarySearchInput,
): PredictQuestion | null {
  const next = trace[i + 1];
  if (!next) return null;

  const { array, foundIndex, mid } = next.state;
  let correctIndex: number;
  if (foundIndex !== null) {
    correctIndex = 2;
  } else if (mid === null) {
    correctIndex = 3;
  } else {
    correctIndex = array[mid]! < input.target ? 1 : 0;
  }

  return {
    prompt: 'What does the search do next?',
    // A fresh array per call, so rendering one question can never mutate the
    // shared constant behind the next one.
    choices: [...PREDICT_CHOICES],
    correctIndex,
  };
}

/** The registered Binary Search algorithm. */
export const binarySearch: Algorithm<BinarySearchInput, BinarySearchState> = {
  id: 'binary-search',
  label: 'Binary search on a sorted array',
  run,
  defaultInput: () => ({ array: [1, 3, 5, 7, 9, 11], target: 7 }),
  parseInput,
  predictStep,
};

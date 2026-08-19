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
  LedgerSpec,
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

/**
 * Builds `range` highlights over the inclusive window `lo..hi` (empty when
 * lo > hi).
 *
 * The end labels travel WITH the highlight rather than living in the renderer:
 * ArrayRenderer draws the ranges of eight algorithms — linear search, the array
 * operations and the five sorts as well as this one — and only this one has a
 * `lo`/`hi` search window to name.
 */
function rangeHighlight(lo: number, hi: number): Highlight {
  const ids: string[] = [];
  for (let i = lo; i <= hi; i += 1) ids.push(cellId(i));
  return { kind: 'range', ids, meta: { startLabel: 'lo', endLabel: 'hi' } };
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
    // Describes the format the FIELD advertises, not the wire format: the
    // island wraps a bare comma-separated list before this ever runs, and the
    // old text told a reader with both fields filled in to fill in both fields.
    // Keeps the word "array" — `core/error-field` attributes this message to
    // the first field by finding it.
    return { error: 'Enter an array of whole numbers, e.g. 1,3,5,7' };
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

/** Asked on the one step that has no probe of its own yet: the initial state. */
const FIRST_PROBE_PROMPT = 'What happens at the first probe?';

/**
 * Asked on every step that has already resolved a comparison. "After this step"
 * is the load-bearing half — see {@link predictStep}.
 */
const NEXT_PROBE_PROMPT = 'After this step, what happens at the next probe?';

/**
 * The Predict-the-Step question for step `i` (M8.2), graded against
 * `trace[i + 1]` — the step the Player already holds.
 *
 * THE PROMPT NAMES WHICH PROBE IT ASKS ABOUT, and that is a correctness
 * requirement rather than a copy preference. Grading is deliberately one step
 * ahead (grading the CURRENT step would let the reader read the answer straight
 * off the explanation this strip sits above), which means that on every step
 * but the first, the screen ALREADY shows a resolved comparison *and names its
 * direction*: at index 1 of the authored run `[1,3,5,7,9,11] target=7` the
 * explanation reads "…Discard the left half and search the right." while the
 * graded answer is "Go left" — the direction of the probe that has not happened
 * yet. A prompt that said only "next" ("What does the search do next?") let a
 * reader answer the question the explanation had already answered and be marked
 * wrong for reading the screen correctly; on that three-question run it
 * punished correct reasoning twice. Hypercorrection fired on a wording trap
 * teaches the opposite of what predicting is for, so the prompt scopes itself
 * past the step on screen:
 *   - before any probe → {@link FIRST_PROBE_PROMPT};
 *   - after one        → {@link NEXT_PROBE_PROMPT}.
 * "Probe" is this page's own word for it — the Trace Trial below the
 * visualizer is titled "Two Probes, Fifteen Doors" and its hint reads "The
 * first probe is always the middle."
 *
 * The prompt deliberately does NOT restate the window the next probe runs in.
 * It could on most steps ("the window is now 3–5"), but the step before the
 * empty-window terminal has no window left to name, so that prompt's different
 * shape would itself be a tell for the "Not present" answer — one leak traded
 * for another. One wording for every resolved step keeps the retrieval act
 * whole: apply this step's decision, find the next middle, compare it with the
 * target.
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
  const current = trace[i];
  const next = trace[i + 1];
  if (!current || !next) return null;

  // The initial step is the only step with a successor and no probe of its own:
  // the other `mid === null` step is the empty-window terminal, and `run`
  // returns immediately after pushing that one, so it never has a successor.
  const beforeFirstProbe = current.state.mid === null;
  // …unless there is nothing to probe at all. On an empty array the successor
  // IS that terminal, step 0 already reads "The array is empty, so N cannot be
  // found" — the answer, in words, on screen — and "the first probe" would name
  // something that never happens. Nothing to retrieve, so nothing is asked.
  if (beforeFirstProbe && next.state.mid === null) return null;

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
    prompt: beforeFirstProbe ? FIRST_PROBE_PROMPT : NEXT_PROBE_PROMPT,
    // A fresh array per call, so rendering one question can never mutate the
    // shared constant behind the next one.
    choices: [...PREDICT_CHOICES],
    correctIndex,
  };
}

/** The registered Binary Search algorithm. */
/**
 * The ledger's value columns (Plan C §1): the search window and the probe.
 *
 * These are `lo`, `mid` and `hi` because the LESSON is: its prose introduces
 * exactly those three names, the renderer labels the range ends `lo` and `hi`,
 * and the code samples in all three languages declare the same three variables.
 * The table is the fourth view of one run, and it uses the run's own vocabulary.
 *
 * PROVENANCE RULE 1, in the one place it is actually shipped: every cell reads
 * `step.state` — the snapshot the algorithm emitted — and nothing else. Not the
 * highlights, which say the same thing in the renderer's language and could
 * disagree with it; not a re-derivation from the array and the target, which
 * would be this algorithm implemented a second time in a view.
 *
 * `mid` is `null` before the first compare, so step 1 renders `·` rather than a
 * number that would read as index 0. That is the whole reason `LedgerColumn.from`
 * may return `null`.
 */
const ledger: LedgerSpec<BinarySearchState> = {
  columns: [
    { label: 'lo', from: (step) => step.state.lo, numeric: true },
    { label: 'mid', from: (step) => step.state.mid, numeric: true },
    { label: 'hi', from: (step) => step.state.hi, numeric: true },
  ],
  // Named rather than left to the generic fallback, which surfaces every metric
  // key an algorithm emits: this one emits exactly `comparisons`, and saying so
  // keeps the column order fixed if it ever emits a second.
  costKey: 'comparisons',
};

export const binarySearch: Algorithm<BinarySearchInput, BinarySearchState> = {
  id: 'binary-search',
  label: 'Binary search on a sorted array',
  run,
  defaultInput: () => ({ array: [1, 3, 5, 7, 9, 11], target: 7 }),
  parseInput,
  predictStep,
  ledger,
};

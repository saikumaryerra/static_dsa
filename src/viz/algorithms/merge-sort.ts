/**
 * Merge Sort — instrumented algorithm (site spec §5 L13, §11.4). Top-down divide
 * and conquer: split the array in half, sort each half recursively, then merge the
 * two sorted runs back into place.
 *
 * TState is ArrayRenderer's bars variant shape ({ array: number[] }); ids are
 * `cellId(i)`. A `range` highlight frames the sub-array currently being divided or
 * merged; `active` marks each cell as a merged value is written into it; `found`
 * marks the whole array once sorted. The merge reads from snapshot COPIES of the
 * two runs, so writing back into `array` never corrupts the comparison logic.
 * Imports only core types + `snapshot` + the pure `cellId` helper (never a
 * renderer — architecture §3).
 */
import type { Algorithm, Highlight, Step, Trace } from '../core/types';
import { snapshot } from '../core/snapshot';
import { cellId } from '../core/ids';

/** Hard cap on array length (CLAUDE.md / site spec §11.4: arrays ≤ 30). */
const MAX_ARRAY_LENGTH = 30;

/** Typed input: the array to sort. */
export interface SortInput {
  array: number[];
}

/** Snapshot state ArrayRenderer's bars variant draws. */
export interface SortState {
  array: number[];
}

/** `range` highlight over the inclusive window `lo..hi`. */
function rangeH(lo: number, hi: number): Highlight {
  const ids: string[] = [];
  for (let i = lo; i <= hi; i += 1) ids.push(cellId(i));
  return { kind: 'range', ids };
}

/**
 * Runs top-down merge sort, emitting a `Step` per divide, merge, and placement.
 * Each step deep-copies its state via `snapshot()` (site spec §11.4).
 */
function run(input: SortInput): Trace<SortState> {
  const array = [...input.array];
  const n = array.length;
  const trace: Trace<SortState> = [];
  const metrics = { comparisons: 0 };

  /**
   * The comparison metric in words, e.g. `"1 comparison"` / `"11 comparisons"`.
   * The final step states it so the metrics pill's payoff also reaches the
   * `aria-live` explanation and the SVG `<desc>` (A11Y-2).
   */
  const comparisonCount = (): string =>
    `${metrics.comparisons} comparison${metrics.comparisons === 1 ? '' : 's'}`;

  const push = (explanation: string, highlights: Highlight[]): void => {
    trace.push({
      state: snapshot({ array }),
      explanation,
      highlights,
      metrics: { ...metrics },
    } satisfies Step<SortState>);
  };

  push(
    n <= 1
      ? 'An array of one item (or none) is already sorted — nothing to do.'
      : 'Merge sort: split the array in half, sort each half, then merge the two sorted halves back together.',
    n > 0 ? [rangeH(0, n - 1)] : [],
  );

  /** Merges the sorted runs `lo..mid` and `mid+1..hi` back into `array`. */
  const merge = (lo: number, mid: number, hi: number): void => {
    const left = array.slice(lo, mid + 1);
    const right = array.slice(mid + 1, hi + 1);
    push(
      `Merge the sorted runs ${lo}–${mid} and ${mid + 1}–${hi} back into order.`,
      [rangeH(lo, hi)],
    );
    let i = 0;
    let j = 0;
    let k = lo;
    while (i < left.length && j < right.length) {
      metrics.comparisons += 1;
      const leftFront = left[i]!;
      const rightFront = right[j]!;
      const takeLeft = leftFront <= rightFront;
      const value = takeLeft ? left[i++]! : right[j++]!;
      array[k] = value;
      push(
        `Compare run fronts ${leftFront} and ${rightFront}: the smaller is ${value}. Write it to index ${k}.`,
        [
          rangeH(lo, hi),
          { kind: 'active', ids: [cellId(k)], meta: { label: 'k' } },
        ],
      );
      k += 1;
    }
    while (i < left.length) {
      array[k] = left[i++]!;
      push(`Left run has ${array[k]} left over — write it to index ${k}.`, [
        rangeH(lo, hi),
        { kind: 'active', ids: [cellId(k)], meta: { label: 'k' } },
      ]);
      k += 1;
    }
    while (j < right.length) {
      array[k] = right[j++]!;
      push(`Right run has ${array[k]} left over — write it to index ${k}.`, [
        rangeH(lo, hi),
        { kind: 'active', ids: [cellId(k)], meta: { label: 'k' } },
      ]);
      k += 1;
    }
  };

  /** Recursively sorts `array[lo..hi]` in place. */
  const mergeSort = (lo: number, hi: number): void => {
    if (lo >= hi) return; // a run of length 0 or 1 is already sorted
    const mid = (lo + hi) >> 1;
    push(
      `Divide indices ${lo}–${hi} into halves ${lo}–${mid} and ${mid + 1}–${hi}.`,
      [rangeH(lo, hi)],
    );
    mergeSort(lo, mid);
    mergeSort(mid + 1, hi);
    merge(lo, mid, hi);
  };

  mergeSort(0, n - 1);

  push(
    n > 0
      ? `Sorted! Every value is in its final position after ${comparisonCount()}.`
      : 'Nothing to sort.',
    n > 0 ? [{ kind: 'found', ids: array.map((_, i) => cellId(i)) }] : [],
  );
  return trace;
}

/**
 * Parses the custom-input box, e.g. `"[5,2,9,1,7]"`, into the array to sort. The
 * generic form's `target=` field is ignored. Returns `{ error }` (never throws)
 * and enforces the ≤ 30 cap.
 */
function parseInput(raw: string): SortInput | { error: string } {
  const arrayMatch = raw.trim().match(/\[([^\]]*)\]/);
  if (!arrayMatch) {
    return { error: 'Type an array to sort, e.g. [5,2,9,1,7]' };
  }
  const inner = arrayMatch[1]!.trim();
  const array: number[] = [];
  if (inner.length > 0) {
    for (const token of inner.split(',')) {
      const t = token.trim();
      if (!/^-?\d+$/.test(t)) {
        return { error: 'Use whole numbers only, e.g. [5,2,9,1,7]' };
      }
      array.push(Number(t));
    }
  }
  if (array.length > MAX_ARRAY_LENGTH) {
    return { error: 'Keep the array to 30 numbers or fewer.' };
  }
  return { array };
}

/** The registered Merge Sort algorithm. */
export const mergeSort: Algorithm<SortInput, SortState> = {
  id: 'merge-sort',
  label: 'Merge sort',
  run,
  defaultInput: () => ({ array: [5, 2, 9, 1, 7, 3] }),
  parseInput,
};

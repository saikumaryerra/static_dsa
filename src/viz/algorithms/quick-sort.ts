/**
 * Quick Sort — instrumented algorithm (site spec §5 L13, §11.4). Divide and
 * conquer around a PIVOT: partition the sub-array so everything smaller than the
 * pivot is left of it and everything larger is right, then recurse on each side.
 * Uses the Lomuto scheme (pivot = last element), which the code sample mirrors.
 *
 * TState is ArrayRenderer's bars variant shape ({ array: number[] }); ids are
 * `cellId(i)`. A `range` highlight frames the sub-array being partitioned;
 * `active` marks the pivot, `compare` each element checked against it, `swap` each
 * exchange, and `found` the pivot's final resting index. Imports only core types +
 * `snapshot` + the pure `cellId` helper (never a renderer — architecture §3).
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

/** `active` highlight naming the pivot cell (so it stays visible during a scan). */
function pivotH(index: number): Highlight {
  return { kind: 'active', ids: [cellId(index)], meta: { label: 'pivot' } };
}

/**
 * Runs quick sort with Lomuto partitioning, emitting a `Step` per compare and
 * swap. Each step deep-copies its state via `snapshot()` (site spec §11.4).
 */
function run(input: SortInput): Trace<SortState> {
  const array = [...input.array];
  const n = array.length;
  const trace: Trace<SortState> = [];
  const metrics = { comparisons: 0, swaps: 0 };

  /**
   * The metrics pills in words, e.g. `"9 comparisons, 4 swaps"`. The final step
   * states them so the pills' payoff also reaches the `aria-live` explanation
   * and the SVG `<desc>` (A11Y-2).
   */
  const tally = (): string =>
    `${metrics.comparisons} comparison${metrics.comparisons === 1 ? '' : 's'}, ${metrics.swaps} swap${metrics.swaps === 1 ? '' : 's'}`;

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
      : 'Quick sort: pick a pivot, partition smaller values to its left and larger to its right, then recurse on each side.',
    n > 0 ? [rangeH(0, n - 1)] : [],
  );

  /** Lomuto partition of `array[lo..hi]`; returns the pivot's final index. */
  const partition = (lo: number, hi: number): number => {
    const pivot = array[hi]!;
    push(
      `Partition indices ${lo}–${hi} around pivot ${pivot} (the last element, index ${hi}).`,
      [rangeH(lo, hi), pivotH(hi)],
    );
    let i = lo; // boundary: array[lo..i-1] are all < pivot
    for (let j = lo; j < hi; j += 1) {
      metrics.comparisons += 1;
      push(`Compare index ${j} (${array[j]}) with pivot ${pivot}.`, [
        rangeH(lo, hi),
        { kind: 'compare', ids: [cellId(j), cellId(hi)] },
        pivotH(hi),
      ]);
      if (array[j]! < pivot) {
        if (i !== j) {
          const a = array[i]!;
          const b = array[j]!;
          array[i] = b;
          array[j] = a;
          metrics.swaps += 1;
          push(
            `${b} < ${pivot}: swap it into the smaller-than-pivot region at index ${i}.`,
            [
              rangeH(lo, hi),
              { kind: 'swap', ids: [cellId(i), cellId(j)] },
              pivotH(hi),
            ],
          );
        }
        i += 1;
      }
    }
    if (i !== hi) {
      const a = array[i]!;
      const b = array[hi]!;
      array[i] = b;
      array[hi] = a;
      metrics.swaps += 1;
      push(
        `Swap the pivot ${pivot} into index ${i} — its final sorted position.`,
        [{ kind: 'swap', ids: [cellId(i), cellId(hi)] }],
      );
    }
    push(
      `Pivot ${pivot} is fixed at index ${i}: everything left is smaller, everything right is larger.`,
      [rangeH(lo, hi), { kind: 'found', ids: [cellId(i)] }],
    );
    return i;
  };

  /** Recursively sorts `array[lo..hi]` in place. */
  const quickSort = (lo: number, hi: number): void => {
    if (lo >= hi) return; // a run of length 0 or 1 is already sorted
    const p = partition(lo, hi);
    quickSort(lo, p - 1);
    quickSort(p + 1, hi);
  };

  quickSort(0, n - 1);

  push(
    n > 0
      ? `Sorted! Every value is in its final position. ${tally()}.`
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

/** The registered Quick Sort algorithm. */
export const quickSort: Algorithm<SortInput, SortState> = {
  id: 'quick-sort',
  label: 'Quick sort (Lomuto partition)',
  run,
  defaultInput: () => ({ array: [5, 2, 9, 1, 7, 3] }),
  parseInput,
};

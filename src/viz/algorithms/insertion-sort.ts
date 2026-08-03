/**
 * Insertion Sort — instrumented algorithm (site spec §5 L12, §11.4). Grows a
 * sorted prefix by taking each next value and swapping it leftward until it sits
 * in the right spot. Uses the SWAP-BASED variant (adjacent swaps rather than a
 * held-out temp), so the single displayed array is always honest — no duplicate
 * or "hole" cell — and the code sample matches the visualization exactly.
 *
 * TState is ArrayRenderer's bars variant shape ({ array: number[] }); ids are
 * `cellId(i)`. A `range` highlight marks the sorted prefix `[0..i]` being extended
 * (so the unsorted suffix dims); `active` marks the value being inserted,
 * `compare` each check, `swap` each shift-left. Imports only core types +
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

/** `range` highlight over the inclusive window `lo..hi` (empty when `lo > hi`). */
function rangeH(lo: number, hi: number): Highlight {
  const ids: string[] = [];
  for (let i = lo; i <= hi; i += 1) ids.push(cellId(i));
  return { kind: 'range', ids };
}

/**
 * Runs swap-based insertion sort, emitting a `Step` per compare and swap. Each
 * step deep-copies its state via `snapshot()` (site spec §11.4). Structure mirrors
 * the code sample: an outer loop over each new value, an inner while that swaps it
 * left while it is smaller than the value before it.
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
      : 'Insertion sort: treat the first item as a sorted prefix, then insert each next value into its correct place by swapping it left.',
    n > 0 ? [rangeH(0, 0)] : [],
  );

  for (let i = 1; i < n; i += 1) {
    push(
      `Insert index ${i} (${array[i]}) into the sorted prefix ${0}–${i - 1}.`,
      [
        rangeH(0, i),
        { kind: 'active', ids: [cellId(i)], meta: { label: 'key' } },
      ],
    );
    let j = i;
    while (j > 0) {
      metrics.comparisons += 1;
      push(
        `Compare index ${j - 1} (${array[j - 1]}) with index ${j} (${array[j]}).`,
        [rangeH(0, i), { kind: 'compare', ids: [cellId(j - 1), cellId(j)] }],
      );
      if (array[j - 1]! > array[j]!) {
        const a = array[j - 1]!;
        const b = array[j]!;
        array[j - 1] = b;
        array[j] = a;
        metrics.swaps += 1;
        push(`${a} > ${b}: swap so ${b} moves one step left.`, [
          rangeH(0, i),
          { kind: 'swap', ids: [cellId(j - 1), cellId(j)] },
        ]);
        j -= 1;
      } else {
        push(
          `${array[j - 1]} ≤ ${array[j]}: it is in order, so index ${j} has found its place.`,
          [rangeH(0, i), { kind: 'found', ids: [cellId(j)] }],
        );
        break;
      }
    }
    if (j === 0) {
      push(`${array[0]} reached the front — it is the smallest so far.`, [
        rangeH(0, i),
        { kind: 'found', ids: [cellId(0)] },
      ]);
    }
  }

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

/** The registered Insertion Sort algorithm. */
export const insertionSort: Algorithm<SortInput, SortState> = {
  id: 'insertion-sort',
  label: 'Insertion sort',
  run,
  defaultInput: () => ({ array: [5, 2, 9, 1, 7, 3] }),
  parseInput,
};

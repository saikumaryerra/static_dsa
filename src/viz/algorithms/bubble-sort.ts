/**
 * Bubble Sort — instrumented algorithm (site spec §5 L12, §11.4). Repeatedly
 * compares each adjacent pair and swaps them when out of order, so the largest
 * remaining value "bubbles" to the end of the unsorted region each pass.
 *
 * TState is ArrayRenderer's bars variant shape ({ array: number[] }); ids are
 * `cellId(i)` (`"i3"`). A `range` highlight marks the still-unsorted window each
 * step (so the sorted tail dims as "locked"), with `compare`/`swap` on the two
 * cells in play and `found` on each newly locked value. Imports only core types +
 * `snapshot` + the pure `cellId` helper (never a renderer — architecture §3).
 */
import type { Algorithm, Highlight, Step, Trace } from '../core/types';
import { snapshot } from '../core/snapshot';
import { cellId } from '../core/ids';
import { predictAdjacentSwap } from './predictors';

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
 * Runs bubble sort, emitting a `Step` per compare and swap. Each step deep-copies
 * its state via `snapshot()` (site spec §11.4). Structure mirrors the code sample:
 * an outer pass loop with an early exit when a pass makes no swaps.
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
      : 'Bubble sort: compare each adjacent pair and swap them when out of order, so the largest value bubbles to the end each pass.',
    n > 0 ? [rangeH(0, n - 1)] : [],
  );

  for (let pass = 0; pass < n - 1; pass += 1) {
    const last = n - 1 - pass; // indices > last are already in final position
    let swapped = false;
    for (let j = 0; j < last; j += 1) {
      metrics.comparisons += 1;
      push(
        `Compare index ${j} (${array[j]}) and index ${j + 1} (${array[j + 1]}).`,
        [rangeH(0, last), { kind: 'compare', ids: [cellId(j), cellId(j + 1)] }],
      );
      if (array[j]! > array[j + 1]!) {
        const a = array[j]!;
        const b = array[j + 1]!;
        array[j] = b;
        array[j + 1] = a;
        metrics.swaps += 1;
        swapped = true;
        push(`${a} > ${b}: swap them so the larger value moves right.`, [
          rangeH(0, last),
          { kind: 'swap', ids: [cellId(j), cellId(j + 1)] },
        ]);
      }
    }
    push(
      `End of pass ${pass + 1}: ${array[last]} is now in its final position.`,
      [rangeH(0, last - 1), { kind: 'found', ids: [cellId(last)] }],
    );
    if (!swapped) {
      push('A full pass made no swaps — the array is already sorted.', []);
      break;
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

/** The registered Bubble Sort algorithm. */
export const bubbleSort: Algorithm<SortInput, SortState> = {
  id: 'bubble-sort',
  label: 'Bubble sort',
  run,
  defaultInput: () => ({ array: [5, 2, 9, 1, 7, 3] }),
  parseInput,
  // M8.2: an adjacent-swap sort — the swap step immediately follows its own
  // compare, so the cumulative `swaps` delta grades that compare honestly.
  predictStep: predictAdjacentSwap,
};

/**
 * Selection Sort — instrumented algorithm (site spec §5 L12, §11.4). Grows a
 * sorted prefix: each pass scans the unsorted suffix for its minimum, then swaps
 * that minimum into the boundary position.
 *
 * TState is ArrayRenderer's bars variant shape ({ array: number[] }); ids are
 * `cellId(i)`. A `range` highlight marks the unsorted suffix (so the sorted prefix
 * dims as "locked"); `active` marks the running minimum, `compare` each scan,
 * `swap` the placement, and `found` the newly locked value. Imports only core
 * types + `snapshot` + the pure `cellId` helper (never a renderer — §3).
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
 * Runs selection sort, emitting a `Step` per compare and swap. Each step
 * deep-copies its state via `snapshot()` (site spec §11.4). Structure mirrors the
 * code sample: an outer boundary loop, an inner scan for the minimum, one swap.
 */
function run(input: SortInput): Trace<SortState> {
  const array = [...input.array];
  const n = array.length;
  const trace: Trace<SortState> = [];
  const metrics = { comparisons: 0, swaps: 0 };

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
      : 'Selection sort: scan the unsorted part for its smallest value, then swap that value into the front of the unsorted part.',
    n > 0 ? [rangeH(0, n - 1)] : [],
  );

  for (let i = 0; i < n - 1; i += 1) {
    let minIdx = i;
    push(
      `Start of pass ${i + 1}: assume index ${i} (${array[i]}) is the smallest in indices ${i}–${n - 1}.`,
      [
        rangeH(i, n - 1),
        { kind: 'active', ids: [cellId(minIdx)], meta: { label: 'min' } },
      ],
    );
    for (let j = i + 1; j < n; j += 1) {
      metrics.comparisons += 1;
      push(
        `Compare index ${j} (${array[j]}) with the current smallest, index ${minIdx} (${array[minIdx]}).`,
        [
          rangeH(i, n - 1),
          { kind: 'compare', ids: [cellId(minIdx), cellId(j)] },
          { kind: 'active', ids: [cellId(minIdx)], meta: { label: 'min' } },
        ],
      );
      if (array[j]! < array[minIdx]!) {
        minIdx = j;
        push(
          `${array[j]} is smaller — index ${j} is the new smallest so far.`,
          [
            rangeH(i, n - 1),
            { kind: 'active', ids: [cellId(minIdx)], meta: { label: 'min' } },
          ],
        );
      }
    }
    if (minIdx !== i) {
      const a = array[i]!;
      const b = array[minIdx]!;
      array[i] = b;
      array[minIdx] = a;
      metrics.swaps += 1;
      push(`Swap the smallest value ${b} (index ${minIdx}) into index ${i}.`, [
        { kind: 'swap', ids: [cellId(i), cellId(minIdx)] },
      ]);
    }
    push(`Index ${i} is now locked: ${array[i]} is in its final position.`, [
      rangeH(i + 1, n - 1),
      { kind: 'found', ids: [cellId(i)] },
    ]);
  }

  push(
    n > 0
      ? 'Sorted! Every value is in its final position.'
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

/** The registered Selection Sort algorithm. */
export const selectionSort: Algorithm<SortInput, SortState> = {
  id: 'selection-sort',
  label: 'Selection sort',
  run,
  defaultInput: () => ({ array: [5, 2, 9, 1, 7, 3] }),
  parseInput,
};

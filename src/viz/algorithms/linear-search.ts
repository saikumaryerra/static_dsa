/**
 * Linear Search — instrumented algorithm (site spec §5 L2, architecture §6 phase 2).
 *
 * THE SEAM PROOF: this file plus ONE line in `registry.ts` is the entire cost of
 * adding an algorithm that reuses an existing renderer (`renderer="array"`).
 * Nothing else in the codebase changes — the `.astro`, the Player, the renderer,
 * and the core are all untouched (architecture §1 "add algorithm = 1 file + 1 line").
 *
 * Scans left to right emitting one `Step` per probe. Reuses `ArrayRenderer`'s
 * highlight contract: `range` = the not-yet-scanned window `[i..end]` (so cells
 * left of `i` dim as "already rejected"), `active` = the current probe (named
 * caret "curr"), `found` = the hit. Imports only core types + `snapshot` + the
 * pure `cellId` string helper from `core/ids` (never a renderer — architecture §3).
 */
import type { Algorithm, Highlight, Step, Trace } from '../core/types';
import { snapshot } from '../core/snapshot';
import { cellId } from '../core/ids';

/** Typed input for linear search: any array (need not be sorted) + the target. */
export interface LinearSearchInput {
  array: number[];
  target: number;
}

/** Snapshot state: the array, the current probe index, and the found index. */
export interface LinearSearchState {
  array: number[];
  index: number | null;
  foundIndex: number | null;
}

/** Hard cap on custom-array length (CLAUDE.md / site spec §11.4: arrays ≤ 30). */
const MAX_ARRAY_LENGTH = 30;

/** `range` highlight over the inclusive not-yet-scanned window `lo..hi`. */
function windowHighlight(lo: number, hi: number): Highlight {
  const ids: string[] = [];
  for (let i = lo; i <= hi; i += 1) ids.push(cellId(i));
  return { kind: 'range', ids };
}

/**
 * Runs linear search on `input.array` for `input.target`, emitting one `Step`
 * per probe. Each step deep-copies its state via `snapshot()` (site spec §11.4).
 */
function run(input: LinearSearchInput): Trace<LinearSearchState> {
  const { array, target } = input;
  const trace: Trace<LinearSearchState> = [];
  const metrics = { comparisons: 0 };
  const last = array.length - 1;

  /**
   * The comparison metric in words, e.g. `"1 comparison"` / `"3 comparisons"`.
   * The final step states it so the metrics pill's payoff also reaches the
   * `aria-live` explanation and the SVG `<desc>` (A11Y-2).
   */
  const comparisonCount = (): string =>
    `${metrics.comparisons} comparison${metrics.comparisons === 1 ? '' : 's'}`;

  const push = (
    state: LinearSearchState,
    explanation: string,
    highlights: Highlight[],
  ): void => {
    trace.push({
      state: snapshot(state),
      explanation,
      highlights,
      metrics: { ...metrics },
    } satisfies Step<LinearSearchState>);
  };

  // Step 0: nothing probed yet; the whole array is the window to scan.
  push(
    { array, index: null, foundIndex: null },
    array.length === 0
      ? `The array is empty, so ${target} cannot be found.`
      : `Ready. Scanning left to right for ${target} in an array of ${array.length} ${
          array.length === 1 ? 'item' : 'items'
        }.`,
    array.length === 0 ? [] : [windowHighlight(0, last)],
  );

  for (let i = 0; i <= last; i += 1) {
    const value = array[i] as number;
    metrics.comparisons += 1;

    if (value === target) {
      push(
        { array, index: i, foundIndex: i },
        `Index ${i} holds ${value}, which equals the target. Found ${target} at index ${i} after ${comparisonCount()}.`,
        [{ kind: 'found', ids: [cellId(i)] }],
      );
      return trace;
    }

    push(
      { array, index: i, foundIndex: null },
      `Index ${i} holds ${value}, which is not ${target}. Move on to the next item.`,
      [
        windowHighlight(i, last),
        { kind: 'active', ids: [cellId(i)], meta: { label: 'curr' } },
      ],
    );
  }

  // Exhausted the array with no hit.
  push(
    { array, index: null, foundIndex: null },
    `Reached the end without a match — ${target} is not in the array after ${comparisonCount()}.`,
    [],
  );
  return trace;
}

/**
 * Parses `"[1,4,2] target=2"` into typed input. Returns `{ error }` (never
 * throws). Unlike binary search, NO sorted precondition — linear search works on
 * any order — but the ≤ 30 cap and whole-number rule still apply.
 */
function parseInput(raw: string): LinearSearchInput | { error: string } {
  const text = raw.trim();
  const arrayMatch = text.match(/\[([^\]]*)\]/);
  const targetMatch = text.match(/target\s*=\s*(-?\d+)/i);

  if (!arrayMatch) {
    // Same rewrite as binary search's, for the same reason: the field's help
    // text promises a bare comma-separated list, so the fallback must describe
    // that. Keeps the word "array" so `core/error-field` still blames field one.
    return { error: 'Enter an array of whole numbers, e.g. 4,1,7,2' };
  }
  if (!targetMatch) {
    return { error: 'Add a target, e.g. [4,1,7,2] target=7' };
  }

  const inner = arrayMatch[1]!.trim();
  const array: number[] = [];
  if (inner.length > 0) {
    for (const token of inner.split(',')) {
      const t = token.trim();
      if (!/^-?\d+$/.test(t)) {
        return { error: 'Use whole numbers only, e.g. [4,1,7,2]' };
      }
      array.push(Number(t));
    }
  }

  if (array.length > MAX_ARRAY_LENGTH) {
    return { error: 'Keep the array to 30 numbers or fewer.' };
  }

  return { array, target: Number(targetMatch[1]) };
}

/** The registered Linear Search algorithm. */
export const linearSearch: Algorithm<LinearSearchInput, LinearSearchState> = {
  id: 'linear-search',
  label: 'Linear search through an array',
  run,
  defaultInput: () => ({ array: [8, 3, 5, 9, 1, 7], target: 9 }),
  parseInput,
};

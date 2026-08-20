/**
 * Heap Operations — instrumented demo for the Heaps lesson (site spec §5 L8,
 * §11.4). Builds a binary MAX-heap by inserting each value and sifting it up:
 *   1. INSERT — append the value at the end of the backing array (the next open
 *      leaf of the complete binary tree).
 *   2. SIFT-UP — while the new node is larger than its parent, swap them; this
 *      restores the heap property (every parent ≥ its children) after each add.
 *
 * TState matches HeapRenderer's `HeapState` ({ heap; size; comparing?;
 * swapping? }); index `i` is BOTH the tree node and the array cell, so a compare
 * or swap shows in both views joined by a tether. `comparing`/`swapping` carry
 * the index pair; `active` marks a freshly inserted leaf. Imports only core types
 * + `snapshot` + the pure `cellId` helper (never a renderer — architecture §3).
 */
import type { Algorithm, Highlight, Step, Trace } from '../core/types';
import { snapshot } from '../core/snapshot';
import { cellId } from '../core/ids';

/** Sanity cap: a heap tree fans out fast, so keep it small enough to read. */
const MAX_ITEMS = 15;

/** Typed input: the values to insert, in order, into an initially empty heap. */
export interface HeapOperationsInput {
  values: number[];
}

/** Snapshot state HeapRenderer draws. */
export interface HeapOperationsState {
  heap: number[];
  size: number;
  comparing?: number[];
  swapping?: number[];
}

/** The parent index of node `i` in an array-backed binary heap. */
const parentOf = (i: number): number => (i - 1) >> 1;

/**
 * Runs the build-a-max-heap demo, emitting one `Step` per insert, compare, and
 * swap. Each step deep-copies its state via `snapshot()` (site spec §11.4). The
 * sift-up loop mirrors the lesson's code samples exactly.
 */
function run(input: HeapOperationsInput): Trace<HeapOperationsState> {
  const heap: number[] = [];
  const trace: Trace<HeapOperationsState> = [];
  const metrics = { comparisons: 0, swaps: 0 };

  /**
   * The metrics pills in words, e.g. `"9 comparisons, 4 swaps"`. The final step
   * states them so the pills' payoff also reaches the `aria-live` explanation
   * and the SVG `<desc>` (A11Y-2).
   */
  const tally = (): string =>
    `${metrics.comparisons} comparison${metrics.comparisons === 1 ? '' : 's'}, ${metrics.swaps} swap${metrics.swaps === 1 ? '' : 's'}`;

  const push = (
    explanation: string,
    highlights: Highlight[],
    extra: Pick<HeapOperationsState, 'comparing' | 'swapping'> = {},
  ): void => {
    trace.push({
      state: snapshot({ heap, size: heap.length, ...extra }),
      explanation,
      highlights,
      metrics: { ...metrics },
    } satisfies Step<HeapOperationsState>);
  };

  push(
    'An empty max-heap. Insert each value at the end, then sift it up while it is larger than its parent — that keeps every parent ≥ its children.',
    [],
  );

  for (const value of input.values) {
    heap.push(value);
    let i = heap.length - 1;
    push(
      `Insert ${value} at index ${i}, the next open leaf of the complete binary tree.`,
      [{ kind: 'active', ids: [cellId(i)] }],
    );

    // Sift-up: swap with the parent while the heap property is violated.
    while (i > 0) {
      const parent = parentOf(i);
      metrics.comparisons += 1;
      push(
        `Compare index ${i} (${heap[i]}) with its parent at index ${parent} (${heap[parent]}).`,
        [{ kind: 'compare', ids: [cellId(i), cellId(parent)] }],
        { comparing: [i, parent] },
      );

      if (heap[i]! > heap[parent]!) {
        const child = heap[i]!;
        const par = heap[parent]!;
        heap[i] = par;
        heap[parent] = child;
        metrics.swaps += 1;
        push(
          `${child} > ${par}: swap index ${i} and index ${parent} to move ${child} up toward the root.`,
          [{ kind: 'swap', ids: [cellId(i), cellId(parent)] }],
          { swapping: [i, parent] },
        );
        i = parent;
      } else {
        push(
          `${heap[i]} is not larger than its parent ${heap[parent]} — the heap property holds, so stop sifting.`,
          [{ kind: 'active', ids: [cellId(i)] }],
        );
        break;
      }
    }
  }

  push(
    heap.length > 0
      ? `Done — the max-heap is complete: every parent is ≥ its children, and the largest value (${heap[0]}) sits at the root. ${tally()}.`
      : 'Done. The heap is empty.',
    heap.length > 0 ? [{ kind: 'active', ids: [cellId(0)] }] : [],
  );

  return trace;
}

/**
 * Parses the custom-input box, e.g. `"[5,9,3,12,8,15]"`, into the values to
 * insert. The generic form's `target=` field is ignored. Returns `{ error }`
 * (never throws) and enforces the item cap.
 */
function parseInput(raw: string): HeapOperationsInput | { error: string } {
  const text = raw.trim();
  const arrayMatch = text.match(/\[([^\]]*)\]/);

  if (!arrayMatch) {
    return { error: 'Type values to insert, e.g. [5,9,3,12,8,15]' };
  }

  const inner = arrayMatch[1]!.trim();
  const values: number[] = [];
  if (inner.length > 0) {
    for (const token of inner.split(',')) {
      const t = token.trim();
      if (!/^-?\d+$/.test(t)) {
        return { error: 'Use whole numbers only, e.g. [5,9,3,12,8,15]' };
      }
      values.push(Number(t));
    }
  }

  if (values.length === 0) {
    return { error: 'Add at least one value, e.g. [5,9,3,12,8,15]' };
  }
  if (values.length > MAX_ITEMS) {
    return { error: `Keep it to ${MAX_ITEMS} values or fewer.` };
  }

  return { values };
}

/** The registered Heap Operations demo. */
export const heapOperations: Algorithm<
  HeapOperationsInput,
  HeapOperationsState
> = {
  id: 'heap-operations',
  label: 'Build a max-heap with sift-up',
  run,
  defaultInput: () => ({ values: [5, 9, 3, 12, 8, 15] }),
  parseInput,
};

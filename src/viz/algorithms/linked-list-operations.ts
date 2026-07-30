/**
 * Linked List Operations — instrumented demo for the Linked Lists lesson (site
 * spec §5 L3, §11.4). Runs a singly linked list through the three moves that make
 * pointers concrete:
 *   1. TRAVERSE — hop a `curr` pointer along `next` links (there is no random
 *      access, so reaching node k costs k hops, O(n)).
 *   2. INSERT-AFTER — splice a new node in by reassigning two `next` pointers, O(1).
 *   3. DELETE — unlink a node by pointing its predecessor's `next` past it, O(1).
 *
 * TState matches LinkedListRenderer's `LinkedListState`
 * ({ nodes, kind, pointers }). Named pointers (`head`, `curr`, `prev`) ride in
 * `state.pointers` so their carets persist; `insert`/`delete`/`visited` markers
 * ride in `step.highlights`. Imports only core types + `snapshot` + the pure
 * `nodeId` helper (never a renderer — architecture §3).
 */
import type { Algorithm, Highlight, Step, Trace } from '../core/types';
import { snapshot } from '../core/snapshot';
import { nodeId } from '../core/ids';

/** Hard cap on node count (site spec §11.4: keep structures small). */
const MAX_NODES = 30;

/** A named pointer into the list (mirrors LinkedListRenderer's `ListPointer`). */
export interface ListPointer {
  name: string;
  index: number | null;
}

/** Typed input: the starting values plus where the scripted demo acts. */
export interface LinkedListOperationsInput {
  values: number[];
  traverseTo: number;
  insertValue: number;
  deleteIndex: number;
}

/** Snapshot state LinkedListRenderer draws. */
export interface LinkedListOperationsState {
  nodes: { value: number }[];
  kind: 'singly';
  pointers?: ListPointer[];
}

/** Clamp `i` into `[min, max]` (truncating fractions). */
const clamp = (i: number, min: number, max: number): number =>
  Math.min(Math.max(Math.trunc(i), min), max);

/**
 * Runs the traverse → insert-after → delete demo, emitting one `Step` per hop or
 * pointer reassignment. Each step deep-copies its state via `snapshot()` (site
 * spec §11.4). The working list mirrors exactly what the lesson's code samples do.
 */
function run(
  input: LinkedListOperationsInput,
): Trace<LinkedListOperationsState> {
  const nodes = input.values.map((value) => ({ value }));
  const trace: Trace<LinkedListOperationsState> = [];
  const metrics = { hops: 0 };

  const push = (
    pointers: ListPointer[],
    explanation: string,
    highlights: Highlight[],
  ): void => {
    trace.push({
      state: snapshot({ nodes: [...nodes], kind: 'singly', pointers }),
      explanation,
      highlights,
      metrics: { ...metrics },
    } satisfies Step<LinkedListOperationsState>);
  };

  // Step 0: the list as it starts.
  if (nodes.length === 0) {
    push(
      [{ name: 'head', index: null }],
      'An empty list — head points to null.',
      [],
    );
    return trace;
  }
  push(
    [{ name: 'head', index: 0 }],
    `A singly linked list: each node holds a value and a next pointer to the following node. head points to node 0 (${nodes[0]!.value}).`,
    [],
  );

  // --- 1. Traverse: hop curr from the head to the target index ---
  const target = clamp(input.traverseTo, 0, nodes.length - 1);
  push(
    [
      { name: 'head', index: 0 },
      { name: 'curr', index: 0 },
    ],
    `Start at head: curr = node 0 (${nodes[0]!.value}). There is no index jump — to reach a later node we must follow next pointers.`,
    [],
  );
  for (let i = 1; i <= target; i += 1) {
    metrics.hops += 1;
    push(
      [
        { name: 'head', index: 0 },
        { name: 'curr', index: i },
      ],
      `Follow node ${i - 1}'s next pointer: curr = node ${i} (${nodes[i]!.value}).`,
      [{ kind: 'visited', ids: [nodeId(i - 1)] }],
    );
  }

  // --- 2. Insert after curr: splice a new node in with two pointer changes ---
  const insertAt = target + 1; // the new node's index, right after curr
  nodes.splice(insertAt, 0, { value: input.insertValue });
  push(
    [
      { name: 'head', index: 0 },
      { name: 'curr', index: target },
    ],
    `Insert ${input.insertValue} after curr (node ${target}). Point the new node's next to curr's old next, then point curr's next at the new node — only two links change, so this is O(1).`,
    [{ kind: 'insert', ids: [nodeId(insertAt)] }],
  );

  // --- 3. Delete: unlink a node by rerouting its predecessor's next past it ---
  // Clamp to a non-head node so the predecessor ("prev") reassignment holds.
  const deleteAt = clamp(input.deleteIndex, 1, nodes.length - 1);
  const prevAt = deleteAt - 1;
  const removedValue = nodes[deleteAt]!.value;
  push(
    [
      { name: 'head', index: 0 },
      { name: 'prev', index: prevAt },
    ],
    `Delete node ${deleteAt} (${removedValue}). Set node ${prevAt}'s next to node ${deleteAt}'s next, routing around the doomed node.`,
    [{ kind: 'delete', ids: [nodeId(deleteAt)] }],
  );
  nodes.splice(deleteAt, 1);
  const listText = nodes.map((node) => node.value).join(' → ');
  push(
    [{ name: 'head', index: 0 }],
    `Node ${removedValue} is unlinked and freed. The list is now ${listText} → null.`,
    [],
  );

  return trace;
}

/**
 * Parses the custom-input box, e.g. `"[12,34,56,78] target=2"`, into typed
 * input. The array literal seeds the list; the optional `target=` value picks how
 * far to traverse. The insert value and delete index are derived and clamped in
 * `run`. Returns `{ error }` (never throws) and enforces the node cap.
 */
function parseInput(
  raw: string,
): LinkedListOperationsInput | { error: string } {
  const text = raw.trim();
  const arrayMatch = text.match(/\[([^\]]*)\]/);
  const targetMatch = text.match(/target\s*=\s*(-?\d+)/i);

  if (!arrayMatch) {
    return { error: 'Type a list, e.g. [12,34,56,78]' };
  }

  const inner = arrayMatch[1]!.trim();
  const values: number[] = [];
  if (inner.length > 0) {
    for (const token of inner.split(',')) {
      const t = token.trim();
      if (!/^-?\d+$/.test(t)) {
        return { error: 'Use whole numbers only, e.g. [12,34,56,78]' };
      }
      values.push(Number(t));
    }
  }

  if (values.length === 0) {
    return { error: 'Add at least one node, e.g. [12,34,56,78]' };
  }
  if (values.length > MAX_NODES) {
    return { error: 'Keep the list to 30 nodes or fewer.' };
  }

  const traverseTo = targetMatch
    ? Number(targetMatch[1])
    : Math.min(1, values.length - 1);
  const insertValue = Math.max(...values) + 1;
  const deleteIndex = Math.min(2, values.length); // clamped to a real node in run

  return { values, traverseTo, insertValue, deleteIndex };
}

/** The registered Linked List Operations demo. */
export const linkedListOperations: Algorithm<
  LinkedListOperationsInput,
  LinkedListOperationsState
> = {
  id: 'linked-list-operations',
  label: 'Linked list traverse, insert, and delete',
  run,
  defaultInput: () => ({
    values: [12, 34, 56, 78],
    traverseTo: 1,
    insertValue: 40,
    deleteIndex: 3,
  }),
  parseInput,
};

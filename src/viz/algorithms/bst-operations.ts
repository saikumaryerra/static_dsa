/**
 * BST Operations — instrumented demo for the Trees & BSTs lesson (site spec §5
 * L7, §11.4). Runs a binary search tree through the two moves that make the BST
 * ordering invariant concrete:
 *   1. INSERT — for each value, descend from the root comparing (go left when
 *      smaller, right when larger) until an empty child slot is found, then
 *      attach the new node there. Repeated inserts build the whole tree.
 *   2. SEARCH — follow the root → target path, comparing at each node, ending in
 *      a `found` match or a "no such child" miss.
 *
 * TState matches TreeRenderer's `TreeState` ({ nodes:{id;value;left;right}[];
 * root }); a node's `id` is its insertion order. `active` marks the current node,
 * an edge id in a highlight becomes the descent path, `visited` marks passed
 * nodes, `insert` a new node, and `found` the match. Imports only core types +
 * `snapshot` + the pure `nodeId`/`edgeId` helpers (never a renderer — arch §3).
 */
import type { Algorithm, Highlight, Step, Trace } from '../core/types';
import { snapshot } from '../core/snapshot';
import { edgeId, nodeId } from '../core/ids';

/** Hard cap on node count (site spec §11.4: keep structures small). */
const MAX_NODES = 30;

/** A BST node (mirrors TreeRenderer's `TreeNode`; children referenced by id). */
export interface TreeNode {
  id: number;
  value: number;
  left: number | null;
  right: number | null;
}

/** Typed input: the insertion sequence plus an optional value to search for. */
export interface BstOperationsInput {
  values: number[];
  searchTarget: number | null;
}

/** Snapshot state TreeRenderer draws. */
export interface BstOperationsState {
  nodes: TreeNode[];
  root: number | null;
}

/**
 * Runs the build-then-search demo, emitting one `Step` per comparison, insert,
 * and search hop. Each step deep-copies its state via `snapshot()` (site spec
 * §11.4). The descent logic mirrors the lesson's recursive code samples exactly.
 */
function run(input: BstOperationsInput): Trace<BstOperationsState> {
  const nodes: TreeNode[] = [];
  const byId = new Map<number, TreeNode>();
  let root: number | null = null;
  const trace: Trace<BstOperationsState> = [];
  const metrics = { comparisons: 0 };

  const push = (explanation: string, highlights: Highlight[]): void => {
    trace.push({
      state: snapshot({ nodes, root }),
      explanation,
      highlights,
      metrics: { ...metrics },
    } satisfies Step<BstOperationsState>);
  };

  push(
    'Start with an empty tree. Each value is inserted so the BST rule holds: everything in a node’s left subtree is smaller, everything on the right is larger.',
    [],
  );

  // --- 1. Build the tree by inserting each value ---
  const insert = (value: number): void => {
    if (root === null) {
      const node: TreeNode = { id: 0, value, left: null, right: null };
      nodes.push(node);
      byId.set(0, node);
      root = 0;
      push(`Insert ${value} as the root of the tree.`, [
        { kind: 'insert', ids: [nodeId(0)] },
      ]);
      return;
    }

    let currId = root;
    const path: string[] = []; // edge ids traversed so far (the descent path)
    for (;;) {
      const node = byId.get(currId)!;
      metrics.comparisons += 1;
      const goLeft = value < node.value;
      const dir = goLeft ? 'left' : 'right';
      const cmp = goLeft ? '<' : '>';
      const childId = goLeft ? node.left : node.right;

      const pathHl: Highlight[] = path.length
        ? [{ kind: 'active', ids: [...path] }]
        : [];
      push(
        `Insert ${value}: compare with ${node.value}. ${value} ${cmp} ${node.value}, so go ${dir}.`,
        [{ kind: 'active', ids: [nodeId(currId)] }, ...pathHl],
      );

      if (childId === null) {
        const id = nodes.length;
        const newNode: TreeNode = { id, value, left: null, right: null };
        nodes.push(newNode);
        byId.set(id, newNode);
        if (goLeft) node.left = id;
        else node.right = id;
        path.push(edgeId(currId, id));
        push(
          `Node ${node.value} has no ${dir} child — attach ${value} as its ${dir} child.`,
          [
            { kind: 'insert', ids: [nodeId(id)] },
            { kind: 'active', ids: [...path] },
          ],
        );
        return;
      }

      path.push(edgeId(currId, childId));
      currId = childId;
    }
  };

  for (const value of input.values) insert(value);

  // --- 2. Search for the target along a single root → leaf path ---
  if (input.searchTarget !== null) {
    const target = input.searchTarget;
    if (root === null) {
      push(
        `Search for ${target}: the tree is empty, so ${target} is not present.`,
        [],
      );
      return trace;
    }

    push(
      `Now search for ${target}. Start at the root and compare, following the BST rule down one path.`,
      [{ kind: 'active', ids: [nodeId(root)] }],
    );

    let currId: number | null = root;
    const visited: string[] = [];
    const path: string[] = [];
    while (currId !== null) {
      const node: TreeNode = byId.get(currId)!;
      metrics.comparisons += 1;
      const visitedHl: Highlight[] = visited.length
        ? [{ kind: 'visited', ids: [...visited] }]
        : [];
      const pathHl: Highlight[] = path.length
        ? [{ kind: 'active', ids: [...path] }]
        : [];

      if (target === node.value) {
        push(`Compare ${target} with ${node.value} — match. Found ${target}.`, [
          { kind: 'found', ids: [nodeId(currId)] },
          ...visitedHl,
          ...pathHl,
        ]);
        return trace;
      }

      const goLeft = target < node.value;
      const dir = goLeft ? 'left' : 'right';
      const cmp = goLeft ? '<' : '>';
      const childId: number | null = goLeft ? node.left : node.right;

      if (childId === null) {
        push(
          `Compare ${target} with ${node.value}: ${target} ${cmp} ${node.value}, go ${dir} — but there is no ${dir} child. ${target} is not in the tree.`,
          [{ kind: 'active', ids: [nodeId(currId)] }, ...visitedHl, ...pathHl],
        );
        return trace;
      }

      push(
        `Compare ${target} with ${node.value}: ${target} ${cmp} ${node.value}, go ${dir}.`,
        [{ kind: 'active', ids: [nodeId(currId)] }, ...visitedHl, ...pathHl],
      );
      visited.push(nodeId(currId));
      path.push(edgeId(currId, childId));
      currId = childId;
    }
  }

  return trace;
}

/**
 * Parses the custom-input box, e.g. `"[50,30,70,20,40,60] target=40"`, into
 * typed input. The array literal is the insertion sequence; optional `target=`
 * is the value to search for (defaults to the last inserted value). Returns
 * `{ error }` (never throws), rejects duplicate values (a BST assumes distinct
 * keys), and enforces the node cap.
 */
function parseInput(raw: string): BstOperationsInput | { error: string } {
  const text = raw.trim();
  const arrayMatch = text.match(/\[([^\]]*)\]/);
  const targetMatch = text.match(/target\s*=\s*(-?\d+)/i);

  if (!arrayMatch) {
    return { error: 'Type an insertion sequence, e.g. [50,30,70,20,40]' };
  }

  const inner = arrayMatch[1]!.trim();
  const values: number[] = [];
  const seen = new Set<number>();
  if (inner.length > 0) {
    for (const token of inner.split(',')) {
      const t = token.trim();
      if (!/^-?\d+$/.test(t)) {
        return { error: 'Use whole numbers only, e.g. [50,30,70,20,40]' };
      }
      const value = Number(t);
      if (seen.has(value)) {
        return { error: 'Use distinct values — a BST assumes no duplicates.' };
      }
      seen.add(value);
      values.push(value);
    }
  }

  if (values.length === 0) {
    return { error: 'Add at least one value, e.g. [50,30,70,20,40]' };
  }
  if (values.length > MAX_NODES) {
    return { error: 'Keep it to 30 values or fewer.' };
  }

  const searchTarget = targetMatch
    ? Number(targetMatch[1])
    : values[values.length - 1]!;

  return { values, searchTarget };
}

/** The registered BST Operations demo. */
export const bstOperations: Algorithm<BstOperationsInput, BstOperationsState> =
  {
    id: 'bst-operations',
    label: 'Binary search tree: insert and search',
    run,
    defaultInput: () => ({
      values: [50, 30, 70, 20, 40, 60],
      searchTarget: 40,
    }),
    parseInput,
  };

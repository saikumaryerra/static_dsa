/**
 * Dev-only renderer fixtures (architecture §5 demo, design §4).
 *
 * DEVIATION (flagged): not in architecture §7's file list. The eight structural
 * renderers ship in M3 BEFORE their M4 lesson algorithms exist, but the dev
 * gallery drives every renderer through the REAL `<Visualizer>` (design §4), and
 * `<Visualizer>` needs a registered `Algorithm`. These are minimal hand-authored
 * fixtures — NOT lessons — used ONLY by `/dev/renderers` (prod-gated to /404), so
 * no production page references them. They double as end-to-end proof that each
 * renderer works through the whole trace-then-render pipeline. Each `run()`
 * ignores input; `parseInput` is unused (the gallery sets allowCustomInput=false).
 *
 * Imports only core types + `snapshot` + `core/ids` (never a renderer — §3).
 */
import type { Algorithm, Trace } from '../core/types';
import { snapshot } from '../core/snapshot';
import { cellId, curveId, edgeId, nodeId } from '../core/ids';

/** Builds a tiny fixture `Algorithm` from a fixed, pre-authored trace. */
function fixture<TState>(
  id: string,
  label: string,
  trace: Trace<TState>,
): Algorithm<Record<string, never>, TState> {
  return {
    id,
    label,
    run: () => trace.map((s) => ({ ...s, state: snapshot(s.state) })),
    defaultInput: () => ({}),
    parseInput: () => ({}),
  };
}

// --- stack ---
export const demoStack = fixture('demo-stack', 'Stack: push and pop', [
  {
    state: { items: [12, 34] },
    explanation: 'Stack of 2, top is 34.',
    highlights: [{ kind: 'pointer', ids: [`s1`], meta: { label: 'top' } }],
  },
  {
    state: { items: [12, 34, 56] },
    explanation: 'Pushing 56; top is now 56.',
    highlights: [
      { kind: 'insert', ids: [`s2`] },
      { kind: 'pointer', ids: [`s2`], meta: { label: 'top' } },
    ],
  },
  {
    // Element stays present DURING the pop so the ✕ marks the item being
    // removed (it leaves on the next conceptual step); keeps s2 in range.
    state: { items: [12, 34, 56] },
    explanation: 'Popping 56; the top item is being removed.',
    highlights: [{ kind: 'delete', ids: [`s2`] }],
  },
] as Trace<{ items: number[] }>);

// --- callStack ---
export const demoCallStack = fixture('demo-callstack', 'Call stack: fib(3)', [
  {
    state: { frames: [{ label: 'fib(3)', args: 'n=3', returnValue: null }] },
    explanation: 'Calling fib(3), args n=3. Stack depth 1.',
    highlights: [
      { kind: 'insert', ids: [`f0`] },
      { kind: 'pointer', ids: [`f0`], meta: { label: 'curr' } },
    ],
  },
  {
    state: {
      frames: [
        { label: 'fib(3)', args: 'n=3', returnValue: null },
        { label: 'fib(2)', args: 'n=2', returnValue: null },
      ],
    },
    explanation: 'Calling fib(2), args n=2. Stack depth 2.',
    highlights: [
      { kind: 'insert', ids: [`f1`] },
      { kind: 'pointer', ids: [`f1`], meta: { label: 'curr' } },
    ],
  },
  {
    // fib(2) stays present DURING its return so the ✕ marks the frame being
    // popped (it unwinds on the next conceptual step); keeps f1 in range.
    state: {
      frames: [
        { label: 'fib(3)', args: 'n=3', returnValue: null },
        { label: 'fib(2)', args: 'n=2', returnValue: '1' },
      ],
    },
    explanation: 'fib(2) returns 1; the frame is being popped.',
    highlights: [{ kind: 'delete', ids: [`f1`] }],
  },
] as Trace<{
  frames: { label: string; args?: string; returnValue?: string | null }[];
}>);

// --- queue (circular) ---
export const demoQueue = fixture(
  'demo-queue',
  'Circular queue: enqueue and wrap',
  [
    {
      state: {
        slots: [null, 34, 56, 78, null, null],
        head: 1,
        tail: 3,
        size: 3,
        circular: true,
      },
      explanation:
        'Queue capacity 6, 3 items, front at index 1, rear at index 3.',
      highlights: [
        { kind: 'pointer', ids: [`s1`], meta: { label: 'front' } },
        { kind: 'pointer', ids: [`s3`], meta: { label: 'rear' } },
      ],
    },
    {
      state: {
        slots: [90, null, null, null, 34, 56],
        head: 4,
        tail: 0,
        size: 3,
        circular: true,
      },
      explanation: 'Enqueuing 90 at index 0 — the rear wraps around.',
      highlights: [
        { kind: 'insert', ids: [`s0`] },
        { kind: 'pointer', ids: [`s4`], meta: { label: 'front' } },
        { kind: 'pointer', ids: [`s0`], meta: { label: 'rear' } },
      ],
    },
  ] as Trace<{
    slots: (number | null)[];
    head: number;
    tail: number;
    size: number;
    circular: boolean;
  }>,
);

// --- linkedList ---
export const demoLinkedList = fixture(
  'demo-linkedlist',
  'Linked list: insert after a pointer',
  [
    {
      state: {
        nodes: [{ value: 12 }, { value: 34 }, { value: 56 }],
        kind: 'singly',
        pointers: [
          { name: 'head', index: 0 },
          { name: 'p', index: 1 },
        ],
      },
      explanation: 'List: 12 → 34 → 56 → null. Pointer p at node 1 (34).',
      highlights: [{ kind: 'pointer', ids: [nodeId(1)], meta: { label: 'p' } }],
    },
    {
      state: {
        nodes: [{ value: 12 }, { value: 34 }, { value: 40 }, { value: 56 }],
        kind: 'singly',
        pointers: [{ name: 'head', index: 0 }],
      },
      explanation: 'Inserting 40 after node p; the list now has 4 nodes.',
      highlights: [{ kind: 'insert', ids: [nodeId(2)] }],
    },
  ] as Trace<{
    nodes: { value: number }[];
    kind: 'singly' | 'doubly';
    pointers?: { name: string; index: number | null }[];
  }>,
);

// --- chart (Big-O) ---
const growth = ['1', 'logn', 'n', 'nlogn', 'n2'] as const;
export const demoChart = fixture(
  'demo-chart',
  'Big-O growth rates',
  [10, 20, 30].map((n) => ({
    state: { n, maxN: 30, functions: [...growth] },
    explanation:
      `At n=${n}: O(n²) reaches ${n * n} operations, O(n log n) ${Math.round(n * Math.log2(n))}, ` +
      `O(n) ${n}, O(log n) ${Math.round(Math.log2(n))}, O(1) 1.`,
    highlights: [{ kind: 'active' as const, ids: [curveId('n2')] }],
  })) as Trace<{
    n: number;
    maxN: number;
    functions: ('1' | 'logn' | 'n' | 'nlogn' | 'n2')[];
  }>,
);

// --- tree (BST search) ---
const bst = [
  { id: 0, value: 50, left: 1, right: 2 },
  { id: 1, value: 30, left: 3, right: 4 },
  { id: 2, value: 70, left: 5, right: null },
  { id: 3, value: 20, left: null, right: null },
  { id: 4, value: 40, left: null, right: null },
  { id: 5, value: 60, left: null, right: null },
];
export const demoTree = fixture('demo-tree', 'Binary search tree: find 40', [
  {
    state: { nodes: bst, root: 0 },
    explanation: 'Visiting node 50; target 40 is smaller, so go left.',
    highlights: [
      { kind: 'active', ids: [nodeId(0)] },
      { kind: 'compare', ids: [nodeId(0), nodeId(1)] },
    ],
  },
  {
    state: { nodes: bst, root: 0 },
    explanation: 'At node 30; target 40 is larger, so go right to node 40.',
    highlights: [
      { kind: 'active', ids: [nodeId(1)] },
      { kind: 'visited', ids: [nodeId(0)] },
      { kind: 'active', ids: [edgeId(0, 1)] },
    ],
  },
  {
    state: { nodes: bst, root: 0 },
    explanation: 'Node 40 equals the target. Found 40.',
    highlights: [
      { kind: 'found', ids: [nodeId(4)] },
      { kind: 'active', ids: [edgeId(1, 4)] },
      { kind: 'visited', ids: [nodeId(0), nodeId(1)] },
    ],
  },
] as Trace<{
  nodes: {
    id: number;
    value: number;
    left: number | null;
    right: number | null;
  }[];
  root: number | null;
}>);

// --- heap ---
export const demoHeap = fixture(
  'demo-heap',
  'Max-heap: sift-down compare and swap',
  [
    {
      state: { heap: [3, 7, 6, 4, 5], size: 5, comparing: [0, 1] },
      explanation: 'Comparing index 0 (3) with index 1 (7); 7 is larger.',
      highlights: [{ kind: 'compare', ids: [cellId(0), cellId(1)] }],
    },
    {
      state: { heap: [7, 3, 6, 4, 5], size: 5, swapping: [0, 1] },
      explanation: 'Swapping index 0 and index 1 to restore the max-heap.',
      highlights: [{ kind: 'swap', ids: [cellId(0), cellId(1)] }],
    },
  ] as Trace<{
    heap: number[];
    size: number;
    comparing?: number[];
    swapping?: number[];
  }>,
);

// --- graph (traversal) ---
const graphNodes = [0, 1, 2, 3, 4, 5].map((id) => ({ id }));
const graphEdges = [
  { from: 0, to: 1, directed: true, weight: 4 },
  { from: 0, to: 2, directed: true, weight: 2 },
  { from: 1, to: 3, directed: true },
  { from: 2, to: 3, directed: true },
  { from: 3, to: 4, directed: true },
  { from: 4, to: 5, directed: true },
];
export const demoGraph = fixture(
  'demo-graph',
  'Graph traversal: visit and frontier',
  [
    {
      state: { nodes: graphNodes, edges: graphEdges },
      explanation:
        'At node 0 (visited). Neighbors 1 and 2 added to the frontier.',
      highlights: [
        { kind: 'visited', ids: [nodeId(0)] },
        { kind: 'frontier', ids: [nodeId(1), nodeId(2)] },
        { kind: 'active', ids: [edgeId(0, 1)] },
      ],
    },
    {
      state: { nodes: graphNodes, edges: graphEdges },
      explanation: 'At node 2 (active). Node 3 joins the frontier.',
      highlights: [
        { kind: 'visited', ids: [nodeId(0)] },
        { kind: 'active', ids: [nodeId(2)] },
        { kind: 'frontier', ids: [nodeId(1), nodeId(3)] },
      ],
    },
  ] as Trace<{
    nodes: { id: number; label?: string; pos?: { x: number; y: number } }[];
    edges: { from: number; to: number; weight?: number; directed?: boolean }[];
  }>,
);

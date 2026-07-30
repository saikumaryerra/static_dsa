/**
 * Viz registry — the M3 extension seam (site spec §11.3, architecture §4).
 *
 * Maps a string id to a LAZY dynamic-import thunk. Because each value is a
 * `() => import(...)` thunk, Vite emits a separate chunk per algorithm/renderer,
 * and the Visualizer island fetches only the two chunks a given lesson names —
 * so per-page JS scales with what the page uses, not the whole catalog (keeping
 * the ≤ 60 KB/page budget as lessons grow). The registry module itself is tiny.
 *
 * ── M3 extension contract (make "add an algorithm = one file + one line" true) ──
 *   To add an algorithm:
 *     1. Create `src/viz/algorithms/<id>.ts` exporting an `Algorithm`.
 *     2. Add ONE line to `algorithms` below: `'<id>': () => import(...).then(...)`.
 *   If it reuses an existing renderer, that's it — no other file changes.
 *   A new structure family also needs one renderer file + one line in `renderers`.
 *
 * Dependency direction: this module imports algorithms/renderers lazily; core
 * imports nothing from here (architecture §8).
 */
import type { Algorithm, RendererModule } from './core/types';

/** Algorithm id → thunk resolving to the `Algorithm` instance (own chunk). */
export const algorithms = {
  // renderer="array"
  'binary-search': () =>
    import('./algorithms/binary-search').then((m) => m.binarySearch),
  // renderer="array" — the seam proof: this line + one algorithm file, nothing else.
  'linear-search': () =>
    import('./algorithms/linear-search').then((m) => m.linearSearch),
  // M4 Foundations batch 1 (site spec §5 L1–L5).
  // renderer="chart"
  'growth-rates': () =>
    import('./algorithms/growth-rates').then((m) => m.growthRates),
  // renderer="array"
  'array-operations': () =>
    import('./algorithms/array-operations').then((m) => m.arrayOperations),
  // renderer="linkedList"
  'linked-list-operations': () =>
    import('./algorithms/linked-list-operations').then(
      (m) => m.linkedListOperations,
    ),
  // renderer="stack"
  'stack-operations': () =>
    import('./algorithms/stack-operations').then((m) => m.stackOperations),
  // renderer="queue"
  'queue-operations': () =>
    import('./algorithms/queue-operations').then((m) => m.queueOperations),
  // M4 Foundations batch 2 (site spec §5 L6–L9).
  // renderer="hashTable"
  'hash-table-operations': () =>
    import('./algorithms/hash-table-operations').then(
      (m) => m.hashTableOperations,
    ),
  // renderer="tree"
  'bst-operations': () =>
    import('./algorithms/bst-operations').then((m) => m.bstOperations),
  // renderer="heap"
  'heap-operations': () =>
    import('./algorithms/heap-operations').then((m) => m.heapOperations),
  // renderer="graph"
  'graph-representations': () =>
    import('./algorithms/graph-representations').then(
      (m) => m.graphRepresentations,
    ),
  // M4 Algorithms batch 3 (site spec §5 L10–L14).
  // renderer="callStack"
  'recursion-callstack': () =>
    import('./algorithms/recursion-callstack').then(
      (m) => m.recursionCallStack,
    ),
  // renderer="bars" — Sorting I
  'bubble-sort': () =>
    import('./algorithms/bubble-sort').then((m) => m.bubbleSort),
  'selection-sort': () =>
    import('./algorithms/selection-sort').then((m) => m.selectionSort),
  'insertion-sort': () =>
    import('./algorithms/insertion-sort').then((m) => m.insertionSort),
  // renderer="bars" — Sorting II
  'merge-sort': () =>
    import('./algorithms/merge-sort').then((m) => m.mergeSort),
  'quick-sort': () =>
    import('./algorithms/quick-sort').then((m) => m.quickSort),
  // renderer="graph" — Graph Traversal
  bfs: () => import('./algorithms/bfs').then((m) => m.bfs),
  dfs: () => import('./algorithms/dfs').then((m) => m.dfs),
  // Dev-only renderer fixtures for /dev/renderers (prod-gated). Not lessons.
  'demo-stack': () => import('./algorithms/demos').then((m) => m.demoStack),
  'demo-callstack': () =>
    import('./algorithms/demos').then((m) => m.demoCallStack),
  'demo-queue': () => import('./algorithms/demos').then((m) => m.demoQueue),
  'demo-linkedlist': () =>
    import('./algorithms/demos').then((m) => m.demoLinkedList),
  'demo-chart': () => import('./algorithms/demos').then((m) => m.demoChart),
  'demo-tree': () => import('./algorithms/demos').then((m) => m.demoTree),
  'demo-heap': () => import('./algorithms/demos').then((m) => m.demoHeap),
  'demo-graph': () => import('./algorithms/demos').then((m) => m.demoGraph),
  'demo-hashtable': () =>
    import('./algorithms/demos').then((m) => m.demoHashTable),
} satisfies Record<string, () => Promise<Algorithm<unknown, unknown>>>;

/** Renderer id → thunk resolving to the `RendererModule` (own chunk). */
export const renderers = {
  array: () => import('./renderers/ArrayRenderer').then((m) => m.arrayRenderer),
  bars: () => import('./renderers/ArrayRenderer').then((m) => m.barsRenderer),
  stack: () => import('./renderers/StackRenderer').then((m) => m.stackRenderer),
  callStack: () =>
    import('./renderers/CallStackRenderer').then((m) => m.callStackRenderer),
  queue: () => import('./renderers/QueueRenderer').then((m) => m.queueRenderer),
  linkedList: () =>
    import('./renderers/LinkedListRenderer').then((m) => m.linkedListRenderer),
  chart: () => import('./renderers/ChartRenderer').then((m) => m.chartRenderer),
  tree: () => import('./renderers/TreeRenderer').then((m) => m.treeRenderer),
  heap: () => import('./renderers/HeapRenderer').then((m) => m.heapRenderer),
  graph: () => import('./renderers/GraphRenderer').then((m) => m.graphRenderer),
  // Separate-chaining hash table (site spec §5 L6); reuses the LinkedList layout.
  hashTable: () =>
    import('./renderers/HashTableRenderer').then((m) => m.hashTableRenderer),
} satisfies Record<string, () => Promise<RendererModule<unknown>>>;

/** Exact string-literal union of registered algorithm ids. */
export type AlgorithmId = keyof typeof algorithms;
/** Exact string-literal union of registered renderer ids. */
export type RendererId = keyof typeof renderers;
